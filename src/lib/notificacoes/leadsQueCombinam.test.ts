import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Aviso "N leads seus combinam com o imóvel" (29/10/2026, 0245): o imóvel só
 * cruza com a carteira do grupo dele, cada corretor é avisado só dos
 * próprios leads, a trava é gravada antes do envio e nada vai ao cliente.
 */

vi.mock("server-only", () => ({}));
const notificarCorretor = vi.fn(async () => 1);
vi.mock("@/lib/notificacoes/push", () => ({ notificarCorretor }));
vi.mock("@/lib/credito/parametros", async () => {
  const { PARAMETROS_PADRAO } = await import("@/lib/credito/parametrosPadrao");
  return { getParametrosCredito: async () => PARAMETROS_PADRAO };
});

type Linha = Record<string, unknown>;
let banco: Record<string, Linha[]> = {};
const leituras: { tabela: string; filtros: string[] }[] = [];

function consulta(tabela: string) {
  const filtros: string[] = [];
  const predicados: ((l: Linha) => boolean)[] = [];
  let upsert: Linha | null = null;
  const executar = () => {
    if (upsert) {
      const linhas = (banco[tabela] ??= []);
      const existente = linhas.find((l) => l.empreendimento_id === upsert!.empreendimento_id && l.corretor_id === upsert!.corretor_id);
      if (existente) Object.assign(existente, upsert);
      else linhas.push({ ...upsert });
      return { data: null, error: null };
    }
    leituras.push({ tabela, filtros });
    return { data: (banco[tabela] ?? []).filter((l) => predicados.every((p) => p(l))), error: null };
  };
  const q = {
    select: () => q,
    upsert: (v: Linha) => ((upsert = v), q),
    eq: (c: string, v: unknown) => (filtros.push(`eq:${c}`), predicados.push((l) => l[c] === v), q),
    is: (c: string, v: unknown) => (predicados.push((l) => (l[c] ?? null) === v), q),
    not: (c: string, _op: string, v: unknown) => (predicados.push((l) => (l[c] ?? null) !== v), q),
    gte: (c: string, v: string) => (predicados.push((l) => String(l[c] ?? "") >= v), q),
    filter: (c: string, _op: string, v: string) => {
      const lista = v.replace(/[()]/g, "").split(",");
      predicados.push((l) => lista.includes(String(l[c])));
      return q;
    },
    order: () => q,
    limit: () => q,
    then: <T,>(r: (x: ReturnType<typeof executar>) => T) => Promise.resolve(executar()).then(r),
  };
  return q;
}
const supabase = { from: (t: string) => consulta(t) } as never;

const { avisarLeadsQueCombinam } = await import("./leadsQueCombinam");

const GRUPO_A = "00000000-0000-0000-0000-00000000000a";
const GRUPO_B = "00000000-0000-0000-0000-00000000000b";
const agora = new Date("2026-10-29T12:00:00Z");

const imovel = (grupo: string) => ({
  id: `imovel-${grupo.slice(-1)}`,
  grupo_id: grupo,
  nome: "Vitra",
  slug: "vitra",
  cidade: "Barueri",
  bairro: "Alphaville",
  preco_a_partir: 500_000,
  status: "em_construcao",
  tipologias: [{ dormitorios: 3 }],
  publicado: true,
  updated_at: "2026-10-29T11:00:00Z",
});
const lead = (id: string, grupo: string, corretor: string, regiao = "Alphaville") => ({
  id,
  grupo_id: grupo,
  nome: `Cliente ${id}`,
  telefone: null,
  corretor_id: corretor,
  regiao_interesse: regiao,
  dormitorios_min: null,
  orcamento_max: null,
  orcamento_min: null,
  renda_mensal: null,
  empreendimento_id: null,
  imovel_interesse_id: null,
  arquivado_em: null,
  nao_contatar_em: null,
  etapa: "em_conversa",
});

beforeEach(() => {
  banco = { lead_observacoes_ia: [], avisos_de_match: [] };
  leituras.length = 0;
  notificarCorretor.mockClear();
});

describe("avisarLeadsQueCombinam", () => {
  it("imóvel de um grupo não cruza com leads de outro", async () => {
    banco.empreendimentos = [imovel(GRUPO_B)];
    banco.leads = [lead("1", GRUPO_A, "cor-a")];
    expect(await avisarLeadsQueCombinam(supabase, agora)).toBe(0);
    expect(notificarCorretor).not.toHaveBeenCalled();
    // Toda leitura da carteira filtra o grupo.
    for (const l of leituras.filter((x) => ["leads", "lead_observacoes_ia", "avisos_de_match"].includes(x.tabela))) {
      expect(l.filtros, l.tabela).toContain("eq:grupo_id");
    }
  });

  it("no mesmo grupo: cada corretor é avisado só dos próprios leads, com a trava gravada", async () => {
    banco.empreendimentos = [imovel(GRUPO_A)];
    banco.leads = [lead("1", GRUPO_A, "cor-a"), lead("2", GRUPO_A, "cor-a"), lead("3", GRUPO_A, "cor-b"), lead("4", GRUPO_A, "cor-b", "Cotia")];
    expect(await avisarLeadsQueCombinam(supabase, agora)).toBe(2);
    const chamadas = notificarCorretor.mock.calls as unknown as [unknown, string, { titulo: string; url: string }][];
    const porCorretor = Object.fromEntries(chamadas.map(([, c, n]) => [c, n]));
    expect(porCorretor["cor-a"].titulo).toBe("2 leads seus combinam com Vitra");
    expect(porCorretor["cor-b"].titulo).toBe("1 lead seu combina com Vitra");
    expect(porCorretor["cor-a"].url).toBe("/corretor/imoveis/vitra/leads-que-combinam");
    expect(banco.avisos_de_match).toEqual([
      expect.objectContaining({ grupo_id: GRUPO_A, empreendimento_id: "imovel-a", corretor_id: "cor-a", leads: 2 }),
      expect.objectContaining({ grupo_id: GRUPO_A, empreendimento_id: "imovel-a", corretor_id: "cor-b", leads: 1 }),
    ]);

    // O tique seguinte não repete (a trava segura).
    notificarCorretor.mockClear();
    expect(await avisarLeadsQueCombinam(supabase, new Date(agora.getTime() + 2 * 3600_000))).toBe(0);
    expect(notificarCorretor).not.toHaveBeenCalled();
  });
});
