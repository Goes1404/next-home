import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GRUPO_NEXT_HOME_ID } from "./grupo";

/**
 * Portas de entrada que LEEM ficam dentro do grupo (Task 12, L08–L15, L19).
 *
 * As portas abaixo rodam pela chave de serviço, que enxerga todos os grupos:
 * a consulta que vem ANTES da gravação (o imóvel citado no e-mail, o
 * duplicado por telefone, o lead "alheio" da palavra-chave, o corretor que o
 * navegador manda) é que atravessaria o grupo. Os testes usam um banco falso
 * em memória que APLICA os filtros e registra cada consulta: o grupo de
 * outra linha só some se a porta filtrar por ele.
 */

const GRUPO_B = "00000000-0000-0000-0000-00000000000b";

type Linha = Record<string, unknown>;
type Consulta = { tabela: string; operacao: string; filtros: string[]; valores?: unknown };

const banco: Record<string, Linha[]> = {};
const consultas: Consulta[] = [];

function valorDe(linha: Linha, coluna: string): unknown {
  // `detalhes->>alerta`: o texto de uma chave do jsonb.
  const [col, chave] = coluna.split("->>");
  if (chave === undefined) return linha[col];
  const objeto = linha[col] as Record<string, unknown> | null | undefined;
  const v = objeto?.[chave];
  return v === undefined || v === null ? null : String(v);
}

/** Um construtor de consulta do PostgREST, com os filtros que as portas usam. */
function consulta(tabela: string) {
  const registro: Consulta = { tabela, operacao: "select", filtros: [] };
  const predicados: ((l: Linha) => boolean)[] = [];
  let modo: "lista" | "um" | "contagem" = "lista";
  let limite = Infinity;

  const executar = () => {
    consultas.push(registro);
    const linhas = (banco[tabela] ?? []).filter((l) => predicados.every((p) => p(l)));
    if (registro.operacao === "insert") {
      const novas = ([] as Linha[]).concat(registro.valores as Linha).map((l, i) => ({
        id: `${tabela}-novo-${(banco[tabela]?.length ?? 0) + i}`,
        ...l,
      }));
      banco[tabela] = [...(banco[tabela] ?? []), ...novas];
      return { data: modo === "um" ? novas[0] : novas, error: null };
    }
    if (registro.operacao === "update") {
      for (const l of linhas) Object.assign(l, registro.valores as Linha);
      return { data: linhas, error: null };
    }
    const fatia = linhas.slice(0, limite);
    if (modo === "contagem") return { data: null, count: fatia.length, error: null };
    if (modo === "um") return { data: fatia[0] ?? null, error: null };
    return { data: fatia, error: null };
  };

  const q = {
    select: (_colunas?: string, opcoes?: { head?: boolean }) => {
      if (opcoes?.head) modo = "contagem";
      return q;
    },
    insert: (valores: unknown) => {
      registro.operacao = "insert";
      registro.valores = valores;
      return q;
    },
    update: (valores: unknown) => {
      registro.operacao = "update";
      registro.valores = valores;
      return q;
    },
    eq: (col: string, v: unknown) => {
      registro.filtros.push(`eq:${col}`);
      predicados.push((l) => valorDe(l, col) === v);
      return q;
    },
    neq: (col: string, v: unknown) => {
      registro.filtros.push(`neq:${col}`);
      predicados.push((l) => valorDe(l, col) !== v);
      return q;
    },
    in: (col: string, vs: unknown[]) => {
      registro.filtros.push(`in:${col}`);
      predicados.push((l) => vs.includes(valorDe(l, col)));
      return q;
    },
    is: (col: string, v: unknown) => {
      registro.filtros.push(`is:${col}`);
      predicados.push((l) => (valorDe(l, col) ?? null) === v);
      return q;
    },
    not: (col: string, _op: string, v: unknown) => {
      registro.filtros.push(`not:${col}`);
      predicados.push((l) => (valorDe(l, col) ?? null) !== v);
      return q;
    },
    gte: (col: string, v: string) => {
      registro.filtros.push(`gte:${col}`);
      predicados.push((l) => String(valorDe(l, col) ?? "") >= v);
      return q;
    },
    filter: (col: string, op: string, v: string) => {
      registro.filtros.push(`filter:${col}`);
      if (op === "in") {
        const lista = v.replace(/[()]/g, "").split(",");
        predicados.push((l) => lista.includes(String(valorDe(l, col))));
      }
      return q;
    },
    order: () => q,
    limit: (n: number) => {
      limite = n;
      return q;
    },
    maybeSingle: () => {
      modo = "um";
      return Promise.resolve(executar());
    },
    single: () => {
      modo = "um";
      return Promise.resolve(executar());
    },
    then: <T,>(resolver: (r: ReturnType<typeof executar>) => T) => Promise.resolve(executar()).then(resolver),
  };
  return q;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabela: string) => consulta(tabela),
    // Contagem de primeiro contato (0222): o corretor ainda não abriu nenhuma conversa.
    rpc: async () => ({ data: 0, error: null }),
  }),
}));

