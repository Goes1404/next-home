import { describe, expect, it, vi } from "vitest";
import { bancoFalso, type Linha } from "../bancoFalso";

vi.mock("server-only", () => ({}));
// As metas da equipe (0246) leem pela chave de serviço por conta própria:
// aqui ela devolve o banco falso do teste em curso.
let clienteDoTeste: unknown = null;
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => clienteDoTeste }));
// Os miolos do financeiro importam o cliente da sessão (painel); aqui ele nunca é chamado.
vi.mock("@/lib/supabase/server", () => ({ createClient: () => null }));

const {
  periodoDoPedido,
  relatorioDoCorretor,
  metaEComissao,
  relatorioDaEquipe,
  resultadoDoMesDaImobiliaria,
  whatsappDaEquipe,
  CONSULTAS_RELATORIOS,
  ACOES_RELATORIOS,
} = await import("./relatorios");
const { desempenhoPorCorretor } = await import("@/lib/financeiro/desempenho");
const { extratoDo } = await import("@/lib/financeiro/extrato");
const { lerVendas, lerTaxasDaEquipe } = await import("@/lib/financeiro/dados");
const { lerLancamentosPagos } = await import("@/lib/financeiro/caixaDados");
const { resultadosDoMes, janelaDoResultado } = await import("@/lib/financeiro/resultado");
const { formatarReais } = await import("@/lib/financeiro/venda");

const G = "g1";
const corretor = { corretorId: "c1", grupoId: G, papel: "corretor" as const, nome: "Carol", imobiliaria: "Next Home" };
const gestor = { ...corretor, corretorId: "g", papel: "gestor" as const, nome: "Gil" };

// Sexta, 30/10/2026, meio-dia em São Paulo.
const AGORA = new Date("2026-10-30T15:00:00.000Z");

const lead = (l: Linha): Linha => ({
  grupo_id: G,
  corretor_id: "c1",
  etapa: "em_conversa",
  arquivado_em: null,
  visita_agendada_em: null,
  empreendimento_id: null,
  imovel_interesse_id: null,
  created_at: "2026-10-10T10:00:00-03:00",
  ...l,
});

const venda = (v: Linha): Linha => ({
  grupo_id: G,
  corretor_id: "c1",
  lead_id: null,
  empreendimento_id: "e1",
  imovel_descricao: null,
  unidade: null,
  data_venda: "2026-10-15",
  valor_venda: "500000",
  comissao_percentual: "4",
  comissao_valor: "20000",
  status: "ativa",
  observacao: null,
  ...v,
});

const participante = (p: Linha): Linha => ({
  grupo_id: G,
  parte_percentual: "100",
  repasse_percentual: "50",
  repasse_valor: "10000",
  repasse_pago_em: null,
  forma_recebimento: "repasse",
  ...p,
});

