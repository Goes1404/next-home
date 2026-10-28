import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Reuniões e bloqueios (fase 3): o bloqueio que cruza visita é desfeito e
 * explicado; a reunião avisa quem participa (menos quem marcou); o gestor
 * nunca recebe o título do bloqueio de ninguém.
 */
type Resposta = { data: unknown; error: unknown };
const respostas: Record<string, Resposta[]> = {};
const chamadas: { tabela: string; op: string; arg?: unknown; filtros: [string, unknown][] }[] = [];
const avisos: [string, string][] = [];

function proxima(tabela: string, op: string): Resposta {
  return respostas[`${tabela}.${op}`]?.shift() ?? { data: null, error: null };
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/crm/avisoAoCorretor", () => ({
  avisarCorretor: async (_s: unknown, id: string, texto: string) => (avisos.push([id, texto]), true),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabela: string) => {
      const registro = { tabela, op: "select", arg: undefined as unknown, filtros: [] as [string, unknown][] };
      chamadas.push(registro);
      const cadeia = {
        select: () => cadeia,
        insert: (arg: unknown) => ((registro.op = "insert"), (registro.arg = arg), cadeia),
        update: (arg: unknown) => ((registro.op = "update"), (registro.arg = arg), cadeia),
        delete: () => ((registro.op = "delete"), cadeia),
        eq: (c: string, v: unknown) => (registro.filtros.push([c, v]), cadeia),
        in: (c: string, v: unknown) => (registro.filtros.push([c, v]), cadeia),
        lt: () => cadeia,
        gt: () => cadeia,
        order: () => cadeia,
        limit: () => cadeia,
        single: async () => proxima(tabela, registro.op),
        maybeSingle: async () => proxima(tabela, registro.op),
        then: (r: (x: Resposta) => unknown) => r(proxima(tabela, registro.op)),
      };
      return cadeia;
    },
  }),
}));

const { cancelarCompromisso, criarBloqueio, criarReuniao, lerCompromissos } = await import("./compromissos");

const AGORA = new Date("2026-11-02T12:00:00Z");
const INICIO = new Date("2026-11-03T17:00:00Z");
const FIM = new Date("2026-11-03T19:00:00Z");

describe("compromissos", () => {
  beforeEach(() => {
    for (const k of Object.keys(respostas)) delete respostas[k];
    chamadas.length = 0;
    avisos.length = 0;
  });

  it("bloqueio que cruza visita é desfeito e explicado", async () => {
    respostas["compromissos.insert"] = [{ data: { id: "c1" }, error: null }];
    respostas["compromisso_participantes.insert"] = [{ data: null, error: { code: "23P01", message: "há visita" } }];
    const r = await criarBloqueio({ grupoId: "g1", corretorId: "a", inicio: INICIO, fim: FIM, motivo: "médico" }, undefined, AGORA);
    expect(r.erro).toBe("Você tem visita marcada nesse horário. Remarque a visita antes de bloquear.");
    expect(chamadas.some((c) => c.tabela === "compromissos" && c.op === "delete")).toBe(true);
  });

  it("bloqueio no passado ou com fim antes do começo é recusado sem gravar", async () => {
    expect((await criarBloqueio({ grupoId: "g1", corretorId: "a", inicio: FIM, fim: INICIO, motivo: null }, undefined, AGORA)).erro).toBe(
      "O fim precisa ser depois do começo.",
    );
    expect(chamadas).toEqual([]);
  });

  it("reunião com a equipe toda avisa todos menos quem marcou e diz quem tem visita", async () => {
    respostas["corretores.select"] = [
      { data: [{ id: "gestor", nome: "Gil" }, { id: "a", nome: "Ana" }, { id: "b", nome: "Bruno" }], error: null },
    ];
    respostas["compromissos.insert"] = [{ data: { id: "r1" }, error: null }];
    respostas["visitas.select"] = [{ data: [{ corretor_id: "b" }], error: null }];
    const r = await criarReuniao(
      { grupoId: "g1", gestorId: "gestor", titulo: "Metas", inicio: INICIO, fim: FIM, participantes: "equipe" },
      undefined,
      AGORA,
    );
    expect(r.comVisita).toEqual(["Bruno"]);
    expect(avisos.map((a) => a[0]).sort()).toEqual(["a", "b"]);
    const participantes = chamadas.find((c) => c.tabela === "compromisso_participantes" && c.op === "insert");
    expect((participantes?.arg as { corretor_id: string }[]).map((p) => p.corretor_id)).toEqual(["gestor", "a", "b"]);
    expect(chamadas.find((c) => c.tabela === "corretores")?.filtros).toContainEqual(["grupo_id", "g1"]);
  });

  it("o gestor nunca recebe o título do bloqueio", async () => {
    respostas["compromisso_participantes.select"] = [
      {
        data: [
          {
            corretor_id: "a",
            corretor: { nome: "Ana" },
            compromisso: { id: "c1", tipo: "bloqueio", titulo: "Consulta no cardiologista", inicio: INICIO.toISOString(), fim: FIM.toISOString(), criado_por: "a", cancelado_em: null },
          },
        ],
        error: null,
      },
    ];
    const [item] = await lerCompromissos({ grupoId: "g1", equipe: true, corretorId: null, inicio: INICIO, fim: FIM, limite: 30 });
    expect(item).toMatchObject({ subtipo: "bloqueio", titulo: "", corretorNome: "Ana", podeCancelar: false });
    expect(JSON.stringify(item)).not.toContain("cardiologista");
  });

  it("bloqueio de outro corretor não é cancelado por ele", async () => {
    respostas["compromissos.select"] = [
      { data: { id: "c1", tipo: "bloqueio", titulo: "", inicio: INICIO.toISOString(), fim: FIM.toISOString(), criado_por: "a", cancelado_em: null }, error: null },
    ];
    const r = await cancelarCompromisso({ grupoId: "g1", corretorId: "b", ehGestor: true, compromissoId: "c1" });
    expect(r.erro).toBe("Só quem marcou pode cancelar.");
  });

  it("corretor comum não cancela reunião", async () => {
    respostas["compromissos.select"] = [
      { data: { id: "r1", tipo: "reuniao", titulo: "Metas", inicio: INICIO.toISOString(), fim: FIM.toISOString(), criado_por: "gestor", cancelado_em: null }, error: null },
    ];
    const r = await cancelarCompromisso({ grupoId: "g1", corretorId: "a", ehGestor: false, compromissoId: "r1" });
    expect(r.erro).toBe("Só quem marcou pode cancelar.");
  });
});
