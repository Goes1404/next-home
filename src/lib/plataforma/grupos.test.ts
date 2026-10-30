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
    dia_do_vencimento: 1,
    mensalidade: null,
    creci: null,
    teto_respostas_ia: null,
  },
  {
    id: "g2",
    nome: "Fulana Corretora",
    slug: "fulana",
    tipo: "independente",
    plano: "essencial",
    situacao: "suspenso",
    criado_em: "2026-10-10T00:00:00Z",
    dia_do_vencimento: 10,
    mensalidade: "299.00",
    creci: "98765-F",
    teto_respostas_ia: null,
  },
];

/** Só a competência de agosto paga: outubro (vence dia 1) fica em aberto. */
const PAGAMENTOS = [{ id: "p1", competencia: "2026-09-01", valor: 250, pago_em: "2026-09-02", observacao: null }];

/** Contagem que depende do grupo e dos filtros, para o teste ver o casamento. */
function contagem(c: Chamada): number {
  const grupo = c.filtros.find((f) => f.startsWith("eq:grupo_id="))?.split("=")[1];
  const base = grupo === "g1" ? 10 : 1;
  if (c.tabela === "corretores") return c.filtros.some((f) => f.startsWith("not:user_id")) ? base + 2 : base + 5;
  if (c.tabela === "corretor_whatsapp_instancias") {
    // Conectados (o número no ar) ou todos (os assentos da cota da IA).
    return c.filtros.some((f) => f.startsWith("eq:status_conexao=")) ? base + 3 : base + 4;
  }
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
    limit() {
      return q;
    },
    maybeSingle() {
      if (tabela === "uso_da_ia") {
        const grupo = c.filtros.find((f) => f.startsWith("eq:grupo_id="))?.split("=")[1];
        return Promise.resolve({ data: grupo === "g2" ? { respostas: 850 } : { respostas: 4000 }, error: null });
      }
      const id = c.filtros.find((f) => f.startsWith("eq:id="))?.split("=")[1];
      return Promise.resolve({ data: GRUPOS.find((g) => g.id === id) ?? null, error: null });
    },
    then(ok: (v: unknown) => unknown, falha?: (e: unknown) => unknown) {
      const resposta =
        tabela === "grupos"
          ? { data: GRUPOS, error: null }
          : tabela === "pagamentos_do_grupo"
            ? { data: PAGAMENTOS, error: null }
            : tabela === "enderecos_do_site"
            ? { data: [{ host: "sol.com.br", tipo: "proprio", principal: true }], error: null }
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
    expect([...tabelas].sort()).toEqual([
      "corretor_whatsapp_instancias",
      "corretores",
      "grupos",
      "pagamentos_do_grupo",
      "uso_da_ia",
    ]);
  });

  it("das pessoas e dos números só conta (head), nunca traz linha", async () => {
    await listarGruposDaPlataforma(PROVA);
    const contagens = chamadas.filter((c) => !["grupos", "uso_da_ia", "pagamentos_do_grupo"].includes(c.tabela));
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
    expect(colunas).toEqual([
      "creci",
      "criado_em",
      "dia_do_vencimento",
      "id",
      "mensalidade",
      "nome",
      "plano",
      // O ramo do negócio (0244): o selo da lista.
      "ramo",
      "ramo_descricao",
      "situacao",
      "slug",
      "teste_ate",
      "teto_respostas_ia",
      "tipo",
    ]);
  });

  it("monta o resumo de cada grupo com as contagens dele", async () => {
    const resumo = await listarGruposDaPlataforma(PROVA);
    expect(resumo).toEqual([
      {
        id: "g1",
        nome: "Next Home",
        slug: "next-home",
        tipo: "imobiliaria",
        // Linha sem a coluna (mock de antes da 0244) = imobiliária.
        ramo: "imobiliaria",
        ramoDescricao: null,
        plano: "custo",
        situacao: "ativo",
        criadoEm: "2026-10-01T00:00:00Z",
        mensalidade: null,
        creci: null,
        corretoresAtivos: 15,
        comLogin: 12,
        numerosConectados: 13,
        tetoAjustado: null,
        tetoDoPlano: null,
        // Preço de custo: sem teto, por mais que use.
        usoDaIa: { respostas: 4000, teto: null, percentual: null, restantes: null, nivel: "sem_teto" },
        // Preço de custo: nunca é cobrado (a conta é a de cobranca.ts).
        cobranca: expect.objectContaining({ estado: "isento", competenciaEmAberto: null }),
      },
      {
        id: "g2",
        nome: "Fulana Corretora",
        slug: "fulana",
        tipo: "independente",
        ramo: "imobiliaria",
        ramoDescricao: null,
        plano: "essencial",
        situacao: "suspenso",
        criadoEm: "2026-10-10T00:00:00Z",
        mensalidade: 299,
        creci: "98765-F",
        corretoresAtivos: 6,
        comLogin: 3,
        numerosConectados: 4,
        tetoAjustado: null,
        tetoDoPlano: 1000,
        // Essencial: 1.000 no mês; 850 já é aviso.
        usoDaIa: { respostas: 850, teto: 1000, percentual: 85, restantes: 150, nivel: "aviso" },
        // Suspenso à mão (`situacao`) vence qualquer pagamento.
        cobranca: expect.objectContaining({ estado: "suspenso" }),
      },
    ]);
    // Corretor ativo e número conectado: o filtro que dá sentido ao número.
    const ativos = chamadas.filter((c) => c.tabela === "corretores");
    expect(ativos.every((c) => c.filtros.includes("eq:ativo=true"))).toBe(true);
    const numeros = chamadas.filter((c) => c.tabela === "corretor_whatsapp_instancias");
    expect(numeros.filter((c) => c.filtros.includes("eq:status_conexao=conectado"))).toHaveLength(2);
    // Os pagamentos também são lidos no grupo da linha, e só a competência.
    const pagamentos = chamadas.filter((c) => c.tabela === "pagamentos_do_grupo");
    expect(pagamentos).toHaveLength(2);
    for (const c of pagamentos) {
      expect(c.select).toBe("competencia");
      expect(c.filtros.some((f) => f.startsWith("eq:grupo_id="))).toBe(true);
    }
    // O uso da IA é lido no grupo e no mês de São Paulo.
    const uso = chamadas.filter((c) => c.tabela === "uso_da_ia");
    expect(uso).toHaveLength(2);
    for (const c of uso) {
      expect(c.filtros.some((f) => f.startsWith("eq:grupo_id="))).toBe(true);
      expect(c.filtros.some((f) => /^eq:mes=\d{4}-\d{2}-01$/.test(f))).toBe(true);
    }
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
    expect(grupo).toMatchObject({
      id: "g2",
      nome: "Fulana Corretora",
      corretoresAtivos: 6,
      comLogin: 3,
      numerosConectados: 4,
      mensalidade: 299,
      diaDoVencimento: 10,
      pagamentos: [{ id: "p1", competencia: "2026-09-01", valor: 250, pagoEm: "2026-09-02", observacao: null }],
      enderecos: [{ host: "sol.com.br", tipo: "proprio", principal: true }],
    });
    expect([...new Set(chamadas.map((c) => c.tabela))].sort()).toEqual([
      "corretor_whatsapp_instancias",
      "corretores",
      "enderecos_do_site",
      "grupos",
      "pagamentos_do_grupo",
      "uso_da_ia",
    ]);
    const colunas = chamadas.find((c) => c.tabela === "grupos")!.select!.split(",").map((s) => s.trim());
    expect(colunas).toEqual(expect.arrayContaining(["contato_cobranca_email", "documento", "encarregado_lgpd_email"]));
    // O histórico traz linha de pagamento (só valor e data, nada de conversa).
    const historico = chamadas.filter((c) => c.tabela === "pagamentos_do_grupo" && c.select !== "competencia");
    expect(historico).toHaveLength(1);
    expect(historico[0].select).toBe("id, competencia, valor, pago_em, observacao");
    for (const c of chamadas.filter((c) => !["grupos", "uso_da_ia", "pagamentos_do_grupo", "enderecos_do_site"].includes(c.tabela))) {
      expect(c.opcoes).toEqual({ count: "exact", head: true });
    }
  });

  it("grupo que não existe volta nulo, sem contar nada", async () => {
    expect(await lerGrupoDaPlataforma(PROVA, "nao-existe")).toBeNull();
    expect(chamadas.map((c) => c.tabela)).toEqual(["grupos"]);
  });
});