function banco(extra: Record<string, Linha[]> = {}) {
  const b = bancoFalso({
    corretores: [
      { id: "c1", grupo_id: G, nome: "Carol Lima", ativo: true, slug: "carol", oculta: false },
      { id: "c2", grupo_id: G, nome: "Beto Souza", ativo: true, slug: "beto", oculta: false },
      { id: "c3", grupo_id: G, nome: "Conta Oculta", ativo: true, slug: "oculta", oculta: true },
      { id: "c4", grupo_id: G, nome: "Dani Novata", ativo: true, slug: "dani", oculta: false },
      { id: "c5", grupo_id: G, nome: "Ex Corretor", ativo: false, slug: "ex", oculta: false },
      { id: "g", grupo_id: G, nome: "Gil Gestor", ativo: true, slug: null, oculta: false },
      { id: "c9", grupo_id: "outro", nome: "Zeca Outro Grupo", ativo: true, slug: "zeca", oculta: false },
    ],
    empreendimentos: [
      { id: "e1", grupo_id: G, nome: "Vitta", nomes_alternativos: [] },
      { id: "e9", grupo_id: "outro", nome: "Do Outro", nomes_alternativos: [] },
    ],
    leads: [
      // Carol: três leads em outubro (um virou visita, um fechou), um de
      // setembro às 23h30 de São Paulo (já é 1º/10 em UTC: fica fora).
      lead({ id: "l1", etapa: "visita_agendada", visita_agendada_em: "2026-10-31T10:00:00-03:00", imovel_interesse_id: "e1" }),
      lead({ id: "l2", etapa: "fechado", imovel_interesse_id: "e1", created_at: "2026-10-01T00:30:00-03:00" }),
      lead({ id: "l3", etapa: "novo" }),
      lead({ id: "l4", etapa: "novo", created_at: "2026-09-30T23:30:00-03:00" }),
      lead({ id: "l5", etapa: "perdido", arquivado_em: "2026-10-20T10:00:00-03:00" }),
      // Beto e a conta oculta.
      lead({ id: "l6", corretor_id: "c2" }),
      lead({ id: "l7", corretor_id: "c3" }),
      // Outro grupo, mesmo corretor de propósito: nunca soma.
      lead({ id: "l9", grupo_id: "outro", corretor_id: "c1", etapa: "fechado" }),
    ],
    vendas: [
      venda({ id: "v1" }),
      // Do Beto, sem a Carol: o corretor não vê, o gestor vê.
      venda({ id: "v2", corretor_id: "c2", data_venda: "2026-10-20", valor_venda: "300000", comissao_valor: "12000" }),
      // Outro grupo com a Carol como participante: nunca soma.
      venda({ id: "v9", grupo_id: "outro", corretor_id: "c9", valor_venda: "900000", comissao_valor: "36000" }),
    ],
    venda_participantes: [
      participante({ venda_id: "v1", corretor_id: "c1" }),
      participante({ venda_id: "v2", corretor_id: "c2", repasse_valor: "6000" }),
      participante({ venda_id: "v9", corretor_id: "c1", grupo_id: "outro", repasse_valor: "18000" }),
    ],
    venda_parcelas: [
      // Metade da comissão da v1 já entrou: metade do repasse está liberado.
      { id: "p1", venda_id: "v1", grupo_id: G, numero: 1, valor: "10000", pagador: "construtora", vence_em: "2026-10-20", recebida_em: "2026-10-22", cancelada_em: null },
      { id: "p2", venda_id: "v1", grupo_id: G, numero: 2, valor: "10000", pagador: "construtora", vence_em: "2026-11-20", recebida_em: null, cancelada_em: null },
      { id: "p9", venda_id: "v9", grupo_id: "outro", numero: 1, valor: "36000", pagador: "construtora", vence_em: "2026-10-20", recebida_em: "2026-10-21", cancelada_em: null },
    ],
    metas_corretor: [
      { corretor_id: "c1", grupo_id: G, mes: "2026-10-01", meta_comissao: "15000", comissao_por_venda: "5000" },
      { corretor_id: "c1", grupo_id: "outro", mes: "2026-10-01", meta_comissao: "999999", comissao_por_venda: null },
    ],
    caixa_lancamentos: [
      { id: "cx1", grupo_id: G, tipo: "saida", categoria: "aluguel", descricao: "Aluguel", valor: "1200", vencimento: "2026-10-05", pago_em: "2026-10-05", recorrencia_id: null, competencia: null },
      { id: "cx2", grupo_id: G, tipo: "saida", categoria: "marketing", descricao: "Anúncio", valor: "800", vencimento: "2026-09-10", pago_em: "2026-09-10", recorrencia_id: null, competencia: null },
      { id: "cx9", grupo_id: "outro", tipo: "saida", categoria: "aluguel", descricao: "Aluguel deles", valor: "50000", vencimento: "2026-10-05", pago_em: "2026-10-05", recorrencia_id: null, competencia: null },
    ],
    ...extra,
  });
  const parados: Record<string, number> = { c1: 0, c2: 3, c3: 5, c4: 1, c9: 7 };
  const cliente = {
    ...(b.cliente as object),
    rpc: async (nome: string, args: { p_corretor: string }) =>
      nome === "leads_parados_do_corretor" ? { data: parados[args.p_corretor] ?? 0, error: null } : { data: null, error: { message: "?" } },
  } as never;
  clienteDoTeste = cliente;
  return { ...b, cliente };
}

