import { describe, expect, it, vi } from "vitest";
import { bancoFalso, type Linha } from "../bancoFalso";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));

const { categoriaDoLancamento, criarAcoesDoFinanceiro, lerCriterio, lerDiaDoCaixa, lerValorEmReais } = await import("./financeiro");
const { criarExecutor } = await import("../executar");

const G = "g1";
const G2 = "g2";
const AGORA = new Date("2026-10-30T15:00:00Z");
const CARIMBO = "2026-10-30T15:00:00.123+00:00";

const corretor = { corretorId: "c1", grupoId: G, papel: "corretor" as const, nome: "Carol", imobiliaria: "Next Home" };
const gestor = { ...corretor, corretorId: "gestor", papel: "gestor" as const, nome: "Gil" };

function lead(l: Linha): Linha {
  return {
    grupo_id: G,
    etapa: "primeiro_contato",
    etapa_alterada_em: "2026-10-28T12:00:00.000Z",
    arquivado_em: null,
    renda_mensal: null,
    orcamento_max: null,
    regiao_interesse: null,
    visita_agendada_em: null,
    campos_do_corretor: [],
    imovel_interesse_id: null,
    empreendimento_id: null,
    origem_atribuicao: "roleta",
    created_at: "2026-09-01T12:00:00.000Z",
    ...l,
  };
}

/**
 * O banco falso não tem default de coluna: o carimbo `atualizado_em` que o
 * Postgres põe no insert (e o `status` "ativa" da venda) é posto aqui: é
 * por ele que o desfaz sabe se a linha mudou.
 */
function comCarimbo(cliente: unknown) {
  type Consulta = Record<string, (...a: unknown[]) => unknown>;
  const original = cliente as { from: (t: string) => Consulta };
  return {
    from: (tabela: string) => {
      const q = original.from(tabela);
      const inserir = q.insert;
      const carimbar = (l: Linha) => ({ atualizado_em: CARIMBO, ...(tabela === "vendas" ? { status: "ativa" } : {}), ...l });
      q.insert = (v: unknown) => inserir(Array.isArray(v) ? v.map(carimbar) : carimbar(v as Linha));
      return q;
    },
  } as never;
}

