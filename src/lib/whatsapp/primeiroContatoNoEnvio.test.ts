/*
 * A régua de primeiro contato em todo caminho que abre conversa (27/10/2026).
 *
 * Depois do WhatsApp do Ramos, a lista ganhou teto e quarentena (0217). Outros
 * três caminhos também escrevem primeiro para quem nunca falou: o botão ✨ da
 * IA, o aviso de imóvel novo e a roleta dos anúncios. Aqui: a decisão em si
 * (`liberarPrimeiroContato`, com banco falso) e guardas de código que reprovam
 * um caminho que volte a mandar sem consultar a régua.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contarPrimeirosContatos, liberarPrimeiroContato, nuncaFalouComOCorretor } from "./primeiroContatoNoEnvio";
import { PRIMEIRO_CONTATO_POR_DIA } from "./primeiroContato";

const AGORA = new Date("2026-10-27T15:00:00Z");

function bancoFalso(opcoes: {
  instancia: { conectado_em: string | null; aquecimento_desde: string | null } | null;
  hoje?: number;
  semana?: number;
  falharContagem?: boolean;
  conversas?: { id: string }[];
  falasDoCliente?: number;
}) {
  const rpcs: { p_desde: string }[] = [];
  const cliente = {
    from(tabela: string) {
      const resposta =
        tabela === "corretor_whatsapp_instancias"
          ? { data: opcoes.instancia, error: null }
          : tabela === "whatsapp_conversas"
            ? { data: opcoes.conversas ?? [], error: null }
            : { data: null, error: null, count: opcoes.falasDoCliente ?? 0 };
      const cadeia: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "maybeSingle"]) cadeia[m] = () => cadeia;
      cadeia.then = (ok: (v: unknown) => unknown) => Promise.resolve(resposta).then(ok);
      return cadeia;
    },
    async rpc(_nome: string, args: { p_desde: string }) {
      rpcs.push(args);
      if (opcoes.falharContagem) return { data: null, error: { message: "simulado" } };
      const ehHoje = new Date(args.p_desde).getTime() > AGORA.getTime() - 86_400_000;
      return { data: ehHoje ? (opcoes.hoje ?? 0) : (opcoes.semana ?? 0), error: null };
    },
  };
  return { cliente: cliente as unknown as Parameters<typeof liberarPrimeiroContato>[0], rpcs };
}

const NUMERO_ANTIGO = { conectado_em: "2026-09-01T12:00:00Z", aquecimento_desde: null };

describe("liberarPrimeiroContato", () => {
  it("número antigo com vaga: pode", async () => {
    const { cliente } = bancoFalso({ instancia: NUMERO_ANTIGO, hoje: 3, semana: 10 });
    expect(await liberarPrimeiroContato(cliente, "c", AGORA)).toEqual({ pode: true });
  });

  it("teto do dia atingido: não pode, e diz por quê", async () => {
    const { cliente } = bancoFalso({ instancia: NUMERO_ANTIGO, hoje: PRIMEIRO_CONTATO_POR_DIA, semana: 12 });
    const r = await liberarPrimeiroContato(cliente, "c", AGORA);
    expect(r.pode).toBe(false);
    expect(!r.pode && r.motivo).toMatch(/10 por dia e 30 por semana/);
  });

  it("número que voltou de queda há 3 dias: quarentena", async () => {
    const { cliente } = bancoFalso({
      instancia: { conectado_em: "2026-09-01T12:00:00Z", aquecimento_desde: "2026-10-24T12:00:00Z" },
    });
    const r = await liberarPrimeiroContato(cliente, "c", AGORA);
    expect(!r.pode && r.motivo).toMatch(/Faltam 4 dias/);
  });

  it("sem instância ou sem contagem, não pode", async () => {
    expect((await liberarPrimeiroContato(bancoFalso({ instancia: null }).cliente, "c", AGORA)).pode).toBe(false);
    expect(
      (await liberarPrimeiroContato(bancoFalso({ instancia: NUMERO_ANTIGO, falharContagem: true }).cliente, "c", AGORA))
        .pode,
    ).toBe(false);
  });

  it("hoje é contado desde a meia-noite de São Paulo, a semana desde 7 dias atrás", async () => {
    const { cliente, rpcs } = bancoFalso({ instancia: NUMERO_ANTIGO });
    await contarPrimeirosContatos(cliente, "c", AGORA);
    expect(rpcs.map((r) => r.p_desde)).toEqual(["2026-10-27T03:00:00.000Z", "2026-10-20T15:00:00.000Z"]);
  });
});

describe("nuncaFalouComOCorretor", () => {
  it("sem conversa, ou conversa sem fala do cliente: nunca falou", async () => {
    expect(await nuncaFalouComOCorretor(bancoFalso({ instancia: null }).cliente, ["l"])).toBe(true);
    expect(
      await nuncaFalouComOCorretor(bancoFalso({ instancia: null, conversas: [{ id: "x" }], falasDoCliente: 0 }).cliente, ["l"]),
    ).toBe(true);
  });

  it("com fala do cliente: já conversou", async () => {
    expect(
      await nuncaFalouComOCorretor(bancoFalso({ instancia: null, conversas: [{ id: "x" }], falasDoCliente: 2 }).cliente, ["l"]),
    ).toBe(false);
  });

  it("sem lead, conta como primeiro contato", async () => {
    expect(await nuncaFalouComOCorretor(bancoFalso({ instancia: null }).cliente, [null])).toBe(true);
  });
});

describe("todo caminho que abre conversa consulta a régua antes de enviar", () => {
  const ler = (arquivo: string) =>
    readFileSync(arquivo, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");

  it("botão ✨ e IA por iniciativa: antes da cota, nas duas funções", () => {
    const codigo = ler("src/lib/whatsapp/aberturaPelaIA.ts");
    for (const nome of ["export async function gerarEEnviarPelaIA", "export async function enviarRascunhoDaIA"]) {
      const corpo = codigo.slice(codigo.indexOf(nome));
      const trava = corpo.search(
        /const primeiro = await travaDePrimeiroContato\([^;]*\);\s*if \(primeiro\) return \{ enviou: false, erro: primeiro \};/,
      );
      expect(trava, nome).toBeGreaterThan(0);
      expect(trava, nome).toBeLessThan(corpo.indexOf("reservarCotaCampanha("));
    }
  });

  it("aviso de imóvel novo: antes de marcar o imóvel como avisado", () => {
    const codigo = ler("src/lib/crm/avisoDeNovidade.ts");
    const trava = codigo.indexOf("liberarPrimeiroContato(");
    expect(trava).toBeGreaterThan(0);
    expect(trava).toBeLessThan(codigo.indexOf('.update({ detalhes })'));
  });

  it("roleta: antes da abertura pelo número do sorteado", () => {
    const codigo = ler("src/lib/whatsapp/roletaDosAnuncios.ts");
    const corpo = codigo.slice(codigo.indexOf("async function repassar("));
    const trava = corpo.indexOf("liberarPrimeiroContato(");
    expect(trava).toBeGreaterThan(0);
    expect(trava).toBeLessThan(corpo.indexOf("enviarMensagemWhatsapp("));
  });

  it("o disparador não aceita mais lista 'de qualquer hora'", () => {
    const codigo = ler("src/lib/whatsapp/campaignDispatcher.ts");
    expect(codigo).not.toMatch(/ignorar_janela|janela_liberada_ate/);
  });

  it("a contagem só roda pela chave de serviço", () => {
    const sql = readFileSync("supabase/migrations/0222_contador_de_primeiro_contato.sql", "utf8");
    expect(sql).toMatch(/revoke execute on function public\.primeiros_contatos_do_corretor\(uuid, timestamptz\) from authenticated/);
    expect(sql).toMatch(/revoke execute on function public\.primeiros_contatos_do_corretor\(uuid, timestamptz\) from anon/);
    expect(sql).toMatch(/security invoker/);
  });

  it("o corretor não grava nem apaga mensagem pela sessão (forjar 'o cliente respondeu' furaria a régua)", () => {
    const sql = readFileSync("supabase/migrations/0223_mensagens_so_pela_chave_de_servico.sql", "utf8");
    expect(sql).toMatch(/revoke insert, update, delete, truncate on table public\.whatsapp_mensagens from anon, authenticated/);
    expect(sql).toMatch(/revoke delete, truncate on table public\.whatsapp_conversas from anon, authenticated/);
  });
});