describe("periodoDoPedido (calendário de São Paulo)", () => {
  const HOJE = "2026-10-30";
  it("este mês por padrão, com o rótulo até hoje e a meia-noite de SP", () => {
    expect(periodoDoPedido(undefined, HOJE)).toMatchObject({
      inicio: "2026-10-01",
      fim: "2026-10-31",
      rotulo: "1 a 30/10",
      desdeIso: "2026-10-01T00:00:00-03:00",
      ateIso: "2026-11-01T00:00:00-03:00",
    });
    expect(periodoDoPedido("este mês", HOJE).padrao).toBeUndefined();
  });

  it("semana passada é de segunda a domingo", () => {
    expect(periodoDoPedido("semana passada", HOJE)).toMatchObject({ inicio: "2026-10-19", fim: "2026-10-25", rotulo: "19 a 25/10" });
  });

  it("mês passado, mês pelo nome e mês que ainda não chegou (ano passado)", () => {
    expect(periodoDoPedido("mês passado", HOJE)).toMatchObject({ inicio: "2026-09-01", fim: "2026-09-30", rotulo: "1 a 30/09" });
    expect(periodoDoPedido("outubro", HOJE)).toMatchObject({ inicio: "2026-10-01", rotulo: "1 a 30/10" });
    expect(periodoDoPedido("dezembro", HOJE)).toMatchObject({ inicio: "2025-12-01", fim: "2025-12-31", rotulo: "01/12/2025 a 31/12/2025" });
    expect(periodoDoPedido("últimos 7 dias", HOJE)).toMatchObject({ inicio: "2026-10-24", fim: "2026-10-30", rotulo: "24 a 30/10" });
  });

  it("o que não entende vira este mês, e diz", () => {
    expect(periodoDoPedido("desde que o mundo é mundo", HOJE)).toMatchObject({ inicio: "2026-10-01", padrao: true });
  });
});

describe("relatorio_do_corretor", () => {
  it("leads, visitas, vendas e funil de quem pergunta, pela conta do Desempenho", async () => {
    const b = banco();
    const r = (await relatorioDoCorretor(corretor, {}, b.cliente, AGORA)) as Record<string, unknown>;
    expect(r).toMatchObject({
      periodo: "1 a 30/10",
      leadsNovos: 4, // l1, l2, l3 e o arquivado l5; o l4 é de setembro em SP
      viraramVisita: 2, // l1 (visita marcada) e l2 (fechado)
      vendas: 1,
      vgv: formatarReais(500000),
      imoveisDeReferencia: [{ imovel: "Vitta", leads: 2, visitas: 2, vendas: 1 }],
    });
    // O funil é a carteira de hoje: sem arquivado, sem outro grupo, sem outro corretor.
    expect(r.funilHoje).toEqual([
      { etapa: "Novo", leads: 2 },
      { etapa: "Visita marcada", leads: 1 },
      { etapa: "Fechado", leads: 1 },
    ]);
    expect(JSON.stringify(r)).not.toMatch(/900\.000|Zeca/);
    expect(b.escritas).toEqual([]);
  });

  it("os números são os de desempenhoPorCorretor sobre as mesmas leituras", async () => {
    const b = banco();
    const r = (await relatorioDoCorretor(corretor, { periodo: "outubro" }, b.cliente, AGORA)) as Record<string, unknown>;
    const leitura = await lerVendas(b.cliente, { inicio: "2026-10-01", fim: "2026-10-31" }, { grupoId: G, corretorId: "c1" });
    expect(leitura.ok).toBe(true);
    const d = desempenhoPorCorretor({
      leads: [
        { id: "l1", corretorId: "c1", imovelId: "e1", criadoEm: "2026-10-10", visitou: true },
        { id: "l2", corretorId: "c1", imovelId: "e1", criadoEm: "2026-10-01", visitou: true },
        { id: "l3", corretorId: "c1", imovelId: null, criadoEm: "2026-10-10", visitou: false },
        { id: "l5", corretorId: "c1", imovelId: null, criadoEm: "2026-10-10", visitou: false },
      ],
      vendas: leitura.ok ? leitura.vendas : [],
      nomeDoImovel: new Map([["e1", "Vitta"]]),
    }).get("c1")!;
    expect(r).toMatchObject({ leadsNovos: d.atendidos, viraramVisita: d.visitas, vendas: d.vendas, vgv: formatarReais(d.vgv) });
  });

  it("semana passada recorta o período em São Paulo", async () => {
    const r = await relatorioDoCorretor(corretor, { periodo: "semana passada" }, banco().cliente, AGORA);
    expect(r).toMatchObject({ periodo: "19 a 25/10", leadsNovos: 0, vendas: 0 });
  });
});

