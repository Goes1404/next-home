import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A retentativa de `gravarMensagem` nunca duplica a mensagem.
 *
 * O caso real (achado E da revisão final da fase 1): o banco GRAVA a linha e
 * só a resposta se perde no caminho (o "Gateway Timeout" já visto em
 * produção). A retentativa manda o mesmo INSERT de novo. Com
 * `providerMessageId`, o índice único da 0027 recusa a segunda; sem ele —
 * mensagem do bot, do corretor, da campanha — nada recusava, e a conversa
 * ganhava a mesma fala duas vezes, que a IA lê como duas falas.
 *
 * O falso abaixo é um banco de verdade em miniatura: guarda as linhas, gera
 * `id` quando o insert não traz um, e recusa `id` repetido com 23505, como a
 * chave primária faz.
 */

type Linha = { id: string; provider_message_id: string | null };
const linhas: Linha[] = [];
/** Tentativas de insert que gravam e devolvem erro de rede mesmo assim. */
let gravaEPerdeResposta = 0;
let geradas = 0;
/** Tentativas de insert que falham por rede sem gravar nada. */
let falhaSemGravar = 0;
/** Roda entre a primeira e a segunda tentativa (a corrida da reentrega). */
let antesDaSegunda: (() => void) | null = null;
let tentativasDeInsert = 0;

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabela: string) => ({
      insert: (linha: Record<string, unknown>) => {
        const resolver = async () => {
          if (tabela !== "whatsapp_mensagens") return { data: null, error: null };
          tentativasDeInsert++;
          if (tentativasDeInsert === 2 && antesDaSegunda) antesDaSegunda();
          if (falhaSemGravar > 0) {
            falhaSemGravar--;
            return { data: null, error: { message: "Gateway Timeout" } };
          }
          const id = (linha.id as string | undefined) ?? `gerado-${++geradas}`;
          if (linhas.some((l) => l.id === id)) {
            return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint \"whatsapp_mensagens_pkey\"" } };
          }
          const pmid = (linha.provider_message_id as string | null) ?? null;
          if (pmid && linhas.some((l) => l.provider_message_id === pmid)) {
            return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint \"whatsapp_mensagens_provider_message_id_key\"" } };
          }
          linhas.push({ id, provider_message_id: (linha.provider_message_id as string | null) ?? null });
          if (gravaEPerdeResposta > 0) {
            gravaEPerdeResposta--;
            return { data: null, error: { message: "Gateway Timeout" } };
          }
          return { data: { id }, error: null };
        };
        return { select: () => ({ maybeSingle: resolver }) };
      },
      select: () => {
        const filtros: Record<string, unknown> = {};
        const leitura = {
          eq: (coluna: string, valor: unknown) => {
            filtros[coluna] = valor;
            return leitura;
          },
          maybeSingle: async () => {
            const achada = linhas.find((l) =>
              Object.entries(filtros).every(([c, v]) =>
                c === "conversa_id" ? true : (l as Record<string, unknown>)[c] === v,
              ),
            );
            return { data: achada ? { id: achada.id } : null, error: null };
          },
        };
        return leitura;
      },
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
    }),
  }),
}));

const { gravarMensagem } = await import("./repositorio");

const mensagemDoBot = {
  conversaId: "conversa-1",
  remetente: "bot" as const,
  conteudo: "Oi! Tudo bem?",
  conversaLiberada: true,
};

describe("gravarMensagem — retentativa idempotente", () => {
  beforeEach(() => {
    linhas.length = 0;
    gravaEPerdeResposta = 0;
    geradas = 0;
    falhaSemGravar = 0;
    antesDaSegunda = null;
    tentativasDeInsert = 0;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sem providerMessageId, a linha gravada com a resposta perdida não ganha irmã", async () => {
    gravaEPerdeResposta = 1;
    const r = await gravarMensagem(mensagemDoBot);
    expect(linhas).toHaveLength(1);
    expect(r).toEqual({ inedita: true, id: linhas[0].id });
  });

  it("com providerMessageId, idem — e a resposta é a linha que já estava lá", async () => {
    gravaEPerdeResposta = 1;
    const r = await gravarMensagem({ ...mensagemDoBot, remetente: "cliente", providerMessageId: "WAID-9" });
    expect(linhas).toHaveLength(1);
    expect(r).toEqual({ inedita: true, id: linhas[0].id });
  });

  it("reentrega concorrente durante a retentativa continua sendo reentrega", async () => {
    // A primeira tentativa falha SEM gravar; enquanto isso, a reentrega do
    // provedor grava a mesma mensagem por outro caminho. A segunda tentativa
    // bate no índice único do provider id: a linha é da outra entrega, não
    // nossa, e quem responde ao cliente é ela.
    falhaSemGravar = 1;
    antesDaSegunda = () => linhas.push({ id: "da-outra-entrega", provider_message_id: "WAID-7" });
    const r = await gravarMensagem({ ...mensagemDoBot, remetente: "cliente", providerMessageId: "WAID-7" });
    expect(r).toEqual({ inedita: false, id: null });
    expect(linhas).toHaveLength(1);
  });
});
