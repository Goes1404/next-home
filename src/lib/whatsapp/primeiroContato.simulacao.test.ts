/*
 * Simulação do disparador com banco em memória (0217, 27/10/2026).
 *
 * Reproduz a lista que derrubou o WhatsApp do Ramos — fila de gente que nunca
 * falou com ele, com foto — e confere o que sai e o que fica para depois:
 * quarentena de número recém-conectado, teto do dia, teto da semana, foto só
 * para quem já conversou, marca `primeiro_contato` e falha de leitura.
 *
 * O provedor, a reescrita por IA e as funções de cota são falsos; o resto é o
 * código de produção (`processarFilaCampanhas`), lendo e gravando nas tabelas
 * em memória.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Linha = Record<string, unknown>;
type Banco = Record<string, Linha[]>;

const estado = vi.hoisted(() => ({
  banco: {} as Record<string, Record<string, unknown>[]>,
  falharContagemDePrimeiroContato: false,
  enviados: [] as { telefone: string; texto: string }[],
  midias: [] as { telefone: string }[],
}));

/* ---------------------------------------------------- banco falso */

function comparar(valor: unknown, op: string, alvo: unknown): boolean {
  switch (op) {
    case "eq":
      return valor === alvo;
    case "neq":
      return valor !== alvo;
    case "in":
      return (alvo as unknown[]).includes(valor);
    case "is":
      return alvo === null ? valor === null || valor === undefined : valor === alvo;
    case "notis":
      return alvo === null ? valor !== null && valor !== undefined : valor !== alvo;
    case "gte":
      return valor !== null && valor !== undefined && String(valor) >= String(alvo);
    case "gt":
      return valor !== null && valor !== undefined && String(valor) > String(alvo);
    case "lte":
      return valor !== null && valor !== undefined && String(valor) <= String(alvo);
    default:
      throw new Error(`operador não simulado: ${op}`);
  }
}

/** ISO de data para comparar por texto: tudo normalizado para UTC. */
function normalizar(v: unknown): unknown {
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v).toISOString();
  return v;
}

class Consulta implements PromiseLike<{ data: unknown; error: unknown; count: number | null }> {
  private filtros: { col: string; op: string; alvo: unknown }[] = [];
  private ordem: { col: string; asc: boolean } | null = null;
  private teto: number | null = null;
  private umSo = false;
  private contar = false;
  private soCabecalho = false;
  private mudanca: Linha | null = null;

  constructor(
    private tabela: string,
    private banco: Banco,
  ) {}

  select(_colunas?: string, opcoes?: { count?: string; head?: boolean }) {
    if (opcoes?.count) this.contar = true;
    if (opcoes?.head) this.soCabecalho = true;
    return this;
  }
  update(mudanca: Linha) {
    this.mudanca = mudanca;
    return this;
  }
  eq(col: string, alvo: unknown) {
    this.filtros.push({ col, op: "eq", alvo: normalizar(alvo) });
    return this;
  }
  neq(col: string, alvo: unknown) {
    this.filtros.push({ col, op: "neq", alvo });
    return this;
  }
  in(col: string, alvo: unknown[]) {
    this.filtros.push({ col, op: "in", alvo });
    return this;
  }
  is(col: string, alvo: unknown) {
    this.filtros.push({ col, op: "is", alvo });
    return this;
  }
  not(col: string, op: string, alvo: unknown) {
    this.filtros.push({ col, op: `not${op}`, alvo });
    return this;
  }
  gte(col: string, alvo: unknown) {
    this.filtros.push({ col, op: "gte", alvo: normalizar(alvo) });
    return this;
  }
  gt(col: string, alvo: unknown) {
    this.filtros.push({ col, op: "gt", alvo: normalizar(alvo) });
    return this;
  }
  lte(col: string, alvo: unknown) {
    this.filtros.push({ col, op: "lte", alvo: normalizar(alvo) });
    return this;
  }
  or() {
    throw new Error("or() não é simulado: a simulação roda dentro da janela comercial");
  }
  order(col: string, opcoes?: { ascending?: boolean }) {
    this.ordem = { col, asc: opcoes?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.teto = n;
    return this;
  }
  maybeSingle() {
    this.umSo = true;
    return this;
  }
  single() {
    this.umSo = true;
    return this;
  }

  private executar() {
    const linhas = (this.banco[this.tabela] ??= []);
    const casam = linhas.filter((l) => this.filtros.every((f) => comparar(normalizar(l[f.col]), f.op, f.alvo)));
    if (this.mudanca) {
      for (const l of casam) Object.assign(l, this.mudanca);
      return { data: casam, error: null, count: null };
    }
    let resultado = [...casam];
    if (this.ordem) {
      const { col, asc } = this.ordem;
      resultado.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : String(a[col]) > String(b[col]) ? 1 : 0) * (asc ? 1 : -1));
    }
    if (this.teto !== null) resultado = resultado.slice(0, this.teto);
    const count = this.contar ? casam.length : null;
    if (this.soCabecalho) return { data: null, error: null, count };
    if (this.umSo) return { data: resultado[0] ?? null, error: null, count };
    return { data: resultado, error: null, count };
  }

  then<A, B>(
    ok?: ((v: { data: unknown; error: unknown; count: number | null }) => A | PromiseLike<A>) | null,
    falha?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.executar()).then(ok, falha);
  }
}