describe("meta_e_comissao", () => {
  it("meta do mês e comissão a receber, pelas contas do Extrato", async () => {
    const b = banco({
      metas_da_equipe: [{ grupo_id: G, corretor_id: "c1", mes: "2026-10-01", meta_visitas: 10, meta_propostas: null, meta_vendas: 2 }],
      visitas: [
        { grupo_id: G, corretor_id: "c1", inicio: "2026-10-05T10:00:00-03:00", status: "realizada" },
        { grupo_id: G, corretor_id: "c1", inicio: "2026-10-28T10:00:00-03:00", status: "marcada" },
        { grupo_id: G, corretor_id: "c1", inicio: "2026-10-31T10:00:00-03:00", status: "marcada" },
        { grupo_id: "outro", corretor_id: "c1", inicio: "2026-10-06T10:00:00-03:00", status: "realizada" },
      ],
      lead_interacoes: [],
    });
    const r = (await metaEComissao(corretor, b.cliente, AGORA)) as Record<string, Record<string, unknown>>;
    expect(r.meta).toMatchObject({
      mes: "outubro (1 a 30/10)",
      meta: formatarReais(15000),
      ganhoNoMes: formatarReais(10000),
      falta: formatarReais(5000),
      progresso: "67%",
      oQueFalta: expect.stringContaining("1 venda"),
    });
    // O mesmo extrato da tela, sobre as vendas que o corretor vê.
    const leitura = await lerVendas(b.cliente, {}, { grupoId: G, corretorId: "c1" });
    const extrato = extratoDo("c1", leitura.ok ? leitura.vendas : [], "2026-10-30");
    expect(extrato.aReceber).toBe(10000);
    expect(r.comissao).toMatchObject({
      aReceber: formatarReais(extrato.aReceber),
      jaLiberado: expect.stringContaining(formatarReais(5000)),
    });
    // Placar do gestor: visita que já passou conta; a de amanhã não; outro grupo nunca.
    expect(r.metasDoGestor).toEqual([
      { medida: "Visitas", meta: 10, feito: 2, falta: 8 },
      { medida: "Vendas", meta: 2, feito: 1, falta: 1 },
    ]);
    expect(JSON.stringify(r)).not.toMatch(/999\.999|18\.000/);
    expect(b.escritas).toEqual([]);
  });

  it("sem meta no mês, diz como definir e não inventa", async () => {
    const r = (await metaEComissao(corretor, banco({ metas_corretor: [] }).cliente, AGORA)) as Record<string, Record<string, unknown>>;
    expect(r.meta).toMatchObject({ semMeta: expect.stringContaining("Extrato e meta") });
    expect(r.metasDoGestor).toBeUndefined();
  });

  it("corretor não vê a venda de outro corretor; outro grupo nunca", async () => {
    const b = banco();
    const minha = await lerVendas(b.cliente, {}, { grupoId: G, corretorId: "c1" });
    const doGrupo = await lerVendas(b.cliente, {}, { grupoId: G });
    expect(minha.ok && minha.vendas.map((v) => v.id)).toEqual(["v1"]);
    expect(doGrupo.ok && doGrupo.vendas.map((v) => v.id).sort()).toEqual(["v1", "v2"]);
  });
});

