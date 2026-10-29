import { beforeEach, describe, expect, it, vi } from "vitest";
import { filtro, supabaseFalso, type Consulta, type Resposta } from "./supabaseFalso.testutil";

const notificacoes: { corretorId: string; n: { titulo: string; corpo: string; url: string; tag?: string } }[] = [];
vi.mock("@/lib/notificacoes/push", () => ({
  notificarCorretor: async (_s: unknown, corretorId: string, n: (typeof notificacoes)[number]["n"]) => {
    notificacoes.push({ corretorId, n });
    return 1;
  },
}));

const { avisarLeadsParados } = await import("./leadParado");
const {
  HORAS_SEM_CONTATO,
  MAX_PARADOS_POR_CORRETOR_DIA,
  escolherLeadsParados,
  horaDeVarrerLeadsParados,
  notificacaoDoLeadParado,
} = await import("./regrasDoLeadParado");

/** Um instante em São Paulo (-03:00). */
const sp = (dataHora: string) => new Date(`${dataHora}-03:00`);
const AGORA = sp("2026-10-29T10:00:00");
const INICIO_DO_DIA = sp("2026-10-29T00:00:00").toISOString();

beforeEach(() => {
  notificacoes.length = 0;
});

describe("regra do lead parado", () => {
  it("48h sem contato", () => {
    expect(HORAS_SEM_CONTATO).toBe(48);
  });

  it("varre de hora em hora, só das 8h às 19h59 de São Paulo", () => {
    expect(horaDeVarrerLeadsParados(sp("2026-10-29T10:00:00"))).toBe(true);
    expect(horaDeVarrerLeadsParados(sp("2026-10-29T10:04:59"))).toBe(true);
    expect(horaDeVarrerLeadsParados(sp("2026-10-29T10:05:00"))).toBe(false);
    expect(horaDeVarrerLeadsParados(sp("2026-10-29T08:00:00"))).toBe(true);
    expect(horaDeVarrerLeadsParados(sp("2026-10-29T19:00:00"))).toBe(true);
    expect(horaDeVarrerLeadsParados(sp("2026-10-29T20:00:00"))).toBe(false);
    expect(horaDeVarrerLeadsParados(sp("2026-10-29T07:00:00"))).toBe(false);
    expect(horaDeVarrerLeadsParados(sp("2026-10-29T23:00:00"))).toBe(false);
    // 23h em São Paulo já é 02h UTC do dia seguinte: a hora é a de SP.
    expect(horaDeVarrerLeadsParados(new Date("2026-10-30T02:00:00Z"))).toBe(false);
  });

  it("no máximo 3 por corretor por dia, contando os de hoje", () => {
    const c = (corretor_id: string, id: string) => ({ corretor_id, id });
    const candidatos = [c("c1", "a"), c("c1", "b"), c("c2", "x"), c("c1", "d"), c("c1", "e")];
    expect(MAX_PARADOS_POR_CORRETOR_DIA).toBe(3);
    expect(escolherLeadsParados(candidatos, new Map()).map((l) => l.id)).toEqual(["a", "b", "x", "d"]);
    expect(escolherLeadsParados(candidatos, new Map([["c1", 2]])).map((l) => l.id)).toEqual(["a", "x"]);
    expect(escolherLeadsParados(candidatos, new Map([["c1", 3]])).map((l) => l.id)).toEqual(["x"]);
  });

  it("o texto diz há quantos dias", () => {
    const n = notificacaoDoLeadParado({
      lead: { nome: "Ana Prado", telefone: null },
      ultimoContato: new Date(AGORA.getTime() - 3.5 * 86_400_000),
      agora: AGORA,
    });
    expect(n.titulo).toBe("Ana Prado está sem contato");
    expect(n.corpo).toContain("há 3 dias");
  });
});

type Candidato = { id: string; nome: string; telefone: string | null; corretor_id: string; grupo_id: string; ultimo_contato: string; aviso_parado_em: string | null };
const candidato = (id: string, corretor_id: string): Candidato => ({
  id,
  nome: `Lead ${id}`,
  telefone: null,
  corretor_id,
  grupo_id: "g1",
  ultimo_contato: new Date(AGORA.getTime() - 60 * 3_600_000).toISOString(),
  aviso_parado_em: null,
});

function cenario(candidatos: Candidato[] | null, deHoje: { corretor_id: string }[] = [], erroRpc: string | null = null) {
  return supabaseFalso((c: Consulta): Resposta => {
    if (c.acao === "rpc") return { data: candidatos, error: erroRpc ? { message: erroRpc } : null };
    if (c.tabela === "leads" && c.acao === "select") return { data: deHoje, error: null };
    if (c.tabela === "leads" && c.acao === "update") return { data: [{ id: "ok" }], error: null };
    return { data: null, error: null };
  });
}

describe("avisarLeadsParados", () => {
  it("fora da hora de varrer não consulta nada", async () => {
    const { cliente, consultas } = cenario([candidato("a", "c1")]);
    expect(await avisarLeadsParados(cliente, sp("2026-10-29T21:00:00"))).toBe(0);
    expect(await avisarLeadsParados(cliente, sp("2026-10-29T10:30:00"))).toBe(0);
    expect(consultas).toHaveLength(0);
  });

  it("busca a janela de 48h a 7 dias e avisa o dono, respeitando o teto do dia", async () => {
    const { cliente, consultas } = cenario(
      [candidato("a", "c1"), candidato("b", "c1"), candidato("x", "c2")],
      [{ corretor_id: "c1" }, { corretor_id: "c1" }],
    );
    expect(await avisarLeadsParados(cliente, AGORA)).toBe(2);

    const busca = consultas[0];
    expect(busca.tabela).toBe("rpc:leads_parados_para_aviso");
    expect(busca.valores).toMatchObject({
      p_parado_desde: new Date(AGORA.getTime() - 48 * 3_600_000).toISOString(),
      p_janela_desde: new Date(AGORA.getTime() - 7 * 86_400_000).toISOString(),
      p_dia_inicio: INICIO_DO_DIA,
    });

    const claims = consultas.filter((c) => c.acao === "update");
    expect(claims).toHaveLength(2);
    expect(filtro(claims[0], "or")).toEqual([`aviso_parado_em.is.null,aviso_parado_em.lt.${INICIO_DO_DIA}`]);
    expect(claims[0].filtros).toContainEqual(["eq", "corretor_id", "c1"]);
    expect(claims[0].filtros).toContainEqual(["eq", "grupo_id", "g1"]);

    expect(notificacoes.map((x) => [x.corretorId, x.n.tag, x.n.url])).toEqual([
      ["c1", "lead-parado-a", "/corretor/leads/a"],
      ["c2", "lead-parado-x", "/corretor/leads/x"],
    ]);
  });

  it("sem a função da 0236 nada sai", async () => {
    const { cliente } = cenario(null, [], "Could not find the function public.leads_parados_para_aviso");
    expect(await avisarLeadsParados(cliente, AGORA)).toBe(0);
    expect(notificacoes).toHaveLength(0);
  });
});
