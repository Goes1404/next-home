import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CARTEIRA_EQUIPE,
  CORRETOR_NENHUM,
  corretorDoRecorte,
  decidirCarteira,
} from "./carteiraDaVisao";

/*
 * Hotfix de 19/10/2026: "em produção está misturando os leads de todos os
 * corretores na conta do ADM". A decisão de QUAL carteira a tela de trabalho
 * mostra mora num lugar só; aqui ela é testada pura, e abaixo pela consulta
 * de verdade (`getPaginaDeLeads`) contra um cliente falso que grava os
 * filtros pedidos ao banco.
 */

const GESTOR = { id: "11111111-1111-4111-8111-111111111111", papel: "gestor" };
const CORRETOR = { id: "22222222-2222-4222-8222-222222222222", papel: "corretor" };
const OUTRO = "33333333-3333-4333-8333-333333333333";

describe("decidirCarteira", () => {
  it("gestor sem parâmetro vê só os dele", () => {
    expect(decidirCarteira(GESTOR)).toEqual({ tipo: "minha", corretorId: GESTOR.id });
    expect(decidirCarteira(GESTOR, "")).toEqual({ tipo: "minha", corretorId: GESTOR.id });
  });

  it("gestor com ?corretor=X vê a carteira de X", () => {
    expect(decidirCarteira(GESTOR, OUTRO)).toEqual({ tipo: "de_outro", corretorId: OUTRO });
  });

  it("gestor com ?corretor=equipe vê a equipe", () => {
    expect(decidirCarteira(GESTOR, CARTEIRA_EQUIPE)).toEqual({ tipo: "equipe" });
  });

  it("gestor pedindo a si mesmo é a carteira dele, sem faixa de 'carteira alheia'", () => {
    expect(decidirCarteira(GESTOR, GESTOR.id)).toEqual({ tipo: "minha", corretorId: GESTOR.id });
  });

  it("lixo na URL não vira erro de UUID no banco: vira os dele", () => {
    expect(decidirCarteira(GESTOR, "abc' or 1=1")).toEqual({ tipo: "minha", corretorId: GESTOR.id });
  });

  it("corretor comum com ?corretor=X (ou equipe) continua vendo só os dele", () => {
    expect(decidirCarteira(CORRETOR, OUTRO)).toEqual({ tipo: "minha", corretorId: CORRETOR.id });
    expect(decidirCarteira(CORRETOR, CARTEIRA_EQUIPE)).toEqual({ tipo: "minha", corretorId: CORRETOR.id });
  });

  it("sem sessão não há carteira — e o recorte nunca fica aberto", () => {
    const c = decidirCarteira(null, OUTRO);
    expect(c).toEqual({ tipo: "nenhuma" });
    expect(corretorDoRecorte(c)).toBe(CORRETOR_NENHUM);
  });

  it("só a equipe pedida pelo gestor dispensa o filtro de corretor", () => {
    expect(corretorDoRecorte({ tipo: "equipe" })).toBeNull();
    expect(corretorDoRecorte({ tipo: "minha", corretorId: GESTOR.id })).toBe(GESTOR.id);
    expect(corretorDoRecorte({ tipo: "de_outro", corretorId: OUTRO })).toBe(OUTRO);
  });
});

/* ------------------------------------------------------------------ */
/* A consulta de verdade, contra um cliente falso                      */
/* ------------------------------------------------------------------ */

type Chamada = { tabela: string; metodo: string; args: unknown[] };
const chamadas: Chamada[] = [];
let logado: { id: string; papel: string } | null = GESTOR;

function construtor(tabela: string) {
  const resultado = { data: [] as unknown[], error: null, count: 0 };
  const alvo: Record<string, unknown> = {
    then: (ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) =>
      Promise.resolve(resultado).then(ok, falha),
    maybeSingle: () => {
      if (tabela === "corretores" && logado) {
        return Promise.resolve({
          data: {
            id: logado.id,
            slug: "alguem",
            nome: "Alguém",
            creci: null,
            whatsapp: "5511999999999",
            foto_url: null,
            video_url: null,
            fundo_tipo: "padrao",
            fundo_foto_url: null,
            bio: null,
            papel: logado.papel,
            ativo: true,
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  const proxy: unknown = new Proxy(alvo, {
    get(t, prop: string) {
      if (prop in t) return t[prop];
      return (...args: unknown[]) => {
        chamadas.push({ tabela, metodo: prop, args });
        return proxy;
      };
    },
  });
  return proxy;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => ({ data: logado ? { claims: { sub: "user-" + logado.id } } : null }),
    },
    from: (tabela: string) => construtor(tabela),
  }),
}));

/** Os `eq("corretor_id", …)` pedidos à tabela de leads. */
function recortesEmLeads(): unknown[] {
  return chamadas
    .filter((c) => c.tabela === "leads" && c.metodo === "eq" && c.args[0] === "corretor_id")
    .map((c) => c.args[1]);
}

describe("getPaginaDeLeads recorta pela carteira da visão", () => {
  beforeEach(() => {
    chamadas.length = 0;
    vi.resetModules();
  });

  async function pagina(corretorId?: string, extra: Record<string, unknown> = {}) {
    const { getPaginaDeLeads } = await import("./corretorSessao");
    await getPaginaDeLeads({ corretorId, ...extra });
  }

  it("gestor sem parâmetro → só os dele", async () => {
    logado = GESTOR;
    await pagina();
    expect(recortesEmLeads()).toEqual([GESTOR.id]);
  });

  it("gestor com ?corretor=X → os de X", async () => {
    logado = GESTOR;
    await pagina(OUTRO);
    expect(recortesEmLeads()).toEqual([OUTRO]);
  });

  it("gestor com ?corretor=equipe → a equipe (sem filtro de corretor)", async () => {
    logado = GESTOR;
    await pagina(CARTEIRA_EQUIPE);
    expect(recortesEmLeads()).toEqual([]);
  });

  it("gestor com ?dono=sem → a equipe, filtrando os sem dono", async () => {
    logado = GESTOR;
    await pagina(undefined, { semDono: true });
    expect(recortesEmLeads()).toEqual([]);
    expect(chamadas.some((c) => c.tabela === "leads" && c.metodo === "is" && c.args[0] === "corretor_id")).toBe(true);
  });

  it("corretor comum com ?corretor=X → só os dele", async () => {
    logado = CORRETOR;
    await pagina(OUTRO);
    expect(recortesEmLeads()).toEqual([CORRETOR.id]);
  });

  it("sem sessão → um id que não casa com ninguém, nunca a consulta aberta", async () => {
    logado = null;
    await pagina(OUTRO);
    expect(recortesEmLeads()).toEqual([CORRETOR_NENHUM]);
  });

  it("as contagens do funil e o quadro também recortam pelo gestor logado", async () => {
    logado = GESTOR;
    const sessao = await import("./corretorSessao");
    await sessao.getContagemPorEtapa();
    await sessao.getLeadsDoFunil();
    await sessao.getLeadsDeVisita();
    await sessao.contarLeadsArquivados();
    const recortes = recortesEmLeads();
    expect(recortes.length).toBeGreaterThan(6);
    expect(new Set(recortes)).toEqual(new Set([GESTOR.id]));
  });
});