function cenario(mudar: (t: Record<string, Linha[]>) => void = () => {}) {
  const tabelas: Record<string, Linha[]> = {
    corretores: [
      { id: "c1", nome: "Carol Dias", grupo_id: G, ativo: true, oculta: false },
      { id: "c2", nome: "Ana Lima", grupo_id: G, ativo: true, oculta: false },
      { id: "c3", nome: "Beto Souza", grupo_id: G, ativo: true, oculta: false },
      { id: "c4", nome: "Bruno Velho", grupo_id: G, ativo: false, oculta: false },
      { id: "gestor", nome: "Gil Ramos", grupo_id: G, ativo: true, oculta: false },
      { id: "x1", nome: "Ana Paula", grupo_id: G2, ativo: true, oculta: false },
    ],
    leads: [
      lead({ id: "m1", corretor_id: "c1", nome: "Mariana Souza", imovel_interesse_id: "e1" }),
      lead({ id: "a1", corretor_id: "c2", nome: "Antônio", etapa_alterada_em: "2026-09-01T12:00:00.000Z" }),
      lead({ id: "a2", corretor_id: "c2", nome: "Augusto", etapa_alterada_em: "2026-10-01T12:00:00.000Z", origem_atribuicao: null }),
      lead({ id: "a3", corretor_id: "c2", nome: "Alice" }),
      lead({ id: "a4", corretor_id: "c2", nome: "Arnaldo", etapa: "fechado", etapa_alterada_em: "2026-08-01T12:00:00.000Z" }),
      lead({ id: "a5", corretor_id: "c2", nome: "Abel", arquivado_em: "2026-10-02T12:00:00.000Z", etapa_alterada_em: "2026-08-01T12:00:00.000Z" }),
      lead({ id: "z1", corretor_id: "x1", nome: "Mariana Alves", grupo_id: G2, etapa_alterada_em: "2026-08-01T12:00:00.000Z" }),
    ],
    empreendimentos: [
      { id: "e1", nome: "Vitta", nomes_alternativos: ["Vitta Residencial"], grupo_id: G },
      { id: "e2", nome: "Alto da Serra", nomes_alternativos: [], grupo_id: G },
      { id: "e9", nome: "Vitta", nomes_alternativos: [], grupo_id: G2 },
    ],
    vendas: [
      { id: "v0", grupo_id: G, corretor_id: "c1", empreendimento_id: "e1", lead_id: "velho", status: "ativa", comissao_percentual: 5, data_venda: "2026-09-10" },
      { id: "v9", grupo_id: G2, corretor_id: "x1", empreendimento_id: "e9", lead_id: "z9", status: "ativa", comissao_percentual: 8, data_venda: "2026-10-20" },
    ],
    venda_participantes: [{ grupo_id: G, venda_id: "v0", corretor_id: "c1", repasse_percentual: 40, repasse_pago_em: null, forma_recebimento: "repasse" }],
    venda_parcelas: [],
    venda_fiscal: [],
    meses_fechados: [],
    caixa_lancamentos: [],
    impulsionamentos: [
      { id: "i1", grupo_id: G, corretor_id: "c1", titulo: "Reels outubro", empreendimento_id: "e1", valor_gasto: null, gasto_informado_em: null, criada_pelo_corretor: true, agrupado_em: null, ultimo_lead_em: "2026-10-29T12:00:00Z" },
      { id: "i2", grupo_id: G, corretor_id: "c2", titulo: "Vitta stories", empreendimento_id: "e1", valor_gasto: 200, gasto_informado_em: "2026-10-20T12:00:00Z", criada_pelo_corretor: true, agrupado_em: null, ultimo_lead_em: "2026-10-28T12:00:00Z" },
      { id: "i3", grupo_id: G, corretor_id: "c2", titulo: "Alto da Serra feed", empreendimento_id: "e2", valor_gasto: null, gasto_informado_em: null, criada_pelo_corretor: true, agrupado_em: null, ultimo_lead_em: "2026-10-27T12:00:00Z" },
      { id: "i9", grupo_id: G2, corretor_id: "x1", titulo: "Vitta", empreendimento_id: "e9", valor_gasto: null, gasto_informado_em: null, criada_pelo_corretor: true, agrupado_em: null, ultimo_lead_em: "2026-10-29T12:00:00Z" },
    ],
    impulsionamento_gastos: [{ id: "p2", grupo_id: G, impulsionamento_id: "i2", corretor_id: "c2", dia: "2026-10-20", valor_acumulado: 200 }],
    lead_interacoes: [],
    admin_eventos: [],
  };
  mudar(tabelas);
  const b = bancoFalso(tabelas);
  const avisos: { corretorId: string; texto: string }[] = [];
  const nomes: Record<string, string> = Object.fromEntries(tabelas.corretores.map((c) => [c.id as string, c.nome as string]));
  const acoes = criarAcoesDoFinanceiro({
    banco: () => comCarimbo(b.cliente),
    agora: () => AGORA,
    avisar: async (corretorId, texto) => {
      avisos.push({ corretorId, texto: texto(nomes[corretorId]) });
      return { enviado: true };
    },
  });
  return { ...b, acoes, avisos };
}

const linha = (t: Record<string, Linha[]>, tabela: string, id: string) => t[tabela].find((l) => l.id === id)!;
const daTabela = (escritas: { tabela: string }[], tabela: string) => escritas.filter((e) => e.tabela === tabela);