const extrairVariosLeadsComIA = vi.fn();
vi.mock("@/lib/inbound/aiParser", () => ({
  extrairVariosLeadsComIA: (...args: unknown[]) => extrairVariosLeadsComIA(...args),
}));

const gerarEEnviarPelaIA = vi.fn(async () => ({ enviou: true }));
vi.mock("@/lib/whatsapp/aberturaPelaIA", () => ({
  gerarEEnviarPelaIA: (...args: unknown[]) => gerarEEnviarPelaIA(...(args as [])),
}));

vi.mock("@/lib/corretorAtivo", () => ({ getCorretorAtivo: async () => null }));

const { processarEmailDeLead } = await import("@/lib/inbound/processarEmail");
const { avisarQuemPediuAlerta } = await import("@/lib/crm/avisoDeNovidade");
const { cadastrarPelaPalavraChave } = await import("@/lib/whatsapp/repositorio");
const { POST: postClique } = await import("@/app/api/clique-whatsapp/route");
const { integracaoLiberada } = await import("./integracoes");

function limparBanco(tabelas: Record<string, Linha[]>) {
  for (const t of Object.keys(banco)) delete banco[t];
  Object.assign(banco, structuredClone(tabelas));
  consultas.length = 0;
}

/** As consultas de leitura de uma tabela que NÃO filtraram pelo grupo. */
function leiturasSemGrupo(tabela: string): Consulta[] {
  return consultas.filter(
    (c) => c.tabela === tabela && c.operacao === "select" && !c.filtros.includes("eq:grupo_id") && !c.filtros.includes("in:grupo_id"),
  );
}

describe("integracaoLiberada", () => {
  it("integracaoLiberada só para o grupo 1", () => {
    for (const qual of ["meta", "gmail", "pixel"] as const) {
      expect(integracaoLiberada(GRUPO_NEXT_HOME_ID, qual), qual).toBe(true);
      expect(integracaoLiberada(GRUPO_B, qual), qual).toBe(false);
    }
  });
});

describe("processarEmailDeLead", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    extrairVariosLeadsComIA.mockResolvedValue([
      {
        nome: "Ana",
        telefone: "11991234567",
        email: null,
        imovelInteresse: "Vista Parque",
        codigoReferencia: null,
        corretorMencionado: "Bruna",
        portalOrigem: "zap",
        mensagemOriginal: "Quero visitar",
      },
    ]);
  });

  it("processarEmailDeLead filtra imóveis, corretores e dedupe pelo grupo", async () => {
    // Tudo o que casaria com o e-mail mora no grupo B; o e-mail é do grupo 1.
    limparBanco({
      empreendimentos: [
        { id: "imovel-b", nome: "Vista Parque", slug: "vista-parque-b", grupo_id: GRUPO_B },
        { id: "imovel-1", nome: "Vista Parque", slug: "vista-parque", grupo_id: GRUPO_NEXT_HOME_ID },
      ],
      corretores: [{ id: "bruna-b", nome: "Bruna", slug: "bruna", ativo: true, grupo_id: GRUPO_B }],
      leads: [
        {
          id: "lead-b",
          telefone_e164: "5511991234567",
          email_message_id: "msg-1",
          arquivado_em: null,
          mensagem: "ficha de B",
          empreendimento_id: null,
          grupo_id: GRUPO_B,
        },
      ],
      inbound_logs: [],
    });

    const r = await processarEmailDeLead(
      { from: "portal@zap", to: "leads@nh", subject: "Novo lead", messageId: "msg-1" } as never,
      { grupoId: GRUPO_NEXT_HOME_ID },
    );

    // O mesmo e-mail e o mesmo telefone em B não fazem o lead do grupo 1
    // virar "duplicado", e a ficha de B não é reescrita.
    expect(r.totalInseridos).toBe(1);
    expect(r.totalDeduplicados).toBe(0);
    expect(banco.leads.find((l) => l.id === "lead-b")?.mensagem).toBe("ficha de B");
    const novo = banco.leads.find((l) => l.id !== "lead-b")!;
    expect(novo.grupo_id).toBe(GRUPO_NEXT_HOME_ID);
    // O imóvel é o do grupo; a Bruna de B não vira dona do lead do grupo 1.
    expect(novo.empreendimento_id).toBe("imovel-1");
    expect(novo.corretor_id).toBeNull();
    for (const tabela of ["leads", "empreendimentos", "corretores"]) {
      expect(leiturasSemGrupo(tabela), tabela).toEqual([]);
    }
  });
});

