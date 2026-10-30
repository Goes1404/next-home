import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * A cobrança automática (Asaas) acompanha o que tira o grupo da cobrança
 * (revisão de 30/10/2026): cancelar o grupo e passar para o plano a preço de
 * custo cancelam a assinatura no Asaas ANTES de mudar o grupo. Se o Asaas
 * recusa, nada muda aqui — o grupo nunca fica cancelado/isento no painel e
 * cobrado no Asaas. Ajustar mensalidade ou vencimento com a assinatura
 * ligada é recusado (a API do Asaas não documenta a troca do valor).
 *
 * `fetch` falso: nenhuma chamada sai para o Asaas de verdade.
 */

const OPERADOR = "operador-1";
const G = "4f6c2b1e-1111-4222-8333-944455556666";
const ASSINATURA = "sub_abc123";

let banco: BancoFalso;
let chamadas: { url: string; metodo: string; corpo?: string }[];
let respostaDoAsaas: { status: number; corpo: unknown };

vi.mock("@/lib/guardas", () => ({ exigirAdminDaPlataformaNaAcao: async () => ({ userId: OPERADOR }) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { registrarCancelamento, mudarPlanoDoGrupo } = await import("./acoes");
const { ajustarCobrancaDoGrupo } = await import("./cobrancaAcoes");

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("ASAAS_AMBIENTE", "sandbox");
  vi.stubEnv("ASAAS_API_KEY", "$aact_chave_falsa");
  vi.stubEnv("ASAAS_WEBHOOK_TOKEN", "token-do-webhook-de-teste-com-32-caracteres");
  chamadas = [];
  respostaDoAsaas = { status: 200, corpo: { deleted: true, id: ASSINATURA } };
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    chamadas.push({ url, metodo: String(init.method), corpo: init.body as string | undefined });
    return new Response(JSON.stringify(respostaDoAsaas.corpo), { status: respostaDoAsaas.status });
  });
  banco = bancoFalso({
    grupos: [
      {
        id: G,
        plano: "essencial",
        situacao: "ativo",
        cancelado_em: null,
        dados_apagados_em: null,
        asaas_assinatura_id: ASSINATURA,
        mensalidade: "97.00",
        dia_do_vencimento: 10,
        teto_respostas_ia: null,
        teto_artes: null,
        teto_videos: null,
        teto_mensagens_lista: null,
      },
    ],
    admin_eventos: [],
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const grupo = () => banco.tabelas.grupos[0];

describe("cancelar o grupo com a cobrança automática ligada", () => {
  it("cancela a assinatura no Asaas, desliga a coluna e registra os dois eventos", async () => {
    expect(await registrarCancelamento(G)).toEqual({ ok: true });
    expect(chamadas).toEqual([
      expect.objectContaining({ url: `https://api-sandbox.asaas.com/v3/subscriptions/${ASSINATURA}`, metodo: "DELETE" }),
    ]);
    expect(grupo()).toMatchObject({ situacao: "encerrado", asaas_assinatura_id: null });
    expect(banco.tabelas.admin_eventos.map((e) => [e.acao, (e.detalhes as Record<string, unknown>).motivo])).toEqual([
      ["grupo_cancelado", undefined],
      ["cobranca_automatica_desligada", "cancelamento"],
    ]);
  });

  it("Asaas fora do ar: recusa com motivo claro e nada muda", async () => {
    respostaDoAsaas = { status: 503, corpo: { errors: [{ description: "indisponível" }] } };
    const r = await registrarCancelamento(G);
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/Asaas.*nada foi mudado/) });
    expect(grupo()).toMatchObject({ situacao: "ativo", cancelado_em: null, asaas_assinatura_id: ASSINATURA });
    expect(banco.tabelas.admin_eventos).toEqual([]);
  });

  it("assinatura que já não existe no Asaas (404) conta como cancelada", async () => {
    respostaDoAsaas = { status: 404, corpo: {} };
    expect(await registrarCancelamento(G)).toEqual({ ok: true });
    expect(grupo()).toMatchObject({ situacao: "encerrado", asaas_assinatura_id: null });
  });

  it("Asaas sem configuração: recusa sem chamar nada", async () => {
    vi.stubEnv("ASAAS_API_KEY", "");
    const r = await registrarCancelamento(G);
    expect(r).toEqual({ ok: false, erro: expect.stringMatching(/ASAAS_API_KEY/) });
    expect(chamadas).toEqual([]);
    expect(grupo().cancelado_em).toBeNull();
  });

  it("grupo já cancelado não chama o Asaas", async () => {
    grupo().cancelado_em = "2026-09-01T00:00:00Z";
    expect((await registrarCancelamento(G)).ok).toBe(false);
    expect(chamadas).toEqual([]);
  });

  it("sem cobrança automática, cancela sem falar com o Asaas", async () => {
    grupo().asaas_assinatura_id = null;
    expect(await registrarCancelamento(G)).toEqual({ ok: true });
    expect(chamadas).toEqual([]);
    expect(banco.tabelas.admin_eventos.map((e) => e.acao)).toEqual(["grupo_cancelado"]);
  });
});