describe("leituras do pedido", () => {
  it("valores em reais como a pessoa fala", () => {
    expect(lerValorEmReais(450000)).toBe(450000);
    expect(lerValorEmReais("450 mil")).toBe(450000);
    expect(lerValorEmReais("450mil")).toBe(450000);
    expect(lerValorEmReais("1.200")).toBe(1200);
    expect(lerValorEmReais("R$ 1.200,50")).toBe(1200.5);
    expect(lerValorEmReais("1,2 mil")).toBe(1200);
    expect(lerValorEmReais("1,5 milhão")).toBe(1500000);
    expect(lerValorEmReais("300 reais")).toBe(300);
    expect(lerValorEmReais("49,90")).toBe(49.9);
    expect(lerValorEmReais("trezentos")).toBeNull();
    expect(lerValorEmReais(0)).toBeNull();
    expect(lerValorEmReais(-5)).toBeNull();
  });

  it("o dia do caixa olha para trás também", () => {
    const hoje = "2026-10-30";
    expect(lerDiaDoCaixa(undefined, hoje)).toBe(hoje);
    expect(lerDiaDoCaixa("hoje", hoje)).toBe(hoje);
    expect(lerDiaDoCaixa("ontem", hoje)).toBe("2026-10-29");
    expect(lerDiaDoCaixa("dia 10", hoje)).toBe("2026-10-10");
    expect(lerDiaDoCaixa("05/11", hoje)).toBe("2026-11-05");
    expect(lerDiaDoCaixa("2026-11-05", hoje)).toBe("2026-11-05");
    expect(lerDiaDoCaixa("31/02", hoje)).toBeNull();
    expect(lerDiaDoCaixa("sei lá", hoje)).toBeNull();
    expect(lerDiaDoCaixa("05/11/2030", hoje)).toBeNull();
  });

  it("categoria pelo que a pessoa disse", () => {
    expect(categoriaDoLancamento("saida", "aluguel")).toBe("aluguel");
    expect(categoriaDoLancamento("saida", "Salário da Bia")).toBe("pessoal");
    expect(categoriaDoLancamento("saida", "ZAP imóveis")).toBe("portais");
    expect(categoriaDoLancamento("saida", "café e água")).toBe("escritorio");
    expect(categoriaDoLancamento("saida", "presente de fim de ano")).toBe("outros");
    expect(categoriaDoLancamento("entrada", "comissão de aluguel")).toBe("comissao_avulsa");
    expect(categoriaDoLancamento("entrada", "venda de móveis")).toBe("outras_receitas");
  });

  it("o recorte da redistribuição", () => {
    expect(lerCriterio("os parados")).toEqual({ tipo: "parados", dias: 15 });
    expect(lerCriterio("parados há 30 dias")).toEqual({ tipo: "parados", dias: 30 });
    expect(lerCriterio("todos os parados")).toEqual({ tipo: "parados", dias: 15 });
    expect(lerCriterio("todos")).toEqual({ tipo: "em_andamento" });
    expect(lerCriterio("")).toBeNull();
    expect(lerCriterio("os bons")).toBeNull();
  });
});

