import { describe, expect, it, vi } from "vitest";
import { bancoFalso, type Linha } from "../bancoFalso";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));

const { criarTratadoresDeImoveis, acharImovel, dormitoriosDoPedido, prazoEmMeses, lerCatalogoDoGrupo, TETO_DE_SUGESTOES } = await import("./imoveis");
const { criarExecutor } = await import("../executar");
const { PARAMETROS_PADRAO } = await import("@/lib/credito/parametrosPadrao");
const { simularFinanciamento } = await import("@/lib/consultor/financiamento");

/*
 * O catálogo e a carteira rodam pela chave de serviço: o grupo e o dono
 * filtrados à mão são a única coisa entre a pergunta e os dados de outra
 * imobiliária. O grupo 2 tem um "Vitra" com o mesmo apelido "Vitta": se o
 * filtro de grupo sumir, o "Vitta" vira ambíguo e o teste acusa.
 */
const G = "g1";
const corretor = { corretorId: "c1", grupoId: G, papel: "corretor" as const, nome: "Carol", imobiliaria: "Next Home" };
const gestor = { ...corretor, corretorId: "gestor", papel: "gestor" as const, nome: "Gil" };

function cenario() {
  // As plantas são os MESMOS objetos na tabela e dentro do imóvel (o embed):
  // o banco falso não junta tabelas, e assim a escrita aparece nas duas.
  const planta = (p: Linha): Linha => ({ grupo_id: G, suites: 0, vagas: 1, unidades_disponiveis: null, planta_url: null, ordem: 0, ...p });
  const t1 = planta({ id: "t1", empreendimento_id: "vitra", nome: "Tipo 2 dorms", dormitorios: 2, area_privativa: "62", preco: "450000", planta_url: "https://x/p.png" });
  const t2 = planta({ id: "t2", empreendimento_id: "vitra", nome: "Tipo 3 dorms", dormitorios: 3, area_privativa: "80", preco: "600000", ordem: 1 });
  const t3 = planta({ id: "t3", empreendimento_id: "royal1", nome: "2 dorms A", dormitorios: 2, preco: null });
  const t4 = planta({ id: "t4", empreendimento_id: "royal1", nome: "2 dorms B", dormitorios: 2, preco: null });
  const tX = planta({ id: "tx", grupo_id: "g2", empreendimento_id: "vitra-g2", nome: "2 dorms", dormitorios: 2, preco: "1" });

  const imovel = (i: Linha): Linha => ({
    grupo_id: G,
    nomes_alternativos: [],
    cidade: "Barueri",
    bairro: "Alphaville",
    endereco: null,
    construtora: null,
    status: "lancamento",
    publicado: true,
    entrega_prevista: null,
    tipologias: [],
    ...i,
  });
  const b = bancoFalso({
    empreendimentos: [
      imovel({ id: "vitra", nome: "Vitra Residencial", slug: "vitra-residencial", nomes_alternativos: ["Vitta"], preco_a_partir: "450000", entrega_prevista: "2027-10-01", tipologias: [t1, t2] }),
      imovel({ id: "royal1", nome: "Royal Barueri I", slug: "royal-barueri-i", preco_a_partir: "400000", tipologias: [t3, t4] }),
      imovel({ id: "royal2", nome: "Royal Barueri II", slug: "royal-barueri-ii", preco_a_partir: "420000", tipologias: [planta({ id: "t5", dormitorios: 2 })] }),
      imovel({ id: "eternity", nome: "Eternity Alphaville", slug: "eternity", preco_a_partir: "480000", tipologias: [planta({ id: "t6", dormitorios: 2 })] }),
      imovel({ id: "aurora", nome: "Aurora Alphaville", slug: "aurora", preco_a_partir: "300000", publicado: false, tipologias: [planta({ id: "t7", dormitorios: 2 })] }),
      imovel({ id: "bosque", nome: "Bosque Osasco", slug: "bosque", cidade: "Osasco", bairro: "Centro", preco_a_partir: "300000", tipologias: [] }),
      imovel({ id: "vitra-g2", grupo_id: "g2", nome: "Vitra Prime", slug: "vitra-prime", nomes_alternativos: ["Vitta"], preco_a_partir: "1", tipologias: [tX] }),
    ],
    tipologias: [t1, t2, t3, t4, tX],
    unidades: [
      { id: "u1", grupo_id: G, empreendimento_id: "vitra", identificacao: "32", status: "disponivel", tipologia_id: "t1", reservada_ate: "2026-11-02T02:59:00.000Z", atualizado_em: "2026-10-01T00:00:00.000Z" },
      { id: "u2", grupo_id: G, empreendimento_id: "vitra", identificacao: "A-101", status: "vendida", tipologia_id: "t2", reservada_ate: null, atualizado_em: "2026-10-01T00:00:00.000Z" },
      { id: "ux", grupo_id: "g2", empreendimento_id: "vitra-g2", identificacao: "32", status: "disponivel", tipologia_id: null, reservada_ate: null, atualizado_em: null },
    ],
    midias: [
      { grupo_id: G, empreendimento_id: "vitra", tipo: "foto" },
      { grupo_id: G, empreendimento_id: "vitra", tipo: "foto" },
      { grupo_id: "g2", empreendimento_id: "vitra", tipo: "foto" },
    ],
    leads: [
      lead({ id: "l1", corretor_id: "c1", nome: "João Pereira", regiao_interesse: "Alphaville", dormitorios_min: 2, orcamento_max: "500000" }),
      lead({ id: "l2", corretor_id: "c2", nome: "Maria Lima", regiao_interesse: "Barueri", orcamento_max: "700000" }),
      lead({ id: "l3", corretor_id: "c1", nome: "Pedro Osasco", regiao_interesse: "Osasco" }),
      lead({ id: "l4", corretor_id: "c1", nome: "Ana Sem Critério" }),
      lead({ id: "l5", corretor_id: "c1", nome: "Fechou Já", regiao_interesse: "Alphaville", etapa: "fechado" }),
      lead({ id: "l9", grupo_id: "g2", corretor_id: "c9", nome: "Zé de Outra Casa", regiao_interesse: "Alphaville" }),
    ],
    lead_observacoes_ia: [],
    corretores: [
      { id: "c1", grupo_id: G, nome: "Carol", slug: "carol" },
      { id: "c2", grupo_id: G, nome: "Bruno", slug: "bruno" },
      { id: "c9", grupo_id: "g2", nome: "Zé Corretor", slug: "ze" },
    ],
    historico_precos_lotes: [],
    historico_precos_itens: [],
  });
  const revalidou = vi.fn();
  const links: string[] = [];
  const t = criarTratadoresDeImoveis({
    banco: () => b.cliente,
    parametros: async () => PARAMETROS_PADRAO,
    link: async (_ctx, slug) => (links.push(slug), `https://site/empreendimentos/${slug}`),
    revalidar: revalidou,
    relogio: () => new Date("2026-10-30T15:00:00.000Z"),
  });
  const executor = (ctx: typeof corretor | typeof gestor) =>
    criarExecutor(ctx, { consultas: t.consultas, acoes: t.acoes }, 2);
  return { ...b, ...t, revalidou, links, executor, atualizar: t.acoes.atualizar_imovel };
}