describe("avisarQuemPediuAlerta", () => {
  const leadComAlerta = (grupo: string) => ({
    id: "lead-alerta",
    grupo_id: grupo,
    nome: "Cliente",
    telefone_e164: "5511990000001",
    corretor_id: "corretor-1",
    detalhes: { alerta: true, avisados: [] },
    regiao_interesse: "Barueri",
    dormitorios_min: null,
    orcamento_max: null,
    nao_contatar_em: null,
    arquivado_em: null,
    etapa: "novo",
    created_at: "2026-10-19T00:00:00.000Z",
  });
  const imovelNovo = (grupo: string) => ({
    id: "imovel-novo",
    grupo_id: grupo,
    nome: "Lançamento",
    slug: "lancamento",
    cidade: "Barueri",
    bairro: "Centro",
    preco_a_partir: null,
    tipologias: [],
    publicado: true,
    created_at: new Date().toISOString(),
  });

  // Número conectado há meses, sem queda recente: tem vaga de primeiro contato.
  const numeroAntigo = {
    corretor_id: "corretor-1",
    status_conexao: "desconectado",
    conectado_em: "2026-01-01T12:00:00.000Z",
    aquecimento_desde: null,
  };

  it("avisarQuemPediuAlerta não casa grupos diferentes", async () => {
    limparBanco({ empreendimentos: [imovelNovo(GRUPO_B)], leads: [leadComAlerta(GRUPO_NEXT_HOME_ID)] });
    expect(await avisarQuemPediuAlerta()).toBe(0);
    // A trava de repetição nem chegou a ser gravada: não houve casamento.
    expect(consultas.filter((c) => c.tabela === "leads" && c.operacao === "update")).toEqual([]);
    expect(gerarEEnviarPelaIA).not.toHaveBeenCalled();
  });

  it("no mesmo grupo o imóvel novo casa (o teste acima não passa por acaso)", async () => {
    limparBanco({
      empreendimentos: [imovelNovo(GRUPO_B)],
      leads: [leadComAlerta(GRUPO_B)],
      corretor_whatsapp_instancias: [numeroAntigo],
    });
    await avisarQuemPediuAlerta();
    expect(consultas.filter((c) => c.tabela === "leads" && c.operacao === "update")).toHaveLength(1);
  });

  it("número em quarentena: o aviso a quem nunca escreveu espera, sem marcar o imóvel como avisado", async () => {
    limparBanco({
      empreendimentos: [imovelNovo(GRUPO_B)],
      leads: [leadComAlerta(GRUPO_B)],
      corretor_whatsapp_instancias: [{ ...numeroAntigo, aquecimento_desde: new Date().toISOString() }],
    });
    await avisarQuemPediuAlerta();
    expect(consultas.filter((c) => c.tabela === "leads" && c.operacao === "update")).toEqual([]);
    expect(gerarEEnviarPelaIA).not.toHaveBeenCalled();
  });
});

describe("cadastrarPelaPalavraChave", () => {
  it("cadastrarPelaPalavraChave não consulta leads de outro grupo", async () => {
    // O número é cliente de um corretor do grupo B; quem digitou é do grupo 1.
    limparBanco({
      leads: [
        { id: "lead-b", telefone_e164: "5511991234567", corretor_id: "corretor-b", grupo_id: GRUPO_B, created_at: "x" },
      ],
    });
    const r = await cadastrarPelaPalavraChave({
      corretorId: "corretor-1",
      grupoId: GRUPO_NEXT_HOME_ID,
      telefoneCliente: "5511991234567",
      teste: false,
    });
    // Fora do grupo, o número é tratado como novo: não vira "lead de outro
    // corretor" (que revelaria o cliente de outra empresa).
    expect(r.desfecho).toBe("cadastrado");
    const alheio = consultas.find((c) => c.tabela === "leads" && c.filtros.includes("neq:corretor_id"));
    expect(alheio?.filtros).toContain("eq:grupo_id");
  });
});

