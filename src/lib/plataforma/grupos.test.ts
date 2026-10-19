import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A lista de grupos do painel da plataforma (fase 2A, Task 3).
 *
 * Ela lê TODOS os grupos pela chave de serviço, de propósito. O que a mantém
 * honesta é o que ela NÃO lê: conversa, mensagem, dossiê e ficha de lead
 * (desenho §4, §11). O cliente falso registra cada tabela consultada.
 */

type Chamada = { tabela: string; select?: string; opcoes?: unknown; filtros: string[] };

const chamadas: Chamada[] = [];
let falharContagem = false;

const GRUPOS = [
  {
    id: "g1",
    nome: "Next Home",
    slug: "next-home",
    tipo: "imobiliaria",
    plano: "custo",
    situacao: "ativo",
    criado_em: "2026-10-01T00:00:00Z",
  },
  {
    id: "g2",
    nome: "Fulana Corretora",
    slug: "fulana",
    tipo: "independente",
    plano: "essencial",
    situacao: "suspenso",
    criado_em: "2026-10-10T00:00:00Z",
  },
];

/** Contagem que depende do grupo e dos filtros, para o teste ver o casamento. */
function contagem(c: Chamada): number {
  const grupo = c.filtros.find((f) => f.startsWith("eq:grupo_id="))?.split("=")[1];
  const base = grupo === "g1" ? 10 : 1;
  if (c.tabela === "corretores") return c.filtros.some((f) => f.startsWith("not:user_id")) ? base + 2 : base + 5;
  if (c.tabela === "corretor_whatsapp_instancias") return base + 3;
  return -1;
}

function consulta(tabela: string) {
  const c: Chamada = { tabela, filtros: [] };
  chamadas.push(c);
  const q = {
    select(cols: string, opcoes?: unknown) {
      c.select = cols;
      c.opcoes = opcoes;
      return q;
    },
    eq(coluna: string, valor: unknown) {
      c.filtros.push(`eq:${coluna}=${String(valor)}`);
      return q;
    },
    not(coluna: string, op: string, valor: unknown) {
      c.filtros.push(`not:${coluna}:${op}:${String(valor)}`);
      return q;
    },
    order() {
      return q;
    },
    maybeSingle() {
      const id = c.filtros.find((f) => f.startsWith("eq:id="))?.split("=")[1];
      return Promise.resolve({ data: GRUPOS.find((g) => g.id === id) ?? null, error: null });
    },
    then(ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) {
      const resposta =
        tabela === "grupos"
          ? { data: GRUPOS, error: null }
          : falharContagem
            ? { data: null, count: null, error: { message: "tempo esgotado" } }
            : { data: null, count: contagem(c), error: null };
      return Promise.resolve(resposta).then(ok, falha);
    },
  };
  return q;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ from: (tabela: string) => consulta(tabela) }),
}));

const { listarGruposDaPlataforma, lerGrupoDaPlataforma } = await import("./grupos");

const PROVA = { userId: "usuario-admin" };

describe("listarGruposDaPlataforma", () => {
  beforeEach(() => {
    chamadas.length = 0;
    falharContagem = false;
  });

  it("listar grupos não lê tabela de conversa nem de lead", async () => {
    await listarGruposDaPlataforma(PROVA);
    const tabelas = new Set(chamadas.map((c) => c.tabela));
    expect([...tabelas].sort()).toEqual(["corretor_whatsapp_instancias", "corretores", "grupos"]);
  });

  it("das pessoas e dos números só conta (head), nunca traz linha", async () => {
    await listarGruposDaPlataforma(PROVA);
    const contagens = chamadas.filter((c) => c.tabela !== "grupos");
    expect(contagens.length).toBeGreaterThan(0);
    for (const c of contagens) {
      expect(c.opcoes).toEqual({ count: "exact", head: true });
      // Toda contagem é recortada no grupo da linha.
      expect(c.filtros.some((f) => f.startsWith("eq:grupo_id="))).toBe(true);
    }
  });

  it("dos grupos lê só colunas de cadastro", async () => {
    await listarGruposDaPlataforma(PROVA);
    const doGrupo = chamadas.find((c) => c.tabela === "grupos")!;
    const colunas = doGrupo.select!.split(",").map((s) => s.trim()).sort();
    expect(colunas).toEqual(["criado_em", "id", "nome", "plano", "situacao", "slug", "tipo"]);
  });

  it("monta o resumo de cada grupo com as contagens dele", async () => {
    const resumo = await listarGruposDaPlataforma(PROVA);
    expect(resumo).toEqual([
      {
        id: "g1",
        nome: "Next Home",
        slug: "next-home",
        tipo: "imobiliaria",
        plano: "custo",
        situacao: "ativo",
        criadoEm: "2026-10-01T00:00:00Z",
        corretoresAtivos: 15,
        comLogin: 12,
        numerosConectados: 13,
      },
      {
        id: "g2",
        nome: "Fulana Corretora",
        slug: "fulana",
        tipo: "independente",
        plano: "essencial",
        situacao: "suspenso",
        criadoEm: "2026-10-10T00:00:00Z",
        corretoresAtivos: 6,
        comLogin: 3,
        numerosConectados: 4,
      },
    ]);
    // Corretor ativo e número conectado: o filtro que dá sentido ao número.
    const ativos = chamadas.filter((c) => c.tabela === "corretores");
    expect(ativos.every((c) => c.filtros.includes("eq:ativo=true"))).toBe(true);
    const numeros = chamadas.filter((c) => c.tabela === "corretor_whatsapp_instancias");
    expect(numeros.every((c) => c.filtros.includes("eq:status_conexao=conectado"))).toBe(true);
  });

  it("contagem que falha derruba a lista em vez de mostrar zero", async () => {
    falharContagem = true;
    await expect(listarGruposDaPlataforma(PROVA)).rejects.toThrow(/tempo esgotado/);
  });
});

describe("lerGrupoDaPlataforma", () => {
  beforeEach(() => {
    chamadas.length = 0;
    falharContagem = false;
  });

  it("um grupo lê o cadastro e conta, sem tabela de conversa nem de lead", async () => {
    const grupo = await lerGrupoDaPlataforma(PROVA, "g2");
    expect(grupo).toMatchObject({ id: "g2", nome: "Fulana Corretora", corretoresAtivos: 6, comLogin: 3, numerosConectados: 4 });
    expect([...new Set(chamadas.map((c) => c.tabela))].sort()).toEqual([
      "corretor_whatsapp_instancias",
      "corretores",
      "grupos",
    ]);
    const colunas = chamadas.find((c) => c.tabela === "grupos")!.select!.split(",").map((s) => s.trim());
    expect(colunas).toEqual(expect.arrayContaining(["contato_cobranca_email", "documento", "encarregado_lgpd_email"]));
    for (const c of chamadas.filter((c) => c.tabela !== "grupos")) {
      expect(c.opcoes).toEqual({ count: "exact", head: true });
    }
  });

  it("grupo que não existe volta nulo, sem contar nada", async () => {
    expect(await lerGrupoDaPlataforma(PROVA, "nao-existe")).toBeNull();
    expect(chamadas.map((c) => c.tabela)).toEqual(["grupos"]);
  });
});
