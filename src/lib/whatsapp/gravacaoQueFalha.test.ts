import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Gravação de mensagem e telemetria não engolem erro de insert (L26).
 *
 * Antes, `gravarMensagem` devolvia `inedita: true` para qualquer erro que
 * não fosse a reentrega (23505): o webhook seguia e a IA respondia ao
 * cliente por cima de uma mensagem que não estava no banco. E
 * `registrarInteracao` nem lia o `{ error }`: com dois grupos, o "falha em
 * voz alta" do gatilho de grupo (Review Focus 1) viraria silêncio, e o
 * medidor da fase 2 contaria menos do que aconteceu.
 */

type Resposta = { data: unknown; error: { code?: string; message: string } | null };
let respostaDoInsert: Resposta;
/** Respostas em ordem, uma por tentativa; vazia, vale `respostaDoInsert`. */
const respostasDoInsert: Resposta[] = [];
/** O que a releitura da mensagem por `provider_message_id` encontra. */
let mensagemJaGravada: { id: string } | null = null;
const inserts: { tabela: string; linha: unknown }[] = [];
const updates: string[] = [];

const proximaResposta = () => respostasDoInsert.shift() ?? respostaDoInsert;

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabela: string) => ({
      insert: (linha: unknown) => {
        inserts.push({ tabela, linha });
        const resposta = proximaResposta();
        const resultado = Promise.resolve(resposta);
        return Object.assign(resultado, {
          select: () => ({ maybeSingle: async () => resposta }),
        });
      },
      select: () => {
        const leitura = {
          eq: () => leitura,
          maybeSingle: async () => ({ data: mensagemJaGravada, error: null }),
        };
        return leitura;
      },
      update: () => {
        updates.push(tabela);
        return { eq: async () => ({ data: null, error: null }) };
      },
    }),
  }),
}));

const { gravarMensagem } = await import("./repositorio");
const { registrarInteracao } = await import("./telemetria");

const mensagem = {
  conversaId: "conversa-1",
  remetente: "cliente" as const,
  conteudo: "Oi",
  conversaLiberada: true,
  providerMessageId: "WAID-1",
};

describe("gravarMensagem", () => {
  beforeEach(() => {
    inserts.length = 0;
    updates.length = 0;
    respostasDoInsert.length = 0;
    mensagemJaGravada = null;
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  // Uma piscada do banco (Gateway Timeout, sem `code`) não pode descartar a
  // mensagem do cliente e a resposta: o webhook para em `mensagem_nao_gravada`.
  it("repete a gravação quando o banco falha por instantes", async () => {
    respostasDoInsert.push({ data: null, error: { message: "Gateway Timeout" } });
    respostaDoInsert = { data: { id: "mensagem-2" }, error: null };
    const r = await gravarMensagem(mensagem);
    expect(r).toEqual({ inedita: true, id: "mensagem-2" });
    expect(inserts).toHaveLength(2);
    expect(updates).toEqual(["whatsapp_conversas"]);
  });

  it("não repete erro de consulta nem a recusa do gatilho de grupo", async () => {
    respostaDoInsert = { data: null, error: { code: "P0001", message: "grupo da linha difere do grupo de whatsapp_conversas" } };
    const r = await gravarMensagem(mensagem);
    expect(r.erro).toMatch(/grupo da linha difere/);
    expect(inserts).toHaveLength(1);
  });

  it("a duplicata depois de uma tentativa perdida é a própria mensagem, não reentrega", async () => {
    // A primeira tentativa gravou e só a resposta se perdeu no timeout.
    respostasDoInsert.push({ data: null, error: { message: "Gateway Timeout" } });
    respostaDoInsert = { data: null, error: { code: "23505", message: "duplicate key" } };
    mensagemJaGravada = { id: "mensagem-3" };
    const r = await gravarMensagem(mensagem);
    expect(r).toEqual({ inedita: true, id: "mensagem-3" });
    expect(updates).toEqual(["whatsapp_conversas"]);
  });

  it("não diz inédita quando o insert falha", async () => {
    respostaDoInsert = { data: null, error: { code: "23503", message: "violates foreign key" } };
    const r = await gravarMensagem(mensagem);
    expect(r.inedita).toBe(false);
    expect(r.id).toBeNull();
    expect(r.erro).toMatch(/foreign key/);
    // A conversa não ganha "última mensagem" de algo que não foi gravado.
    expect(updates).toEqual([]);
  });

  it("reentrega continua sendo reentrega, sem erro", async () => {
    respostaDoInsert = { data: null, error: { code: "23505", message: "duplicate key" } };
    const r = await gravarMensagem(mensagem);
    expect(r).toEqual({ inedita: false, id: null });
  });

  it("gravada de verdade é inédita", async () => {
    respostaDoInsert = { data: { id: "mensagem-1" }, error: null };
    const r = await gravarMensagem(mensagem);
    expect(r).toEqual({ inedita: true, id: "mensagem-1" });
    expect(updates).toEqual(["whatsapp_conversas"]);
  });
});

describe("registrarInteracao (telemetria)", () => {
  beforeEach(() => {
    inserts.length = 0;
  });

  it("devolve falha e loga quando o insert é recusado", async () => {
    const aviso = vi.spyOn(console, "error").mockImplementation(() => {});
    respostaDoInsert = { data: null, error: { code: "P0001", message: "grupo_id obrigatório em ia_interacoes" } };
    const r = await registrarInteracao({ origem: "webhook", promptVersao: "v1", acao: "respondida" });
    expect(r).toEqual({ ok: false, erro: "grupo_id obrigatório em ia_interacoes" });
    expect(aviso).toHaveBeenCalled();
  });

  it("devolve ok quando grava", async () => {
    respostaDoInsert = { data: null, error: null };
    const r = await registrarInteracao({ origem: "webhook", promptVersao: "v1", acao: "respondida" });
    expect(r).toEqual({ ok: true });
    expect(inserts.map((i) => i.tabela)).toEqual(["ia_interacoes"]);
  });
});