describe("registrar_venda", () => {
  it("propõe com a comissão de referência e NÃO grava no preparar", async () => {
    const { acoes, escritas } = cenario();
    const r = await acoes.registrar_venda.preparar(corretor, { lead: "Mariana", imovel: "Vitta", valor: "450 mil" });
    expect(r).toMatchObject({
      tipo: "proposta",
      resumo: expect.stringContaining("Mariana Souza, Vitta, R$ 450.000, hoje (30/10)"),
      dados: { leadId: "m1", participanteId: "c1", imovelId: "e1", valorVenda: 450000, comissaoPercentual: 5, repassePercentual: 40, dataVenda: "2026-10-30" },
    });
    if (r.tipo !== "proposta") throw new Error("sem proposta");
    expect(r.resumo).toContain("Comissão 5% = R$ 22.500 (a da última venda do Vitta");
    expect(r.resumo).toContain("Mariana vai para Fechado");
    expect(escritas).toEqual([]);
  });

  it("sem imóvel no pedido, usa o de interesse do lead", async () => {
    const { acoes } = cenario();
    const r = await acoes.registrar_venda.preparar(corretor, { lead: "Mariana", valor: 450000 });
    expect(r).toMatchObject({ tipo: "proposta", dados: { imovelId: "e1" } });
  });

  it("valor pequeno demais pergunta, não propõe", async () => {
    const { acoes } = cenario();
    expect(await acoes.registrar_venda.preparar(corretor, { lead: "Mariana", valor: "450" })).toMatchObject({
      tipo: "resposta",
      resultado: { pergunta: expect.stringMatching(/450 mil/) },
    });
  });

  it("outro grupo nunca é alcançado: nem o lead, nem a comissão de lá", async () => {
    const { acoes } = cenario((t) => {
      t.vendas = t.vendas.filter((v) => v.grupo_id !== G);
    });
    // A Mariana do grupo 2 não aparece (só uma Mariana, a do grupo 1); a
    // comissão de 8% do grupo 2 não serve de referência.
    const r = await acoes.registrar_venda.preparar(gestor, { lead: "Mariana", imovel: "Vitta", valor: 450000 });
    expect(r).toMatchObject({ tipo: "resposta", resultado: { erro: expect.stringMatching(/Registrar venda/) } });
  });

  it("lead que já tem venda ativa não ganha outra", async () => {
    const { acoes } = cenario((t) => {
      t.vendas.push({ id: "v1", grupo_id: G, corretor_id: "c1", lead_id: "m1", status: "ativa", data_venda: "2026-10-01", valor_venda: 300000, comissao_percentual: 5 });
    });
    const r = await acoes.registrar_venda.preparar(corretor, { lead: "Mariana", valor: 450000 });
    expect(r).toMatchObject({ tipo: "resposta", resultado: { mensagem: expect.stringMatching(/já tem venda/) } });
  });

  it("o sim grava venda, divisão e parcela no grupo, e leva o lead a Fechado; o desfaz volta tudo", async () => {
    const { acoes, tabelas } = cenario();
    const p = await acoes.registrar_venda.preparar(corretor, { lead: "Mariana", imovel: "Vitta", valor: 450000 });
    if (p.tipo !== "proposta") throw new Error("sem proposta");
    const r = await acoes.registrar_venda.executar(corretor, p.dados);
    expect(r).toMatchObject({ ok: true, texto: expect.stringMatching(/comissão R\$ 22\.500\. Mariana foi para Fechado/) });

    const venda = tabelas.vendas.find((v) => v.lead_id === "m1")!;
    expect(venda).toMatchObject({ grupo_id: G, corretor_id: "c1", empreendimento_id: "e1", imovel_descricao: "Vitta", valor_venda: 450000, comissao_percentual: 5, comissao_valor: 22500 });
    expect(tabelas.venda_participantes.find((x) => x.venda_id === venda.id)).toMatchObject({
      grupo_id: G,
      corretor_id: "c1",
      parte_percentual: 100,
      repasse_percentual: 40,
      repasse_valor: 9000,
      forma_recebimento: "repasse",
    });
    expect(tabelas.venda_parcelas.filter((x) => x.venda_id === venda.id)).toEqual([
      expect.objectContaining({ grupo_id: G, numero: 1, valor: 22500, pagador: "construtora", vence_em: null }),
    ]);
    expect(linha(tabelas, "leads", "m1").etapa).toBe("fechado");

    const d = await acoes.registrar_venda.desfazer!(corretor, r.desfazer!);
    expect(d).toEqual({ ok: true, texto: "Desfeito: a venda de Mariana Souza saiu do Financeiro. Mariana voltou para Mensagem enviada." });
    expect(tabelas.vendas.find((v) => v.lead_id === "m1")).toBeUndefined();
    expect(linha(tabelas, "leads", "m1").etapa).toBe("primeiro_contato");
  });

  it("o desfaz não apaga venda que mudou depois (parcela com previsão)", async () => {
    const { acoes, tabelas } = cenario();
    const p = await acoes.registrar_venda.preparar(corretor, { lead: "Mariana", valor: 450000 });
    if (p.tipo !== "proposta") throw new Error("sem proposta");
    const r = await acoes.registrar_venda.executar(corretor, p.dados);
    const venda = tabelas.vendas.find((v) => v.lead_id === "m1")!;
    tabelas.venda_parcelas.find((x) => x.venda_id === venda.id)!.vence_em = "2026-12-10";
    const d = await acoes.registrar_venda.desfazer!(corretor, r.desfazer!);
    expect(d).toMatchObject({ ok: false, texto: expect.stringMatching(/mudou depois/) });
    expect(tabelas.vendas.find((v) => v.lead_id === "m1")).toBeDefined();
  });

  it("o executar usa só os dados: corretor não registra venda de outro corretor", async () => {
    const { acoes, escritas } = cenario();
    const dados = { leadId: "a1", nome: "Antônio", participanteId: "c2", imovelId: "e1", imovelDescricao: "Vitta", dataVenda: "2026-10-30", valorVenda: 450000, comissaoPercentual: 5, repassePercentual: 0 };
    expect(await acoes.registrar_venda.executar(corretor, dados)).toEqual({ ok: false, texto: "Você só registra venda da qual participa." });
    // Mesmo dizendo que participa, o lead não é dele: o domínio relê pelo dono.
    expect(await acoes.registrar_venda.executar(corretor, { ...dados, participanteId: "c1" })).toMatchObject({ ok: false, texto: expect.stringMatching(/Não achei mais/) });
    expect(daTabela(escritas, "vendas")).toEqual([]);
  });

  it("mês fechado recusa no sim", async () => {
    const { acoes, tabelas } = cenario((t) => {
      t.meses_fechados.push({ grupo_id: G, mes: "2026-10-01" });
    });
    const p = await acoes.registrar_venda.preparar(corretor, { lead: "Mariana", valor: 450000 });
    if (p.tipo !== "proposta") throw new Error("sem proposta");
    expect(await acoes.registrar_venda.executar(corretor, p.dados)).toMatchObject({ ok: false, texto: expect.stringMatching(/10\/2026 está fechado/) });
    expect(tabelas.vendas.find((v) => v.lead_id === "m1")).toBeUndefined();
  });
});