describe("plano a preço de custo com a cobrança automática ligada", () => {
  it("cancela a assinatura antes de mudar o plano", async () => {
    expect(await mudarPlanoDoGrupo(G, { plano: "custo", voltarLimitesAoPadrao: false })).toEqual({ ok: true });
    expect(chamadas.map((c) => c.metodo)).toEqual(["DELETE"]);
    expect(grupo()).toMatchObject({ plano: "custo", asaas_assinatura_id: null });
    expect(banco.tabelas.admin_eventos.map((e) => e.acao)).toEqual(["cobranca_automatica_desligada", "plano_alterado"]);
  });

  it("Asaas recusa: o plano não muda", async () => {
    respostaDoAsaas = { status: 500, corpo: {} };
    expect((await mudarPlanoDoGrupo(G, { plano: "custo", voltarLimitesAoPadrao: false })).ok).toBe(false);
    expect(grupo()).toMatchObject({ plano: "essencial", asaas_assinatura_id: ASSINATURA });
  });

  it("outro plano pago não mexe na assinatura", async () => {
    expect(await mudarPlanoDoGrupo(G, { plano: "profissional", voltarLimitesAoPadrao: false })).toEqual({ ok: true });
    expect(chamadas).toEqual([]);
    expect(grupo().asaas_assinatura_id).toBe(ASSINATURA);
  });
});

describe("ajustar mensalidade e vencimento com a cobrança automática ligada", () => {
  it("mudança de valor ou de dia é recusada (o Asaas cobraria o antigo); nada muda", async () => {
    const valor = await ajustarCobrancaDoGrupo(G, { mensalidade: "147,00", diaDoVencimento: "10" });
    expect(valor).toEqual({ ok: false, erro: expect.stringMatching(/Desligue a cobrança automática/) });
    const dia = await ajustarCobrancaDoGrupo(G, { mensalidade: "97,00", diaDoVencimento: "15" });
    expect(dia.ok).toBe(false);
    expect(grupo()).toMatchObject({ mensalidade: "97.00", dia_do_vencimento: 10 });
    expect(chamadas).toEqual([]);
  });

  it("salvar os mesmos números passa; sem assinatura, muda à vontade", async () => {
    expect(await ajustarCobrancaDoGrupo(G, { mensalidade: "97,00", diaDoVencimento: "10" })).toEqual({ ok: true });
    grupo().asaas_assinatura_id = null;
    expect(await ajustarCobrancaDoGrupo(G, { mensalidade: "147,00", diaDoVencimento: "15" })).toEqual({ ok: true });
    expect(grupo()).toMatchObject({ mensalidade: 147, dia_do_vencimento: 15 });
  });
});
