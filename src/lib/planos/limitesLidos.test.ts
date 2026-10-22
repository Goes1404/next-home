import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A leitura dos limites do plano e a conferência que o ponto de
 * geração faz ANTES de gastar. O banco é falso: o que se prova aqui é a conta
 * (plano, assentos, ajuste, mês) e a decisão (libera, recusa, falha libera).
 */

type Linhas = {
  grupos: Record<string, unknown> | null;
  uso: Record<string, unknown> | null;
  assentos: number;
  falhaEm?: "grupos" | "uso_da_ia" | "corretor_whatsapp_instancias";
};

let banco: Linhas;
const filtros: { tabela: string; chave: string; valor: unknown }[] = [];

function consulta(tabela: string) {
  const q = {
    select: () => q,
    eq(chave: string, valor: unknown) {
      filtros.push({ tabela, chave, valor });
      return q;
    },
    maybeSingle() {
      if (banco.falhaEm === tabela) return Promise.resolve({ data: null, error: { message: "tempo esgotado" } });
      return Promise.resolve({ data: tabela === "grupos" ? banco.grupos : banco.uso, error: null });
    },
    then(ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) {
      const r =
        banco.falhaEm === tabela
          ? { data: null, count: null, error: { message: "tempo esgotado" } }
          : { data: null, count: banco.assentos, error: null };
      return Promise.resolve(r).then(ok, falha);
    },
  };
  return q;
}

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => ({ from: (t: string) => consulta(t) }) }));
vi.mock("server-only", () => ({}));

const { conferirLimite, lerLimitesDoGrupo, lerLimitesDetalhados } = await import("./usoDaIa");

const AGORA = new Date("2026-10-22T15:00:00Z");
const GRUPO = "00000000-0000-0000-0000-000000000009";

function grupo(plano: string, tetos: Partial<Record<"teto_artes" | "teto_videos" | "teto_mensagens_lista", number>> = {}) {
  return { plano, teto_artes: null, teto_videos: null, teto_mensagens_lista: null, ...tetos };
}

beforeEach(() => {
  filtros.length = 0;
  banco = { grupos: grupo("essencial"), uso: null, assentos: 1 };
});

describe("lerLimitesDoGrupo", () => {
  it("lê o mês de São Paulo do grupo pedido, sempre com o grupo no filtro", async () => {
    await lerLimitesDoGrupo(GRUPO, { agora: new Date("2026-11-01T02:00:00Z") });
    expect(filtros).toContainEqual({ tabela: "uso_da_ia", chave: "mes", valor: "2026-10-01" });
    for (const t of ["grupos", "uso_da_ia", "corretor_whatsapp_instancias"]) {
      expect(filtros.some((f) => f.tabela === t && ["id", "grupo_id"].includes(f.chave) && f.valor === GRUPO)).toBe(true);
    }
  });

  it("aplica o teto do plano ao uso do mês", async () => {
    banco.uso = { artes: 24, videos: 3, mensagens_lista: 100 };
    const l = await lerLimitesDoGrupo(GRUPO, { agora: AGORA });
    expect(l.arte).toMatchObject({ teto: 30, usados: 24, nivel: "aviso", restantes: 6 });
    expect(l.video).toMatchObject({ teto: 3, nivel: "esgotada", restantes: 0 });
    expect(l.lista).toMatchObject({ teto: 1000, nivel: "livre", restantes: 900 });
  });

  it("imobiliária soma os assentos em artes e vídeos, não na lista", async () => {
    banco.grupos = grupo("imobiliaria");
    banco.assentos = 6;
    const l = await lerLimitesDoGrupo(GRUPO, { agora: AGORA });
    expect([l.arte.teto, l.video.teto, l.lista.teto]).toEqual([300, 30, 2500]);
  });

  it("o ajuste da plataforma vence o plano, só no recurso ajustado", async () => {
    banco.grupos = grupo("profissional", { teto_artes: 7 });
    const d = await lerLimitesDetalhados(GRUPO, { agora: AGORA });
    expect(d.limites.arte.teto).toBe(7);
    expect(d.limites.video.teto).toBe(10);
    expect(d.ajustados).toEqual({ arte: 7, video: null, lista: null });
    expect(d.padroes).toEqual({ arte: 100, video: 10, lista: 2500 });
  });

  it("Next Home (plano custo): sem teto em nada, mesmo com uso enorme", async () => {
    banco.grupos = grupo("custo");
    banco.uso = { artes: 9999, videos: 9999, mensagens_lista: 99999 };
    const l = await lerLimitesDoGrupo(GRUPO, { agora: AGORA });
    for (const r of [l.arte, l.video, l.lista]) expect(r.nivel).toBe("sem_teto");
    for (const recurso of ["arte", "video", "lista"] as const) {
      expect((await conferirLimite(GRUPO, recurso, 50_000, AGORA)).ok).toBe(true);
    }
  });
});

describe("conferirLimite (a conferência antes de gastar)", () => {
  it("esgotado recusa com a mensagem do plano", async () => {
    banco.uso = { artes: 30, videos: 0, mensagens_lista: 0 };
    const r = await conferirLimite(GRUPO, "arte", 1, AGORA);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("Seu plano tem 30 artes por mês e elas acabaram. Voltam no dia 1º.");
  });

  it("com saldo, libera", async () => {
    banco.uso = { artes: 29, videos: 0, mensagens_lista: 0 };
    expect((await conferirLimite(GRUPO, "arte", 1, AGORA)).ok).toBe(true);
  });

  it("lista maior que o restante é recusada inteira, com a conta; do tamanho do restante, passa", async () => {
    banco.uso = { artes: 0, videos: 0, mensagens_lista: 900 };
    const cabe = await conferirLimite(GRUPO, "lista", 100, AGORA);
    expect(cabe.ok).toBe(true);
    const nao = await conferirLimite(GRUPO, "lista", 101, AGORA);
    expect(nao.ok).toBe(false);
    if (!nao.ok) {
      expect(nao.erro).toContain("101 mensagens de lista");
      expect(nao.erro).toContain("restam 100");
    }
  });

  it("falha de leitura NÃO bloqueia (loga e segue)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const falhaEm of ["grupos", "uso_da_ia", "corretor_whatsapp_instancias"] as const) {
      banco = { grupos: grupo("essencial"), uso: { artes: 30, videos: 3, mensagens_lista: 1000 }, assentos: 1, falhaEm };
      for (const recurso of ["arte", "video", "lista"] as const) {
        expect((await conferirLimite(GRUPO, recurso, 5000, AGORA)).ok).toBe(true);
      }
    }
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("grupo que não existe também não bloqueia", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    banco.grupos = null;
    expect((await conferirLimite(GRUPO, "video", 1, AGORA)).ok).toBe(true);
    log.mockRestore();
  });

  it("a plataforma pede o erro em voz alta (estrito)", async () => {
    banco.falhaEm = "uso_da_ia";
    await expect(lerLimitesDetalhados(GRUPO, { estrito: true })).rejects.toThrow(/limites do plano/);
  });
});