function lead(l: Linha): Linha {
  return {
    grupo_id: G,
    telefone: null,
    etapa: "em_conversa",
    arquivado_em: null,
    nao_contatar_em: null,
    regiao_interesse: null,
    dormitorios_min: null,
    orcamento_max: null,
    orcamento_min: null,
    renda_mensal: null,
    empreendimento_id: null,
    imovel_interesse_id: null,
    ...l,
  };
}

const linha = (t: Record<string, Linha[]>, tabela: string, id: string) => t[tabela].find((l) => l.id === id)!;

describe("qual imóvel a pessoa quis dizer", () => {
  it("dormitórios saem do pedido e não atrapalham o nome", async () => {
    expect(dormitoriosDoPedido("2 dorms do Vitta")).toBe(2);
    expect(dormitoriosDoPedido("o de 3 quartos")).toBe(3);
    expect(dormitoriosDoPedido("Vitta")).toBeNull();
    const { cliente } = cenario();
    const catalogo = await lerCatalogoDoGrupo(cliente, G);
    const r = acharImovel("2 dorms do Vitta", catalogo, "Next Home");
    expect(r.tipo === "um" && r.imovel.id).toBe("vitra");
  });

  it("o catálogo de outro grupo nunca entra: o apelido repetido no grupo 2 não deixa o Vitta ambíguo", async () => {
    const { cliente } = cenario();
    const catalogo = await lerCatalogoDoGrupo(cliente, G);
    expect(catalogo.map((i) => i.id)).not.toContain("vitra-g2");
    expect(acharImovel("Prime", catalogo, "Next Home")).toEqual({ tipo: "nenhum" });
  });

  it("imóvel ambíguo vira pergunta, sem escolher sozinho", async () => {
    const { consultas, escritas } = cenario();
    const r = (await consultas.informacao_de_imovel(corretor, { imovel: "Royal" })) as { pergunta: string; opcoes: string[] };
    expect(r.pergunta).toMatch(/mais de um imóvel/);
    expect(r.opcoes).toEqual(["Royal Barueri I (Alphaville, Barueri)", "Royal Barueri II (Alphaville, Barueri)"]);
    expect(escritas).toEqual([]);
  });
});