/**
 * A 0222 em memória: conversas do corretor que receberam, no dia (São Paulo),
 * mensagem nossa sem o cliente ter escrito antes. Mesma regra do SQL.
 */
function primeirosContatosDoCorretor(corretor: string, desde: string): number {
  const conversas = new Set(
    estado.banco.whatsapp_conversas.filter((c) => c.corretor_id === corretor).map((c) => c.id),
  );
  const mensagens = estado.banco.whatsapp_mensagens;
  const pares = new Set<string>();
  for (const m of mensagens) {
    if (!conversas.has(m.conversa_id)) continue;
    if (m.remetente !== "bot" && m.remetente !== "corretor") continue;
    if (String(m.created_at) < new Date(desde).toISOString()) continue;
    const clienteAntes = mensagens.some(
      (a) => a.conversa_id === m.conversa_id && a.remetente === "cliente" && String(a.created_at) < String(m.created_at),
    );
    if (clienteAntes) continue;
    const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(String(m.created_at)));
    pares.add(`${m.conversa_id}|${dia}`);
  }
  return pares.size;
}

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: (tabela: string) => new Consulta(tabela, estado.banco),
    rpc: async (nome: string, args: { p_corretor: string; p_desde: string }) => {
      if (nome !== "primeiros_contatos_do_corretor") throw new Error(`rpc não simulada: ${nome}`);
      if (estado.falharContagemDePrimeiroContato) return { data: null, error: { message: "simulado" } };
      return { data: primeirosContatosDoCorretor(args.p_corretor, args.p_desde), error: null };
    },
  }),
}));

/* ---------------------------------------------------- vizinhos falsos */

vi.mock("@/lib/planos/cobrancaDoGrupo", () => ({ grupoSuspenso: async () => false }));
vi.mock("./avisoDeQueda", () => ({ varrerQuedasDeNumero: async () => {} }));
vi.mock("./recusaPendente", () => ({ rederrubarNumerosRecusados: async () => {} }));
vi.mock("./quedaDoNumero", () => ({ protegerNumerosQueCairam: async () => {} }));
vi.mock("./listasVivas", () => ({ alimentarListasVivas: async () => {} }));
vi.mock("./vencedoraAB", () => ({ aplicarVencedoras: async () => {} }));
vi.mock("./sinaisDaLista", () => ({ lerSinaisDaLista: async () => null }));
vi.mock("./textosDoNumero", () => ({ textosRecentesDoNumero: async () => [] }));
vi.mock("./casaDoGrupo", () => ({ lerCasaDoGrupo: async () => ({ nomeDaCasa: "Next Home" }) }));
vi.mock("@/lib/crm/agendaDoCorretor", () => ({ horariosDeVisita: async () => [] }));
vi.mock("./campaignQueue", () => ({
  nomesDaPessoa: () => [],
  variarSemRepetir: async ({ texto }: { texto: string }) => ({
    ok: true,
    texto: `${texto} #${Math.random()}`,
    personalizadoPorIA: true,
    semelhanca: 0.1,
  }),
}));
vi.mock("./provider", () => ({
  enviarMensagemWhatsapp: async ({ telefone, texto }: { telefone: string; texto: string }) => {
    estado.enviados.push({ telefone, texto });
    return { enviado: true, messageId: `m-${estado.enviados.length}` };
  },
  consultarEstadoConexao: async () => ({ ok: true, conectado: true }),
}));
vi.mock("./midiasDaLista", () => ({
  enviarMidiasDaLista: async ({ telefone }: { telefone: string }) => {
    estado.midias.push({ telefone });
    return 1;
  },
}));
vi.mock("./repositorio", () => ({
  avancarLeadParaPrimeiroContato: async () => {},
  destravarDisparo: async () => {},
  registrarTentativaDeContato: async () => {},
  ativarIaNaConversa: async () => {},
  gravarMensagem: async ({ conversaId, remetente }: { conversaId: string; remetente: string }) => {
    estado.banco.whatsapp_mensagens.push({
      id: `msg-${estado.banco.whatsapp_mensagens.length}`,
      conversa_id: conversaId,
      remetente,
      created_at: new Date().toISOString(),
    });
    return { inedita: true };
  },
  obterOuCriarConversa: async ({ corretorId, telefoneCliente }: { corretorId: string; telefoneCliente: string }) => {
    const conversas = estado.banco.whatsapp_conversas;
    const achada = conversas.find((c) => c.corretor_id === corretorId && c.telefone_cliente === telefoneCliente);
    if (achada) return { id: achada.id };
    const nova = { id: `conv-${telefoneCliente}`, corretor_id: corretorId, telefone_cliente: telefoneCliente, lead_id: null };
    conversas.push(nova);
    return { id: nova.id };
  },
  devolverCotaCampanha: async () => {},
  liberarFilaDaSessao: async () => {},
  marcarSessaoCaida: async () => {},
  registrarResultadoEnvio: async () => {},
  // A cota do número é outra trava, já testada; aqui ela sempre deixa passar
  // para a simulação medir só o teto de primeiro contato.
  reservarCotaCampanha: async () => ({ permitido: true }),
  sincronizarConexaoInstancia: async () => ({ conectado: true, conectadoEm: new Date() }),
  travarDisparo: async () => true,
}));