describe("/api/clique-whatsapp", () => {
  const clique = (corpo: unknown) =>
    postClique(new Request("http://localhost/api/clique-whatsapp", { method: "POST", body: JSON.stringify(corpo) }));
  const ID_B = "11111111-1111-4111-8111-111111111111";
  const ID_1 = "22222222-2222-4222-8222-222222222222";

  it("/api/clique-whatsapp descarta corretorId de outro grupo", async () => {
    limparBanco({
      corretores: [
        { id: ID_B, grupo_id: GRUPO_B },
        { id: ID_1, grupo_id: GRUPO_NEXT_HOME_ID },
      ],
      cliques_whatsapp: [],
    });
    await clique({ corretorId: ID_B, origem: "site/imovel" });
    await clique({ corretorId: ID_1, origem: "site/imovel" });
    // Gravado pela chave de serviço, sempre no grupo do site; o corretor de
    // B some, o do grupo fica.
    expect(banco.cliques_whatsapp.map((c) => [c.grupo_id, c.corretor_id])).toEqual([
      [GRUPO_NEXT_HOME_ID, null],
      [GRUPO_NEXT_HOME_ID, ID_1],
    ]);
  });
});

/*
 * Guarda de código-fonte: nas portas de entrada, toda LEITURA de `leads`,
 * `empreendimentos` ou `corretores` cita `grupo_id` no mesmo encadeamento
 * (filtro, ou a coluna lida para casar por grupo). A regressão é calada: a
 * porta segue funcionando com um grupo só e atravessa grupos no dia em que
 * existir o segundo.
 */
const PORTAS: { arquivo: string; funcoes?: string[] }[] = [
  { arquivo: "src/lib/inbound/processarEmail.ts" },
  { arquivo: "src/lib/inbound/gmailCaixa.ts" },
  { arquivo: "src/app/api/webhooks/meta/route.ts" },
  { arquivo: "src/lib/metaAds.ts" },
  { arquivo: "src/app/api/cron/meta-ads/route.ts" },
  {
    arquivo: "src/lib/whatsapp/repositorio.ts",
    funcoes: ["cadastrarPelaPalavraChave", "registrarAtivacaoEmLeadAlheio"],
  },
  { arquivo: "src/app/wa/route.ts" },
  { arquivo: "src/app/wa/[campanha]/route.ts" },
  { arquivo: "src/app/s/[site]/(institucional)/parceiro/[token]/page.tsx" },
  { arquivo: "src/app/s/[site]/(institucional)/parceiro/[token]/acoes.ts" },
  { arquivo: "src/app/corretor/(painel)/admin/parceiros/acoes.ts" },
  { arquivo: "src/lib/crm/avisoDeNovidade.ts" },
  { arquivo: "src/app/api/leads/route.ts" },
  { arquivo: "src/app/api/clique-whatsapp/route.ts" },
  { arquivo: "src/lib/catalogo/cache.ts" },
  { arquivo: "src/lib/queries.ts" },
  { arquivo: "src/app/corretor/(painel)/admin/anuncios/acoes.ts" },
  { arquivo: "src/app/corretor/(painel)/admin/anuncios/ContaDaMeta.tsx" },
  { arquivo: "src/app/api/gmail/conectar/route.ts" },
];

const TABELAS_DO_GRUPO = ["leads", "empreendimentos", "corretores"];

/** Tira comentários de bloco e de linha (sem comer `https://` de string). */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** O corpo de `export async function <nome>(` até a próxima declaração exportada. */
function corpoDe(codigo: string, nome: string): string {
  const inicio = codigo.indexOf(`export async function ${nome}(`);
  if (inicio < 0) throw new Error(`função ${nome} não encontrada`);
  const fim = codigo.indexOf("\nexport ", inicio + 10);
  return codigo.slice(inicio, fim < 0 ? undefined : fim);
}