describe("informacao_de_imovel", () => {
  it("preço, metragem, disponibilidade, fotos e o link da página", async () => {
    const { consultas } = cenario();
    const r = (await consultas.informacao_de_imovel(corretor, { imovel: "Vitta" })) as Record<string, unknown>;
    expect(r).toMatchObject({
      imovel: "Vitra Residencial",
      onde: "Alphaville, Barueri",
      situacao: "Lançamento",
      entrega: "10/2027",
      precoAPartir: "R$ 450.000",
      unidades: { disponiveis: 1, reservadas: 0, vendidas: 1 },
      fotos: 2, // a foto do grupo 2 não conta
      temPlanta: true,
      link: "https://site/empreendimentos/vitra-residencial",
    });
    expect(r.plantas).toEqual([
      { planta: "Tipo 2 dorms", dormitorios: 2, vagas: 1, metragem: "62 m²", preco: "R$ 450.000", disponiveis: 1, imagemDaPlanta: true },
      { planta: "Tipo 3 dorms", dormitorios: 3, vagas: 1, metragem: "80 m²", preco: "R$ 600.000", disponiveis: 0 },
    ]);
  });

  it("'2 dorms do Vitta' traz só a planta pedida", async () => {
    const { consultas } = cenario();
    const r = (await consultas.informacao_de_imovel(corretor, { imovel: "2 dorms do Vitta" })) as { plantas: { planta: string }[] };
    expect(r.plantas.map((p) => p.planta)).toEqual(["Tipo 2 dorms"]);
  });

  it("imóvel não publicado não tem link para o cliente", async () => {
    const { consultas, links } = cenario();
    const r = (await consultas.informacao_de_imovel(corretor, { imovel: "Aurora" })) as Record<string, unknown>;
    expect(r.link).toBeUndefined();
    expect(r.naoPublicado).toMatch(/não está publicado/);
    expect(links).toEqual([]);
  });
});