import { processarFilaCampanhas } from "./campaignDispatcher";

/* ---------------------------------------------------- cenário */

const CORRETOR = "corretor-ramos";
const LISTA = "lista-dom-parque";
const AGORA = new Date("2026-10-27T13:00:00Z"); // terça, 10h em São Paulo
const FOTO = "https://exemplo/foto-dom-parque.jpg";

function montarBanco(opcoes: {
  conectadoEm: string;
  aquecimentoDesde: string | null;
  frios: number;
  quentes: number;
  primeirosContatosAnteriores?: { enviadoEm: string }[];
}): Banco {
  const banco: Banco = {
    corretor_whatsapp_instancias: [
      {
        id: "inst-ramos",
        corretor_id: CORRETOR,
        grupo_id: "g1",
        instance_name: "nexthome-ramos",
        status_conexao: "conectado",
        conectado_em: opcoes.conectadoEm,
        aquecimento_desde: opcoes.aquecimentoDesde,
        bloqueado_ate: null,
        telefone_conectado: "5511990024407",
        expediente_inicio: 9,
        expediente_fim: 21,
      },
    ],
    whatsapp_campanhas: [
      {
        id: LISTA,
        corretor_id: CORRETOR,
        status: "em_andamento",
        criterio: null,
        midias: [{ url: FOTO, tipo: "foto", titulo: "Foto do empreendimento" }],
        empreendimento_id: "dom-parque",
        pausa_base: null,
        contexto_template: null,
        mensagem_base: "Oi! Tem novidade no Dom Parque.",
        mensagem_base_b: null,
        empreendimento: { nome: "Dom Parque" },
      },
      { id: "lista-antiga", corretor_id: CORRETOR, status: "concluida" },
    ],
    whatsapp_campanhas_fila: [],
    leads: [],
    whatsapp_conversas: [],
    whatsapp_mensagens: [],
    midias: [{ empreendimento_id: "dom-parque", url: FOTO }],
    corretores: [{ id: CORRETOR, nome: "Ramos" }],
  };

  const total = opcoes.frios + opcoes.quentes;
  for (let i = 0; i < total; i++) {
    const quente = i < opcoes.quentes;
    const lead = `lead-${i}`;
    const telefone = `55119${String(10000000 + i)}`;
    banco.leads.push({
      id: lead,
      nome: `Cliente ${i}`,
      nao_contatar_em: null,
      arquivado_em: null,
      etapa: "novo",
      corretor_id: CORRETOR,
      telefone_e164: telefone,
    });
    if (quente) {
      banco.whatsapp_conversas.push({ id: `conv-${lead}`, lead_id: lead, corretor_id: CORRETOR, telefone_cliente: telefone });
      banco.whatsapp_mensagens.push({
        id: `msg-${lead}`,
        conversa_id: `conv-${lead}`,
        remetente: "cliente",
        created_at: "2026-10-10T15:00:00Z",
      });
    }
    banco.whatsapp_campanhas_fila.push({
      id: `item-${i}`,
      campanha_id: LISTA,
      lead_id: lead,
      telefone,
      status: "pendente",
      mensagem_personalizada: "Oi! Tem novidade no Dom Parque.",
      personalizado_por_ia: false,
      tentativas: 0,
      // Os frios na frente, como numa planilha recém-importada.
      agendado_para: new Date(AGORA.getTime() - (quente ? 1 + i : 1000 - i) * 60_000).toISOString(),
      variante: null,
      semelhanca_max: null,
      tentativas_texto: 0,
      enviado_em: null,
      erro_motivo: null,
      primeiro_contato: null,
    });
  }

  // Primeiros contatos que já saíram por qualquer caminho (lista, botão ✨,
  // aviso, roleta, Live Chat): conversa de outra pessoa com mensagem nossa e
  // nenhuma fala do cliente. É o que a 0222 conta.
  for (const [n, anterior] of (opcoes.primeirosContatosAnteriores ?? []).entries()) {
    banco.whatsapp_conversas.push({ id: `conv-antiga-${n}`, corretor_id: CORRETOR, telefone_cliente: `5511800${n}`, lead_id: null });
    banco.whatsapp_mensagens.push({
      id: `msg-antiga-${n}`,
      conversa_id: `conv-antiga-${n}`,
      remetente: n % 2 ? "corretor" : "bot",
      created_at: anterior.enviadoEm,
    });
  }
  return banco;
}