describe("lancar_no_caixa (gestor)", () => {
  it("corretor é recusado no preparar, no executar, no desfazer e no executor", async () => {
    const { acoes, escritas } = cenario();
    expect(await acoes.lancar_no_caixa.preparar(corretor, { tipo: "despesa", valor: 1200, descricao: "aluguel" })).toMatchObject({ tipo: "resposta", resultado: { erro: expect.stringMatching(/só para o gestor/) } });
    const dados = { tipo: "saida", categoria: "aluguel", descricao: "aluguel", valor: 1200, vencimento: "2026-10-30", pagoEm: "2026-10-30" };
    expect(await acoes.lancar_no_caixa.executar(corretor, dados)).toMatchObject({ ok: false });
    expect(await acoes.lancar_no_caixa.desfazer!(corretor, { lancamentoId: "x", atualizadoEm: CARIMBO })).toMatchObject({ ok: false });
    const { executar, itensPropostos } = criarExecutor(corretor, { consultas: {}, acoes }, 2);
    expect(await executar("lancar_no_caixa", { tipo: "despesa", valor: 1200, descricao: "aluguel" })).toEqual({ erro: "Isso é só para o gestor da imobiliária." });
    expect(await executar("redistribuir_leads", { de: "Ana", para: "Beto" })).toEqual({ erro: "Isso é só para o gestor da imobiliária." });
    expect(itensPropostos).toEqual([]);
    expect(escritas).toEqual([]);
  });

  it('"lança despesa de 1.200 de aluguel": propõe paga hoje, grava no sim e o desfaz apaga', async () => {
    const { acoes, tabelas, escritas } = cenario();
    const p = await acoes.lancar_no_caixa.preparar(gestor, { tipo: "despesa", valor: "1.200", descricao: "aluguel" });
    expect(p).toEqual({
      tipo: "proposta",
      resumo: 'Lançar no caixa despesa de R$ 1.200: "aluguel" (Aluguel e condomínio), paga hoje 30/10.',
      dados: { tipo: "saida", categoria: "aluguel", descricao: "aluguel", valor: 1200, vencimento: "2026-10-30", pagoEm: "2026-10-30" },
    });
    expect(escritas).toEqual([]);
    if (p.tipo !== "proposta") return;

    const r = await acoes.lancar_no_caixa.executar(gestor, p.dados);
    expect(r).toMatchObject({ ok: true });
    expect(tabelas.caixa_lancamentos).toEqual([
      expect.objectContaining({ grupo_id: G, tipo: "saida", valor: 1200, pago_em: "2026-10-30", competencia: "2026-10-01", criado_por: "gestor" }),
    ]);
    expect(await acoes.lancar_no_caixa.desfazer!(gestor, r.desfazer!)).toEqual({ ok: true, texto: 'Desfeito: "aluguel" saiu do caixa.' });
    expect(tabelas.caixa_lancamentos).toEqual([]);
  });

  it("dia futuro é conta a pagar; mês fechado recusa", async () => {
    const { acoes } = cenario((t) => {
      t.meses_fechados.push({ grupo_id: G, mes: "2026-10-01" });
    });
    const futuro = await acoes.lancar_no_caixa.preparar(gestor, { tipo: "despesa", valor: 300, descricao: "internet", quando: "05/11" });
    expect(futuro).toMatchObject({ tipo: "proposta", resumo: expect.stringContaining("a pagar em 05/11"), dados: { pagoEm: null, categoria: "escritorio" } });
    const hoje = await acoes.lancar_no_caixa.preparar(gestor, { tipo: "receita", valor: 500, descricao: "comissão de aluguel" });
    if (hoje.tipo !== "proposta") throw new Error("sem proposta");
    expect(await acoes.lancar_no_caixa.executar(gestor, hoje.dados)).toMatchObject({ ok: false, texto: expect.stringMatching(/está fechado/) });
  });
});