/** O encadeamento `.from("x").a(...).b(...)` que começa em `inicio`. */
function encadeamento(codigo: string, inicio: number): string {
  let i = inicio;
  let fim = inicio;
  for (;;) {
    const passo = /^\s*\.\s*[A-Za-z_$][\w$]*\s*(<[^>()]*>)?\s*\(/.exec(codigo.slice(i));
    if (!passo) break;
    i += passo[0].length;
    let profundidade = 1;
    while (i < codigo.length && profundidade > 0) {
      if (codigo[i] === "(") profundidade++;
      else if (codigo[i] === ")") profundidade--;
      i++;
    }
    fim = i;
  }
  return codigo.slice(inicio, fim);
}

/** As leituras sem `grupo_id` nas portas: o que a guarda acusa. */
function leiturasForaDoGrupo(): { encontradas: number; fora: string[] } {
  const fora: string[] = [];
  let encontradas = 0;
  for (const { arquivo, funcoes } of PORTAS) {
    const inteiro = semComentarios(readFileSync(arquivo, "utf8"));
    const trechos = funcoes ? funcoes.map((f) => corpoDe(inteiro, f)) : [inteiro];
    for (const trecho of trechos) {
      for (const m of trecho.matchAll(/\.from\(\s*"(\w+)"\s*\)/g)) {
        if (!TABELAS_DO_GRUPO.includes(m[1])) continue;
        const cadeia = encadeamento(trecho, m.index!);
        const escreve = /\.(insert|update|upsert|delete)\s*\(/.test(cadeia);
        if (escreve || !/\.select\s*\(/.test(cadeia)) continue;
        encontradas++;
        if (!cadeia.includes("grupo_id")) fora.push(`${arquivo}: ${cadeia.replace(/\s+/g, " ").slice(0, 120)}`);
      }
    }
  }
  return { encontradas, fora };
}

describe("guarda: portas de entrada leem dentro do grupo", () => {
  it("toda leitura de leads, empreendimentos e corretores cita grupo_id", () => {
    const { encontradas, fora } = leiturasForaDoGrupo();
    // Um piso: se o recorte parar de achar as leituras, a guarda aprovaria
    // tudo calada.
    expect(encontradas).toBeGreaterThanOrEqual(15);
    expect(fora).toEqual([]);
  });
});

/**
 * Rodada 1 da Task 12: `getEmpreendimentos` tinha `grupoDoSite()` como
 * padrão, e todo chamador que não passava o grupo lia calado o catálogo do
 * grupo 1 — a seleção, a proposta e o portal de um corretor do grupo B
 * saíam vazios, e o painel dele mostrava o catálogo da Next Home. Sem
 * padrão, o `tsc` lista cada chamador; esta guarda impede o padrão de
 * voltar e o grupo do SITE de entrar onde quem manda é outro grupo.
 */
describe("guarda: o catálogo é lido no grupo de quem pede", () => {
  const PAGINAS_DE_LINK = [
    "src/app/s/[site]/(institucional)/selecao/[token]/page.tsx",
    "src/app/s/[site]/(institucional)/proposta/[token]/page.tsx",
    "src/app/s/[site]/(institucional)/portal/[token]/page.tsx",
  ];

  it("getEmpreendimentos e buscarPublicados não têm grupo padrão", () => {
    const queries = semComentarios(readFileSync("src/lib/queries.ts", "utf8"));
    const assinatura = /export async function getEmpreendimentos\(([\s\S]*?)\)\s*:/.exec(queries);
    expect(assinatura, "assinatura de getEmpreendimentos não encontrada").not.toBeNull();
    expect(assinatura![1]).toMatch(/grupoId\s*:\s*string\s*,/);
    expect(assinatura![1]).not.toMatch(/grupoId\s*:\s*string\s*=/);
    const busca = /const buscarPublicados = cache\(\s*async \(([^)]*)\)/.exec(queries);
    expect(busca, "buscarPublicados não encontrada").not.toBeNull();
    expect(busca![1]).not.toContain("=");
  });

  it("as páginas de link leem o catálogo do grupo de quem mandou o link", () => {
    for (const arquivo of PAGINAS_DE_LINK) {
      const codigo = semComentarios(readFileSync(arquivo, "utf8"));
      const chamadas = [...codigo.matchAll(/getEmpreendimentos\(([^)]*)\)/g)].map((m) => m[1].trim());
      expect(chamadas.length, arquivo).toBeGreaterThan(0);
      for (const argumento of chamadas) expect(argumento, arquivo).toBe("link.grupoId");
    }
  });

  it("o painel nunca lê o catálogo pelo grupo do site", () => {
    const fora: string[] = [];
    let chamadas = 0;
    const arquivos = readdirSync("src/app/corretor", { recursive: true, encoding: "utf8" }).filter(
      (f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f),
    );
    for (const relativo of arquivos) {
      const arquivo = join("src/app/corretor", relativo);
      const codigo = semComentarios(readFileSync(arquivo, "utf8"));
      for (const m of codigo.matchAll(/getEmpreendimentos\(([^)]*\)?)\)/g)) {
        chamadas++;
        if (m[1].trim() === "" || m[1].includes("grupoDoSite")) fora.push(`${arquivo}: ${m[0]}`);
      }
    }
    // Piso: campanhas (2), importar, links, seleção (2), conversas, whatsapp.
    expect(chamadas).toBeGreaterThanOrEqual(8);
    expect(fora).toEqual([]);
  });
});