/**
 * Roda o disparador como o pg_cron (1 chamada por minuto), no mesmo instante:
 * para quando a fila não tem mais nada vencido, e não ao primeiro tique sem
 * envio — um tique pode só adiar 25 desconhecidos e parar.
 */
async function rodarAteParar(): Promise<void> {
  const vencidos = () =>
    estado.banco.whatsapp_campanhas_fila.filter(
      (f) => f.status === "pendente" && new Date(String(f.agendado_para)).getTime() <= Date.now(),
    ).length;
  for (let i = 0; i < 60 && vencidos() > 0; i++) {
    await processarFilaCampanhas({ orcamentoMs: 60_000 });
  }
  expect(vencidos(), "a simulação terminou com itens vencidos parados").toBe(0);
}

const fila = () => estado.banco.whatsapp_campanhas_fila.filter((f) => f.campanha_id === LISTA);
const telefoneDoLead = (i: number) => `55119${String(10000000 + i)}`;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
  estado.falharContagemDePrimeiroContato = false;
  estado.enviados = [];
  estado.midias = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("simulação: a lista do Ramos depois da 0217", () => {
  it("número que voltou de queda há 6 dias: nenhum desconhecido recebe; quem já conversou recebe, com foto", async () => {
    estado.banco = montarBanco({
      conectadoEm: "2026-10-07T16:54:22Z",
      aquecimentoDesde: "2026-10-21T12:51:16Z",
      frios: 30,
      quentes: 2,
    });

    await rodarAteParar();

    const enviadosPara = estado.enviados.map((e) => e.telefone);
    expect(enviadosPara.sort()).toEqual([telefoneDoLead(0), telefoneDoLead(1)].sort());
    expect(estado.midias.map((m) => m.telefone).sort()).toEqual([telefoneDoLead(0), telefoneDoLead(1)].sort());

    const frios = fila().filter((f) => f.status === "pendente");
    expect(frios).toHaveLength(30);
    for (const f of frios) {
      expect(f.erro_motivo).toMatch(/nunca falou com você/);
      expect(f.erro_motivo).toMatch(/Faltam 1 dia\./);
      expect(new Date(String(f.agendado_para)).getTime()).toBeGreaterThan(AGORA.getTime());
    }
    for (const f of fila().filter((f) => f.status === "enviado")) expect(f.primeiro_contato).toBe(false);
  });

  it("número antigo: no máximo 10 desconhecidos no dia, sem foto, marcados; o resto fica para amanhã", async () => {
    estado.banco = montarBanco({
      conectadoEm: "2026-09-01T12:00:00Z",
      aquecimentoDesde: null,
      frios: 40,
      quentes: 3,
    });

    await rodarAteParar();

    const friosEnviados = fila().filter((f) => f.status === "enviado" && f.primeiro_contato === true);
    const quentesEnviados = fila().filter((f) => f.status === "enviado" && f.primeiro_contato === false);
    expect(friosEnviados).toHaveLength(10);
    expect(quentesEnviados).toHaveLength(3);
    expect(estado.enviados).toHaveLength(13);

    // Foto só para quem já conversou.
    const comFoto = new Set(estado.midias.map((m) => m.telefone));
    for (const f of friosEnviados) expect(comFoto.has(String(f.telefone))).toBe(false);
    for (const f of quentesEnviados) expect(comFoto.has(String(f.telefone))).toBe(true);

    const adiados = fila().filter((f) => f.status === "pendente");
    expect(adiados).toHaveLength(30);
    for (const f of adiados) {
      expect(f.erro_motivo).toMatch(/10 por dia e 30 por semana/);
      // Amanhã, a partir das 9h de São Paulo.
      expect(String(f.agendado_para) >= "2026-10-28T12:00:00.000Z").toBe(true);
    }
  });

  it("no dia seguinte saem mais 10, e a semana fecha em 30", async () => {
    estado.banco = montarBanco({
      conectadoEm: "2026-09-01T12:00:00Z",
      aquecimentoDesde: null,
      frios: 60,
      quentes: 0,
    });

    const dias = ["2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"];
    const porDia: number[] = [];
    for (const dia of dias) {
      vi.setSystemTime(new Date(`${dia}T14:00:00Z`));
      const antes = estado.enviados.length;
      await rodarAteParar();
      porDia.push(estado.enviados.length - antes);
    }

    expect(porDia).toEqual([10, 10, 10, 0, 0]);
    expect(fila().filter((f) => f.primeiro_contato === true)).toHaveLength(30);
  });

  it("conta os primeiros contatos de outras listas: 2 hoje e 27 na semana deixam só 3", async () => {
    estado.banco = montarBanco({
      conectadoEm: "2026-09-01T12:00:00Z",
      aquecimentoDesde: null,
      frios: 20,
      quentes: 0,
      primeirosContatosAnteriores: [
        ...Array.from({ length: 2 }, () => ({ enviadoEm: "2026-10-27T12:30:00Z" })),
        ...Array.from({ length: 25 }, () => ({ enviadoEm: "2026-10-23T15:00:00Z" })),
        // Mais de 7 dias atrás: não conta.
        ...Array.from({ length: 50 }, () => ({ enviadoEm: "2026-10-15T15:00:00Z" })),
      ],
    });

    await rodarAteParar();

    expect(estado.enviados).toHaveLength(3);
  });

  it("primeiro contato de ontem às 22h não conta no dia de hoje", async () => {
    estado.banco = montarBanco({
      conectadoEm: "2026-09-01T12:00:00Z",
      aquecimentoDesde: null,
      frios: 20,
      quentes: 0,
      // 26/10 às 22h de São Paulo = 27/10 01h em UTC.
      primeirosContatosAnteriores: Array.from({ length: 10 }, () => ({ enviadoEm: "2026-10-27T01:00:00Z" })),
    });

    await rodarAteParar();

    expect(estado.enviados).toHaveLength(10);
  });

  it("sem conseguir contar, nenhum desconhecido recebe (o lado que protege o número)", async () => {
    estado.banco = montarBanco({
      conectadoEm: "2026-09-01T12:00:00Z",
      aquecimentoDesde: null,
      frios: 5,
      quentes: 1,
    });
    estado.falharContagemDePrimeiroContato = true;

    await rodarAteParar();

    expect(estado.enviados.map((e) => e.telefone)).toEqual([telefoneDoLead(0)]);
  });

  it("fora do horário nada sai, nem lista marcada para 'qualquer hora' pela API", async () => {
    estado.banco = montarBanco({
      conectadoEm: "2026-09-01T12:00:00Z",
      aquecimentoDesde: null,
      frios: 3,
      quentes: 3,
    });
    // As duas colunas que o corretor consegue gravar pela API.
    Object.assign(estado.banco.whatsapp_campanhas[0], {
      ignorar_janela: true,
      janela_liberada_ate: "2026-10-28T12:00:00Z",
    });
    vi.setSystemTime(new Date("2026-10-28T02:00:00Z")); // 23h em São Paulo

    for (let i = 0; i < 5; i++) await processarFilaCampanhas({ orcamentoMs: 60_000 });

    expect(estado.enviados).toHaveLength(0);
  });

  it("número recém-conectado (2 dias): nenhum desconhecido", async () => {
    estado.banco = montarBanco({
      conectadoEm: "2026-10-25T12:00:00Z",
      aquecimentoDesde: null,
      frios: 10,
      quentes: 0,
    });

    await rodarAteParar();

    expect(estado.enviados).toHaveLength(0);
    expect(fila().every((f) => /Faltam 5 dias/.test(String(f.erro_motivo)))).toBe(true);
  });
});