describe("relatorio_da_equipe", () => {
  it("corretor é recusado", async () => {
    expect(await relatorioDaEquipe(corretor, {}, banco().cliente, AGORA)).toMatchObject({ erro: expect.stringContaining("gestor") });
  });

  it("ranking, parados e campanhas do grupo, sem conta oculta e sem outro grupo", async () => {
    const b = banco({
      impulsionamentos: [
        {
          id: "i1", grupo_id: G, corretor_id: "c1", chave: "ad-1", titulo: "Vitta no Instagram", url: null, empreendimento_id: "e1",
          valor_gasto: "300", primeiro_lead_em: "2026-10-01T10:00:00-03:00", ultimo_lead_em: "2026-10-29T10:00:00-03:00",
          criada_pelo_corretor: false, canal: null, inicio: null, fim: null, agrupado_em: null,
        },
        {
          id: "i3", grupo_id: G, corretor_id: "c3", chave: "ad-3", titulo: "Campanha da oculta", url: null, empreendimento_id: null,
          valor_gasto: null, primeiro_lead_em: "2026-10-01T10:00:00-03:00", ultimo_lead_em: "2026-10-29T10:00:00-03:00",
          criada_pelo_corretor: false, canal: null, inicio: null, fim: null, agrupado_em: null,
        },
        {
          id: "i9", grupo_id: "outro", corretor_id: "c9", chave: "ad-9", titulo: "Anúncio do outro grupo", url: null, empreendimento_id: null,
          valor_gasto: "5000", primeiro_lead_em: "2026-10-01T10:00:00-03:00", ultimo_lead_em: "2026-10-29T10:00:00-03:00",
          criada_pelo_corretor: false, canal: null, inicio: null, fim: null, agrupado_em: null,
        },
      ],
    });
    for (const id of ["l1", "l3"]) Object.assign(b.tabelas.leads.find((l) => l.id === id)!, { origem: "meta/ctwa", meta_ad_id: "ad-1" });
    Object.assign(b.tabelas.leads.find((l) => l.id === "l7")!, { origem: "meta/ctwa", meta_ad_id: "ad-3" });

    const r = (await relatorioDaEquipe(gestor, {}, b.cliente, AGORA)) as Record<string, unknown>;
    expect(r.periodo).toBe("1 a 30/10");
    const ranking = r.ranking as { corretor: string; vendas: number; vgv?: string }[];
    expect(ranking[0]).toMatchObject({ posicao: 1, corretor: "Carol Lima", vendas: 1, vgv: formatarReais(500000) });
    expect(ranking[1]).toMatchObject({ posicao: 2, corretor: "Beto Souza", vendas: 1, vgv: formatarReais(300000) });
    expect(ranking.map((l) => l.corretor)).not.toContain("Conta Oculta");
    expect(r.parados).toEqual([
      { corretor: "Beto", leadsParados: 3 },
      { corretor: "Dani", leadsParados: 1 },
    ]);
    expect(r.campanhas).toMatchObject({
      maisClientes: [{ campanha: "Vitta no Instagram", situacao: "no ar", clientes: 2, visitas: 1, gasto: formatarReais(300), custoPorCliente: formatarReais(150) }],
      totalGasto: formatarReais(300),
    });
    expect(JSON.stringify(r)).not.toMatch(/Zeca|oculta|Oculta|outro grupo|900\.000/);
    expect(b.escritas).toEqual([]);
  });
});

describe("resultado_do_mes", () => {
  it("corretor é recusado", async () => {
    expect(await resultadoDoMesDaImobiliaria(corretor, {}, banco().cliente, AGORA)).toMatchObject({ erro: expect.stringContaining("gestor") });
  });

  it("os mesmos números da tela (resultadosDoMes), só do grupo", async () => {
    const b = banco();
    const r = (await resultadoDoMesDaImobiliaria(gestor, { mes: "outubro" }, b.cliente, AGORA)) as Record<string, unknown>;

    const { desde, ate } = janelaDoResultado("2026-10");
    const pagos = await lerLancamentosPagos(b.cliente, desde, ate, G);
    const vendas = await lerVendas(b.cliente, {}, { grupoId: G });
    const { doMes } = resultadosDoMes(pagos.ok ? pagos.lancamentos : [], vendas.ok ? vendas.vendas : [], "2026-10");
    // Comissão da v1 recebida (10 mil) menos o aluguel (1.200); o outro grupo fica fora.
    expect(doMes.resultado).toBe(8800);
    expect(r).toMatchObject({
      mes: "outubro de 2026 (1 a 30/10)",
      receitaDeCorretagem: formatarReais(doMes.receitaCorretagem),
      despesas: formatarReais(doMes.totalDespesas),
      resultado: formatarReais(doMes.resultado),
      situacao: expect.stringContaining("correndo"),
    });
    expect(JSON.stringify(r)).not.toMatch(/50\.000|36\.000/);
    expect(b.escritas).toEqual([]);
  });

  it("mês pelo nome e mês passado", async () => {
    const b = banco();
    expect(await resultadoDoMesDaImobiliaria(gestor, { mes: "setembro" }, b.cliente, AGORA)).toMatchObject({
      mes: "setembro de 2026 (1 a 30/09)",
      despesas: formatarReais(800),
      resultado: formatarReais(-800),
    });
    expect(await resultadoDoMesDaImobiliaria(gestor, { mes: "mês passado" }, b.cliente, AGORA)).toMatchObject({ resultado: formatarReais(-800) });
  });
});