describe("informar_gasto_de_anuncio", () => {
  it("corretor só acha os anúncios dele; o desfaz devolve o valor anterior", async () => {
    const { acoes, tabelas, escritas } = cenario();
    const p = await acoes.informar_gasto_de_anuncio.preparar(corretor, { campanha: "anúncio do Vitta", valor: "300" });
    expect(p).toEqual({
      tipo: "proposta",
      resumo: 'Anúncio "Reels outubro": gasto total até hoje R$ 300 (estava sem valor).',
      dados: { impulsionamentoId: "i1", nome: "Reels outubro", valor: 300, dia: "2026-10-30" },
    });
    expect(escritas).toEqual([]);
    if (p.tipo !== "proposta") return;

    const r = await acoes.informar_gasto_de_anuncio.executar(corretor, p.dados);
    expect(r).toMatchObject({ ok: true });
    expect(linha(tabelas, "impulsionamentos", "i1")).toMatchObject({ valor_gasto: 300 });
    expect(tabelas.impulsionamento_gastos.find((g) => g.impulsionamento_id === "i1")).toMatchObject({ grupo_id: G, corretor_id: "c1", dia: "2026-10-30", valor_acumulado: 300 });

    expect(await acoes.informar_gasto_de_anuncio.desfazer!(corretor, r.desfazer!)).toEqual({ ok: true, texto: 'Desfeito: o gasto de "Reels outubro" voltou a ficar sem valor.' });
    expect(linha(tabelas, "impulsionamentos", "i1")).toMatchObject({ valor_gasto: null, gasto_informado_em: null });
    expect(tabelas.impulsionamento_gastos.find((g) => g.impulsionamento_id === "i1")).toBeUndefined();
  });

  it("corretor não alcança o anúncio de outro corretor", async () => {
    const { acoes } = cenario();
    expect(await acoes.informar_gasto_de_anuncio.preparar(corretor, { campanha: "Alto da Serra", valor: 100 })).toMatchObject({ tipo: "resposta", resultado: { pergunta: expect.stringMatching(/Não achei/) } });
    expect(await acoes.informar_gasto_de_anuncio.executar(corretor, { impulsionamentoId: "i3", nome: "x", valor: 100, dia: "2026-10-30" })).toMatchObject({ ok: false });
  });

  it("gestor: anúncios do grupo, ambiguidade vira pergunta, o de outro grupo nunca aparece", async () => {
    const { acoes } = cenario();
    const ambiguo = await acoes.informar_gasto_de_anuncio.preparar(gestor, { campanha: "Vitta", valor: 300 });
    expect(ambiguo).toMatchObject({ tipo: "resposta", resultado: { pergunta: "Qual anúncio?" } });
    if (ambiguo.tipo !== "resposta") return;
    expect((ambiguo.resultado as { opcoes: string[] }).opcoes).toEqual(["Reels outubro (Vitta), sem gasto", "Vitta stories (Vitta), R$ 200"]);
  });

  it("gestor corrige o gasto do dia de um anúncio da Ana; o desfaz volta o ponto e o total", async () => {
    const { acoes, tabelas } = cenario((t) => {
      t.impulsionamento_gastos.push({ id: "p3", grupo_id: G, impulsionamento_id: "i2", corretor_id: "c2", dia: "2026-10-30", valor_acumulado: 250 });
      linha(t, "impulsionamentos", "i2").valor_gasto = 250;
    });
    const p = await acoes.informar_gasto_de_anuncio.preparar(gestor, { campanha: "Vitta stories", valor: 400 });
    expect(p).toMatchObject({ tipo: "proposta", resumo: 'Anúncio "Vitta stories" (de Ana Lima): gasto total até hoje R$ 400 (antes R$ 250).' });
    if (p.tipo !== "proposta") return;
    const r = await acoes.informar_gasto_de_anuncio.executar(gestor, p.dados);
    expect(linha(tabelas, "impulsionamento_gastos", "p3").valor_acumulado).toBe(400);
    expect(linha(tabelas, "impulsionamentos", "i2").valor_gasto).toBe(400);
    expect(await acoes.informar_gasto_de_anuncio.desfazer!(gestor, r.desfazer!)).toMatchObject({ ok: true });
    expect(linha(tabelas, "impulsionamento_gastos", "p3").valor_acumulado).toBe(250);
    expect(linha(tabelas, "impulsionamentos", "i2").valor_gasto).toBe(250);
  });

  it("valor menor que o total anterior avisa no resumo", async () => {
    const { acoes } = cenario();
    const p = await acoes.informar_gasto_de_anuncio.preparar(gestor, { campanha: "Vitta stories", valor: 50 });
    expect(p).toMatchObject({ tipo: "proposta", resumo: expect.stringContaining("é menos que o total anterior") });
  });
});