describe("imoveis_para_o_lead", () => {
  it(`até ${TETO_DE_SUGESTOES} sugestões, com o porquê, só do catálogo publicado do grupo`, async () => {
    const { consultas, escritas } = cenario();
    const r = (await consultas.imoveis_para_o_lead(corretor, { lead: "João" })) as {
      cliente: string;
      procura: Record<string, string>;
      sugestoes: { imovel: string; porque: string; link: string }[];
    };
    expect(r.cliente).toBe("João Pereira");
    expect(r.procura).toEqual({ regiao: "Alphaville", dormitorios: "2+", orcamento: "até R$ 500.000" });
    expect(r.sugestoes).toHaveLength(TETO_DE_SUGESTOES);
    const nomes = r.sugestoes.map((s) => s.imovel);
    expect(nomes).not.toContain("Aurora Alphaville"); // não publicado
    expect(nomes).not.toContain("Vitra Prime"); // outro grupo
    expect(r.sugestoes[0].porque).toMatch(/região \(Alphaville\)/);
    expect(r.sugestoes[0].link).toMatch(/^https:\/\/site\/empreendimentos\//);
    expect(escritas).toEqual([]);
  });

  it("corretor não pede imóvel para o lead de outro corretor", async () => {
    const { consultas } = cenario();
    const r = (await consultas.imoveis_para_o_lead(corretor, { lead: "Maria" })) as { erro: string };
    expect(r.erro).toMatch(/Não achei cliente/);
  });

  it("lead sem critério não ganha sugestão inventada", async () => {
    const { consultas } = cenario();
    const r = (await consultas.imoveis_para_o_lead(corretor, { lead: "Ana" })) as Record<string, unknown>;
    expect(r.semCriterio).toMatch(/não diz o que ele procura/);
    expect(r.sugestoes).toBeUndefined();
  });
});

describe("leads_para_o_imovel", () => {
  it("corretor vê só os leads dele, sem telefone nem renda", async () => {
    const { consultas } = cenario();
    const r = (await consultas.leads_para_o_imovel(corretor, { imovel: "Vitta" })) as { leads: Record<string, string>[]; escopo: string; lista: string };
    expect(r.escopo).toBe("seus clientes");
    expect(r.leads.map((l) => l.nome)).toEqual(["João Pereira"]);
    expect(Object.keys(r.leads[0]).sort()).toEqual(["etapa", "nome", "porque"]);
    expect(r.leads[0].etapa).toBe("Em conversa");
    expect(r.lista).toMatch(/lista de transmissão/);
  });

  it("gestor vê o grupo, com o corretor de cada um, e nunca outro grupo nem fechado", async () => {
    const { consultas } = cenario();
    const r = (await consultas.leads_para_o_imovel(gestor, { imovel: "Vitta" })) as { leads: { nome: string; corretor: string }[] };
    expect(r.leads.map((l) => l.nome).sort()).toEqual(["João Pereira", "Maria Lima"]);
    expect(r.leads.find((l) => l.nome === "Maria Lima")?.corretor).toBe("Bruno");
  });
});

describe("simular_financiamento", () => {
  it("a conta do simulador da plataforma, sem tocar no banco", async () => {
    const { consultas, escritas } = cenario();
    const r = (await consultas.simular_financiamento(corretor, { valor: "450 mil", renda: "8 mil", entrada: 90000, prazo_meses: 35 })) as Record<string, unknown>;
    const s = simularFinanciamento({ rendaMensal: 8000, entrada: 90000, valorImovel: 450000, prazoMeses: 420 }, PARAMETROS_PADRAO);
    expect(r.estimativa).toMatch(/estimativa/);
    expect(r.prazo).toBe("420 meses (35 anos)");
    expect(r.fecha).toBe(s.fecha);
    expect(r.taxa).toMatch(/Faixa 3 do MCMV/);
    expect(r.parcela ?? r.falta).toBeTruthy();
    expect(escritas).toEqual([]);
  });

  it("sem renda, conta pelo SBPE e diz a renda que a parcela pede", async () => {
    const { consultas } = cenario();
    const r = (await consultas.simular_financiamento(corretor, { valor: 450000 })) as Record<string, unknown>;
    expect(r.taxa).toMatch(/SBPE/);
    expect(r.rendaNecessaria).toMatch(/^R\$/);
    expect(r.semRenda).toBeTruthy();
  });

  it("prazo em anos ou meses", () => {
    expect(prazoEmMeses(30)).toBe(360);
    expect(prazoEmMeses("420")).toBe(420);
    expect(prazoEmMeses(undefined)).toBeNull();
  });
});

describe("atualizar_imovel (só gestor)", () => {
  it("corretor é recusado pelo executor e pela própria ação, sem gravar", async () => {
    const c = cenario();
    expect(await c.executor(corretor).executar("atualizar_imovel", { imovel: "Vitta", preco: "480 mil" })).toEqual({
      erro: "Isso é só para o gestor da imobiliária.",
    });
    expect(await c.atualizar.preparar(corretor, { imovel: "Vitta", preco: "480 mil" })).toMatchObject({ tipo: "resposta" });
    const dados = { nome: "Vitra", preco: { alvo: { tipo: "imovel", empreendimentoId: "vitra" }, rotulo: "preço", antes: 450000, depois: 1 } };
    expect((await c.atualizar.executar(corretor, dados)).ok).toBe(false);
    expect(c.escritas).toEqual([]);
  });

  it("preparar não grava e mostra antes → depois; executar usa só os dados", async () => {
    const c = cenario();
    const preparo = await c.atualizar.preparar(gestor, { imovel: "2 dorms do Vitta", preco: "480 mil" });
    expect(preparo).toMatchObject({ tipo: "proposta", resumo: "Vitra Residencial: preço da planta Tipo 2 dorms (62 m²) R$ 450.000 → R$ 480.000" });
    expect(c.escritas).toEqual([]);
    if (preparo.tipo !== "proposta") throw new Error("sem proposta");

    const r = await c.atualizar.executar(gestor, preparo.dados);
    expect(r.ok).toBe(true);
    expect(linha(c.tabelas, "tipologias", "t1").preco).toBe(480000);
    expect(c.revalidou).toHaveBeenCalled();
    // O preço de planta não mexe no "a partir de" nem cria lote.
    expect(linha(c.tabelas, "empreendimentos", "vitra").preco_a_partir).toBe("450000");
    expect(c.tabelas.historico_precos_lotes).toEqual([]);

    const volta = await c.atualizar.desfazer!(gestor, r.desfazer!);
    expect(volta).toMatchObject({ ok: true });
    expect(linha(c.tabelas, "tipologias", "t1").preco).toBe(450000);
  });

  it("os ids vêm dos dados: id de outro grupo não é gravado", async () => {
    const c = cenario();
    const dados = { nome: "Vitra", preco: { alvo: { tipo: "planta", empreendimentoId: "vitra-g2", tipologiaId: "tx" }, rotulo: "preço", antes: 1, depois: 999999 } };
    const r = await c.atualizar.executar(gestor, dados);
    expect(r.ok).toBe(false);
    expect(linha(c.tabelas, "tipologias", "tx").preco).toBe("1");
    expect(c.escritas).toEqual([]);
  });

  it("o 'a partir de' entra no histórico da tela de preços, e o desfaz marca o lote revertido", async () => {
    const c = cenario();
    const preparo = await c.atualizar.preparar(gestor, { imovel: "Vitta", preco: 470000 });
    if (preparo.tipo !== "proposta") throw new Error("sem proposta");
    expect(preparo.resumo).toBe("Vitra Residencial: preço a partir de R$ 450.000 → R$ 470.000");
    const r = await c.atualizar.executar(gestor, preparo.dados);
    expect(linha(c.tabelas, "empreendimentos", "vitra").preco_a_partir).toBe(470000);
    expect(c.tabelas.historico_precos_lotes).toMatchObject([{ grupo_id: G, gestor_id: "gestor", total_imoveis: 1, status: "aplicado" }]);
    expect(c.tabelas.historico_precos_itens).toMatchObject([{ grupo_id: G, empreendimento_id: "vitra", preco_anterior: 450000, preco_novo: 470000 }]);

    await c.atualizar.desfazer!(gestor, r.desfazer!);
    expect(linha(c.tabelas, "empreendimentos", "vitra").preco_a_partir).toBe(450000);
    expect(c.tabelas.historico_precos_lotes[0].status).toBe("revertido");
  });

  it("o desfaz respeita mudança feita depois por outra pessoa", async () => {
    const c = cenario();
    const preparo = await c.atualizar.preparar(gestor, { imovel: "Vitta", preco: 470000 });
    if (preparo.tipo !== "proposta") throw new Error("sem proposta");
    const r = await c.atualizar.executar(gestor, preparo.dados);
    linha(c.tabelas, "empreendimentos", "vitra").preco_a_partir = "490000"; // a tela de preços mexeu depois
    const volta = await c.atualizar.desfazer!(gestor, r.desfazer!);
    expect(volta.ok).toBe(false);
    expect(volta.texto).toMatch(/mudou de novo depois/);
    expect(linha(c.tabelas, "empreendimentos", "vitra").preco_a_partir).toBe("490000");
  });

  it("preço mudado entre a proposta e o 'sim' não é atropelado", async () => {
    const c = cenario();
    const preparo = await c.atualizar.preparar(gestor, { imovel: "Vitta", preco: 470000 });
    if (preparo.tipo !== "proposta") throw new Error("sem proposta");
    linha(c.tabelas, "empreendimentos", "vitra").preco_a_partir = "460000";
    const r = await c.atualizar.executar(gestor, preparo.dados);
    expect(r.ok).toBe(false);
    expect(r.texto).toMatch(/mudou desde a proposta/);
    expect(linha(c.tabelas, "empreendimentos", "vitra").preco_a_partir).toBe("460000");
  });

  it("unidade vendida: proposta, gravação e desfaz com o prazo de reserva de volta", async () => {
    const c = cenario();
    const preparo = await c.atualizar.preparar(gestor, { imovel: "Vitta", unidade: "32", disponivel: false });
    expect(preparo).toMatchObject({ tipo: "proposta", resumo: "Vitra Residencial: unidade 32 disponível → vendida" });
    if (preparo.tipo !== "proposta") throw new Error("sem proposta");
    const r = await c.atualizar.executar(gestor, preparo.dados);
    expect(r.ok).toBe(true);
    expect(linha(c.tabelas, "unidades", "u1")).toMatchObject({ status: "vendida", reservada_ate: null });
    expect(linha(c.tabelas, "unidades", "ux").status).toBe("disponivel"); // a "32" do grupo 2 fica

    const volta = await c.atualizar.desfazer!(gestor, r.desfazer!);
    expect(volta.ok).toBe(true);
    expect(linha(c.tabelas, "unidades", "u1")).toMatchObject({ status: "disponivel", reservada_ate: "2026-11-02T02:59:00.000Z" });
  });

  it("unidade revendida no painel depois do central: o desfaz não apaga a venda nova", async () => {
    const c = cenario();
    const preparo = await c.atualizar.preparar(gestor, { imovel: "Vitta", unidade: "32", disponivel: "vendida" });
    if (preparo.tipo !== "proposta") throw new Error("sem proposta");
    const r = await c.atualizar.executar(gestor, preparo.dados);
    Object.assign(linha(c.tabelas, "unidades", "u1"), { status: "vendida", atualizado_em: "2026-10-31T10:00:00.000Z" });
    const volta = await c.atualizar.desfazer!(gestor, r.desfazer!);
    expect(volta.ok).toBe(false);
    expect(linha(c.tabelas, "unidades", "u1").status).toBe("vendida");
  });

  it("unidade que não existe e planta ambígua viram resposta, não proposta", async () => {
    const c = cenario();
    expect(await c.atualizar.preparar(gestor, { imovel: "Vitta", unidade: "999", disponivel: false })).toMatchObject({
      tipo: "resposta",
      resultado: { erro: expect.stringMatching(/não está cadastrada/) },
    });
    expect(await c.atualizar.preparar(gestor, { imovel: "2 dorms do Royal Barueri I", preco: "410 mil" })).toMatchObject({
      tipo: "resposta",
      resultado: { pergunta: expect.stringMatching(/mais de uma planta/) },
    });
    expect(await c.atualizar.preparar(gestor, { imovel: "Vitta", preco: 480 })).toMatchObject({
      tipo: "resposta",
      resultado: { erro: expect.stringMatching(/não parece preço/) },
    });
    expect(c.escritas).toEqual([]);
  });
});