describe("whatsapp_da_equipe", () => {
  const instancia = (i: Linha): Linha => ({
    grupo_id: G,
    status_conexao: "conectado",
    conectado_em: "2026-10-01T10:00:00-03:00",
    bloqueado_ate: null,
    desconectado_em: null,
    motivo_queda_codigo: null,
    sessao_caida_em: null,
    ...i,
  });

  it("corretor é recusado", async () => {
    expect(await whatsappDaEquipe(corretor, banco().cliente, AGORA)).toMatchObject({ erro: expect.stringContaining("gestor") });
  });

  it("quem caiu, quem parou de enviar e quem nunca conectou; sem conta oculta, ex-corretor nem outro grupo", async () => {
    const b = banco({
      corretor_whatsapp_instancias: [
        instancia({ corretor_id: "c1", sessao_caida_em: "2026-10-29T10:00:00-03:00" }),
        instancia({ corretor_id: "c2", status_conexao: "desconectado", conectado_em: null, desconectado_em: "2026-10-29T18:00:00-03:00", motivo_queda_codigo: 401 }),
        instancia({ corretor_id: "c3", status_conexao: "desconectado", conectado_em: null }),
        instancia({ corretor_id: "c5", status_conexao: "desconectado", conectado_em: null }),
        instancia({ corretor_id: "g" }),
        instancia({ corretor_id: "c9", grupo_id: "outro", status_conexao: "desconectado", conectado_em: null }),
      ],
    });
    const r = (await whatsappDaEquipe(gestor, b.cliente, AGORA)) as Record<string, unknown>;
    expect(r).toMatchObject({
      conectados: 1,
      desconectados: [{ corretor: "Beto Souza", desde: "29/10 às 18h00", passo: expect.stringContaining("WhatsApp → Conexão") }],
      pararamDeEnviar: [{ corretor: "Carol Lima" }],
      nuncaConectaram: ["Dani Novata"],
      avisarCadaUm: expect.any(String),
    });
    expect(JSON.stringify(r)).not.toMatch(/Oculta|Ex Corretor|Zeca/);
    expect(b.escritas).toEqual([]);
  });
});

describe("lerTaxasDaEquipe (espelho da taxas_da_equipe, 0192)", () => {
  it("conta leads, visitas e vendas ativas do grupo desde a data", async () => {
    const t = await lerTaxasDaEquipe(banco().cliente, G, "2026-10-01");
    // Leads do grupo desde 1º/10 (o l4 é de setembro): l1, l2, l3, l5, l6, l7.
    expect(t).toMatchObject({ leads: 6, visitas: 2, vendas: 2, repasseMedio: 8000, ticketMedio: 400000, docParaVenda: 1 });
  });
});

describe("ligação", () => {
  it("as cinco consultas estão no mapa e nenhuma é ação", () => {
    expect(Object.keys(CONSULTAS_RELATORIOS).sort()).toEqual(
      ["meta_e_comissao", "relatorio_da_equipe", "relatorio_do_corretor", "resultado_do_mes", "whatsapp_da_equipe"],
    );
    expect(ACOES_RELATORIOS).toEqual({});
  });
});