describe("redistribuir_leads (gestor)", () => {
  it("sem recorte pergunta com os números; o desativado não recebe", async () => {
    const { acoes, escritas } = cenario();
    expect(await acoes.redistribuir_leads.preparar(gestor, { de: "Ana", para: "Beto" })).toEqual({
      tipo: "resposta",
      resultado: { pergunta: "Ana Lima tem 3 leads em andamento, 2 deles parados há 15+ dias. Passo para Beto Souza só os parados ou todos os em andamento?" },
    });
    expect(await acoes.redistribuir_leads.preparar(gestor, { de: "Ana", para: "Bruno", quais: "parados" })).toMatchObject({
      tipo: "resposta",
      resultado: { erro: expect.stringMatching(/Bruno Velho está desativado/) },
    });
    expect(escritas).toEqual([]);
  });

  it("os parados da Ana para o Beto: propõe, move no sim, avisa os dois; o desfaz devolve só o que ficou com o Beto", async () => {
    const { acoes, tabelas, escritas, avisos } = cenario();
    const p = await acoes.redistribuir_leads.preparar(gestor, { de: "a Ana", para: "o Beto", quais: "os parados" });
    expect(p).toEqual({
      tipo: "proposta",
      resumo: "Passar 2 leads parados há 15+ dias de Ana Lima para Beto Souza. O central avisa Ana e Beto.",
      dados: { deId: "c2", deNome: "Ana Lima", paraId: "c3", paraNome: "Beto Souza", criterio: { tipo: "parados", dias: 15 }, leadIds: ["a1", "a2"] },
    });
    expect(escritas).toEqual([]);
    if (p.tipo !== "proposta") return;

    const r = await acoes.redistribuir_leads.executar(gestor, p.dados);
    expect(r).toMatchObject({ ok: true, texto: "2 leads passaram de Ana Lima para Beto Souza." });
    expect(["a1", "a2"].map((id) => linha(tabelas, "leads", id))).toEqual([
      expect.objectContaining({ corretor_id: "c3", origem_atribuicao: "manual" }),
      expect.objectContaining({ corretor_id: "c3", origem_atribuicao: "manual" }),
    ]);
    expect(linha(tabelas, "leads", "a3").corretor_id).toBe("c2");
    expect(linha(tabelas, "leads", "a4").corretor_id).toBe("c2");
    expect(linha(tabelas, "leads", "a5").corretor_id).toBe("c2");
    expect(tabelas.lead_interacoes.filter((l) => l.tipo === "repasse").map((l) => (l.detalhes as Linha).origem_anterior)).toEqual(["roleta", null]);
    expect(tabelas.admin_eventos).toEqual([
      expect.objectContaining({ ator_id: "gestor", acao: "leads_redistribuidos", alvo_corretor_id: "c2", detalhes: expect.objectContaining({ para: "c3", quantidade: 2 }) }),
    ]);
    expect(avisos).toEqual([
      { corretorId: "c3", texto: "Beto, Gil passou para você 2 leads parados há 15+ dias que eram de Ana Lima. Já estão na sua carteira no painel." },
      { corretorId: "c2", texto: "Ana, Gil passou 2 leads parados há 15+ dias da sua carteira para Beto Souza." },
    ]);

    // O Beto passou um adiante: esse fica onde está.
    linha(tabelas, "leads", "a2").corretor_id = "c1";
    avisos.length = 0;
    const d = await acoes.redistribuir_leads.desfazer!(gestor, r.desfazer!);
    expect(d).toEqual({ ok: true, texto: "Desfeito: 1 lead voltou de Beto Souza para Ana Lima. 1 lead já tinha mudado de mão e ficou." });
    expect(linha(tabelas, "leads", "a1")).toMatchObject({ corretor_id: "c2", origem_atribuicao: "roleta" });
    expect(linha(tabelas, "leads", "a2").corretor_id).toBe("c1");
    expect(avisos.map((a) => a.corretorId)).toEqual(["c2", "c3"]);
    expect(avisos[0].texto).toBe("Ana, Gil desfez a passagem: 1 lead parados há 15+ dias voltou para a sua carteira.");
  });

  it('"para mim": o gestor não avisa a si mesmo', async () => {
    const { acoes, avisos } = cenario();
    const p = await acoes.redistribuir_leads.preparar(gestor, { de: "Ana", para: "mim", quais: "todos" });
    expect(p).toMatchObject({ tipo: "proposta", resumo: "Passar 3 leads em andamento de Ana Lima para Gil Ramos. O central avisa Ana." });
    if (p.tipo !== "proposta") return;
    await acoes.redistribuir_leads.executar(gestor, p.dados);
    expect(avisos.map((a) => a.corretorId)).toEqual(["c2"]);
  });

  it("o corretor de outro grupo nunca é achado nem alcançado", async () => {
    const { acoes, tabelas } = cenario();
    // "Ana Paula" é do grupo 2: no grupo 1 só a Ana Lima casa com "Ana".
    expect(await acoes.redistribuir_leads.preparar(gestor, { de: "Ana Paula", para: "Beto", quais: "todos" })).toMatchObject({ tipo: "resposta", resultado: { erro: expect.stringMatching(/Não achei/) } });
    // Dados forjados com a corretora e o lead do grupo 2: nada se move.
    const r = await acoes.redistribuir_leads.executar(gestor, { deId: "x1", paraId: "c3", criterio: { tipo: "em_andamento" }, leadIds: ["z1"] });
    expect(r).toMatchObject({ ok: false });
    expect(linha(tabelas, "leads", "z1").corretor_id).toBe("x1");
  });
});
