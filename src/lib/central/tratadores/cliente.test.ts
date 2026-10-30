import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type Linha } from "../bancoFalso";
import type { ContextoDoCentral } from "../executar";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));

/*
 * O WhatsApp de verdade fica de fora: o provedor e o repositório das
 * conversas viram falsos (o resto dos dois módulos segue o real, porque
 * outros arquivos importam deles). O resto é o caminho de produção: o
 * tratador, `envioAoClientePeloCentral` e `documentoPeloCentral` sobre o banco
 * falso.
 */
const enviados = vi.hoisted(() => ({
  texto: [] as { instanceName: string; telefone: string; texto: string }[],
  midia: [] as { instanceName: string; telefone: string; tipo: string; url: string }[],
  gravadas: [] as { conversaId: string; remetente: string; conteudo: string }[],
  conversas: {} as Record<string, unknown>,
  cota: { permitido: true } as { permitido: boolean; motivo?: string; detalhe?: string; esperaMs?: number },
  pedidosDeCota: 0,
}));
vi.mock("@/lib/whatsapp/provider", async () => ({
  ...(await vi.importActual<object>("@/lib/whatsapp/provider")),
  enviarMensagemWhatsapp: vi.fn(async (p: { instanceName: string; telefone: string; texto: string }) => {
    enviados.texto.push(p);
    return { enviado: true, messageId: `msg-${enviados.texto.length}` };
  }),
  enviarMidiaWhatsapp: vi.fn(async (p: { instanceName: string; telefone: string; tipo: string; url: string }) => {
    enviados.midia.push(p);
    return { enviado: true, messageId: `midia-${enviados.midia.length}` };
  }),
}));
vi.mock("@/lib/whatsapp/repositorio", async () => ({
  ...(await vi.importActual<object>("@/lib/whatsapp/repositorio")),
  lerConversaPersistida: vi.fn(async (id: string) => enviados.conversas[id] ?? null),
  gravarMensagem: vi.fn(async (p: { conversaId: string; remetente: string; conteudo: string }) => {
    enviados.gravadas.push(p);
    return { inedita: true, id: "gravada" };
  }),
  registrarResultadoEnvio: vi.fn(async () => {}),
  reservarCotaCampanha: vi.fn(async () => {
    enviados.pedidosDeCota++;
    return enviados.cota;
  }),
}));

// A fábrica, sem `../executar`: o índice dos tratadores carregaria todas as frentes.
const { criarTratadoresDoCliente, qualMaterial, quantosNaSelecao, pedacosComNome } = await import("./cliente");
const { enviarAoClientePeloCentral } = await import("@/lib/crm/envioAoClientePeloCentral");
const { PARAMETROS_PADRAO } = await import("@/lib/credito/parametrosPadrao");

const G = "g1";
const AGORA = new Date("2026-10-30T15:00:00Z");
const carol: ContextoDoCentral = { corretorId: "c1", grupoId: G, papel: "corretor", nome: "Carol", imobiliaria: "Next Home" };
const gestor: ContextoDoCentral = { ...carol, corretorId: "gestor", papel: "gestor", nome: "Gil" };
const ENDERECO = "https://www.nexthome.test";

const lead = (l: Linha): Linha => ({ grupo_id: G, etapa: "novo", arquivado_em: null, nao_contatar_em: null, ...l });
const imovel = (l: Linha): Linha => ({
  grupo_id: G,
  nomes_alternativos: [],
  endereco: null,
  construtora: null,
  status: "lancamento",
  publicado: true,
  entrega_prevista: null,
  tipologias: [{ id: `${l.id}-t`, nome: "2 dorms", dormitorios: 2, suites: 1, vagas: 1, area_privativa: 60, preco: l.preco_a_partir, unidades_disponiveis: 3, planta_url: null, ordem: 1 }],
  ...l,
});
const conversa = (id: string, telefone: string, extra: Record<string, unknown> = {}) => ({
  id,
  telefoneCliente: telefone,
  botAtivo: true,
  naoContatar: false,
  leadDeOutroCorretor: false,
  ...extra,
});

function cenario() {
  const b = bancoFalso({
    leads: [
      // João já conversa com a Carol e foi o último a falar (espera resposta).
      lead({ id: "j1", corretor_id: "c1", nome: "João Pereira", telefone: "11955554444", regiao_interesse: "Barueri", orcamento_max: 600000, dormitorios_min: 2 }),
      // Maria conversa, mas a última fala é da Carol (envio por iniciativa: cota).
      lead({ id: "m1", corretor_id: "c1", nome: "Maria Costa", telefone: "11944443333" }),
      // Pedro recebeu lista e nunca respondeu: primeiro contato.
      lead({ id: "p1", corretor_id: "c1", nome: "Pedro Alves", telefone: "11933332222" }),
      // Bruno nunca falou com ninguém.
      lead({ id: "b1", corretor_id: "c1", nome: "Bruno Dias", telefone: "11922221111" }),
      // Lúcia pediu para não ser procurada.
      lead({ id: "l1", corretor_id: "c1", nome: "Lúcia Rocha", telefone: "11911110000", nao_contatar_em: "2026-10-20T10:00:00Z" }),
      // Ana é da carteira de outro corretor.
      lead({ id: "a1", corretor_id: "c2", nome: "Ana Souza", telefone: "11987001234" }),
    ],
    corretores: [
      { id: "c1", grupo_id: G, nome: "Carol Lima", whatsapp: "11999990000", slug: "carol" },
      { id: "c2", grupo_id: G, nome: "Caio Reis", whatsapp: "11999991111", slug: "caio" },
    ],
    corretor_whatsapp_instancias: [
      { id: "i1", grupo_id: G, corretor_id: "c1", instance_name: "carol-num", status_conexao: "conectado", conectado_em: "2026-09-01T10:00:00Z", bloqueado_ate: null },
      { id: "i2", grupo_id: G, corretor_id: "c2", instance_name: "caio-num", status_conexao: "conectado", conectado_em: "2026-09-01T10:00:00Z", bloqueado_ate: null },
    ],
    whatsapp_conversas: [
      { id: "cj", grupo_id: G, lead_id: "j1", corretor_id: "c1" },
      { id: "cm", grupo_id: G, lead_id: "m1", corretor_id: "c1" },
      { id: "cp", grupo_id: G, lead_id: "p1", corretor_id: "c1" },
      { id: "cl", grupo_id: G, lead_id: "l1", corretor_id: "c1" },
      { id: "ca", grupo_id: G, lead_id: "a1", corretor_id: "c2" },
    ],
    whatsapp_mensagens: [
      { id: "1", grupo_id: G, conversa_id: "cj", remetente: "corretor", created_at: "2026-10-29T10:00:00Z" },
      { id: "2", grupo_id: G, conversa_id: "cj", remetente: "cliente", created_at: "2026-10-30T14:00:00Z" },
      { id: "3", grupo_id: G, conversa_id: "cm", remetente: "cliente", created_at: "2026-10-28T10:00:00Z" },
      { id: "4", grupo_id: G, conversa_id: "cm", remetente: "corretor", created_at: "2026-10-28T11:00:00Z" },
      { id: "5", grupo_id: G, conversa_id: "cp", remetente: "corretor", created_at: "2026-10-27T10:00:00Z" },
      { id: "6", grupo_id: G, conversa_id: "cl", remetente: "cliente", created_at: "2026-10-27T10:00:00Z" },
      { id: "7", grupo_id: G, conversa_id: "ca", remetente: "cliente", created_at: "2026-10-27T10:00:00Z" },
    ],
    empreendimentos: [
      imovel({ id: "e1", nome: "Vitta Alphaville", slug: "vitta-alphaville", cidade: "Barueri", bairro: "Alphaville", preco_a_partir: 450000 }),
      imovel({ id: "e2", nome: "Breeze Home Clube", slug: "breeze-home-clube", cidade: "Barueri", bairro: "Centro", preco_a_partir: 520000 }),
      imovel({ id: "e3", nome: "Royal Park", slug: "royal-park", cidade: "Osasco", bairro: "Centro", preco_a_partir: 900000 }),
      imovel({ id: "e4", nome: "Solar Rascunho", slug: "solar-rascunho", cidade: "Barueri", bairro: "Centro", preco_a_partir: 400000, publicado: false }),
    ],
    midias: [
      { id: "f1", grupo_id: G, empreendimento_id: "e1", tipo: "foto", url: "https://cdn.test/vitta-1.jpg", alt: "Fachada do Vitta", ordem: 1 },
      { id: "f2", grupo_id: G, empreendimento_id: "e1", tipo: "foto", url: "https://cdn.test/vitta-2.jpg", alt: null, ordem: 2 },
      { id: "p1", grupo_id: G, empreendimento_id: "e1", tipo: "planta", url: "https://cdn.test/vitta-planta.jpg", alt: "Planta 2 dorms", ordem: 3 },
      { id: "v1", grupo_id: G, empreendimento_id: "e1", tipo: "video", url: "https://cdn.test/vitta.mp4", alt: null, ordem: 4 },
      { id: "fx", grupo_id: "g2", empreendimento_id: "e1", tipo: "foto", url: "https://cdn.test/outro-grupo.jpg", alt: null, ordem: 0 },
    ],
    templates_mensagens: [
      { id: "t1", grupo_id: G, corretor_id: "c1", titulo: "Boas-vindas", conteudo: "Olá {{nome_lead}}, aqui é {{nome_corretor}}! Qualquer dúvida, me chama.", padrao: true, created_at: "2026-10-01T10:00:00Z" },
      { id: "t2", grupo_id: G, corretor_id: "c1", titulo: "Lançamento", conteudo: "Oi {{nome_lead}}, saiu o {imovel} em {bairro}!", padrao: false, created_at: "2026-10-02T10:00:00Z" },
      { id: "t3", grupo_id: G, corretor_id: "c2", titulo: "Boas-vindas do Caio", conteudo: "Oi do Caio", padrao: true, created_at: "2026-10-02T10:00:00Z" },
    ],
    links_do_cliente: [
      {
        token: "tok-prop",
        grupo_id: G,
        lead_id: "m1",
        corretor_id: "c1",
        tipo: "proposta",
        aberto_em: null,
        expira_em: "2026-11-20T00:00:00Z",
        created_at: "2026-10-29T10:00:00Z",
        dados: { imovel: "Vitta Alphaville", empreendimentoId: "e1", unidade: "32", valor: 480000, condicao: "20% de entrada e financiamento", validaAte: "2026-11-05T00:00:00Z" },
      },
    ],
    lead_observacoes_ia: [],
    lead_interacoes: [],
  });
  for (const [id, tel] of [
    ["cj", "5511955554444"],
    ["cm", "5511944443333"],
    ["cp", "5511933332222"],
    ["cl", "5511911110000"],
    ["ca", "5511987001234"],
  ]) {
    enviados.conversas[id] = conversa(id, tel, id === "cl" ? { naoContatar: true } : {});
  }
  const gravarLink = vi.fn(async (_s: unknown, p: { tipo: string; leadId: string; nome: string; dados: Record<string, unknown> }) => {
    b.tabelas.links_do_cliente.push({ token: "tok-sel", grupo_id: G, lead_id: p.leadId, corretor_id: "c1", tipo: p.tipo, aberto_em: null, expira_em: "2026-11-29T00:00:00Z", dados: p.dados });
    const url = `${ENDERECO}/v/AbCdEfGh`;
    return { url, token: "tok-sel", mensagem: `Oi, ${p.nome.split(" ")[0]}! Separei os imóveis que mais combinam com o que você me contou, com a simulação do financiamento: ${url}` };
  });
  const t = criarTratadoresDoCliente({
    supabase: () => b.cliente,
    relogio: () => AGORA,
    parametros: async () => PARAMETROS_PADRAO,
    enderecos: async () => ({ enderecoDoCliente: ENDERECO, fichaDoGrupo: null }),
    // O envio de produção, sem a pausa humana entre as fotos.
    enviar: (s, p, a) => enviarAoClientePeloCentral(s, p, a, { esperar: async () => {} }),
    gravarLink: gravarLink as never,
  });
  return {
    ...b,
    mandar_material: t.acoes.mandar_material,
    selecao_ou_proposta: t.acoes.selecao_ou_proposta,
    meu_link_e_mensagens: t.acoes.meu_link_e_mensagens,
    gravarLink,
  };
}

const dadosDe = (r: unknown) => (r as { dados: Record<string, unknown> }).dados;
const nadaSaiu = () => {
  expect(enviados.texto).toEqual([]);
  expect(enviados.midia).toEqual([]);
  expect(enviados.gravadas).toEqual([]);
};

beforeEach(() => {
  enviados.texto.length = 0;
  enviados.midia.length = 0;
  enviados.gravadas.length = 0;
  enviados.cota = { permitido: true };
  enviados.pedidosDeCota = 0;
});

describe("o material pela fala", () => {
  it("book e apresentação são o link; foto e planta, as mídias; vídeo e recado não vão", () => {
    expect(qualMaterial(null)).toEqual({ apresentacao: true, fotos: false, planta: false });
    expect(qualMaterial("o book")).toEqual({ apresentacao: true, fotos: false, planta: false });
    expect(qualMaterial("fotos e a planta")).toEqual({ apresentacao: false, fotos: true, planta: true });
    expect(qualMaterial("o vídeo")).toEqual({ video: true });
    expect(qualMaterial("diz que o preço baixou e que amanhã eu ligo")).toEqual({ recado: true });
  });

  it("a contagem da seleção não confunde dormitórios, e os nomes saem em pedaços", () => {
    expect(quantosNaSelecao("3 imóveis")).toBe(3);
    expect(quantosNaSelecao("três opções")).toBe(3);
    expect(quantosNaSelecao("o 2 dorms do Vitta")).toBeNull();
    expect(pedacosComNome("3 imóveis")).toEqual([]);
    expect(pedacosComNome("Vitta, Breeze e mais 1")).toEqual(["Vitta", "Breeze"]);
  });
});

describe("mandar_material", () => {
  it("o preparar não envia nada; o sim manda o link pessoal pelo número da Carol", async () => {
    const { mandar_material, escritas } = cenario();
    const r = await mandar_material.preparar(carol, { lead: "João", imovel: "Vitta", material: "book" });
    expect(r).toMatchObject({ tipo: "proposta", dados: { o_que: "material", leadId: "j1", midias: [] } });
    const resumo = (r as { resumo: string }).resumo;
    expect(resumo).toMatch(/^Mandar a João Pereira, pelo seu WhatsApp, a apresentação do Vitta Alphaville/);
    expect(resumo).toContain(`${ENDERECO}/empreendimentos/vitta-alphaville?corretor=carol`);
    nadaSaiu();
    expect(escritas).toEqual([]);

    const feito = await mandar_material.executar(carol, dadosDe(r));
    expect(feito).toMatchObject({ ok: true, texto: expect.stringMatching(/^Mandei a João Pereira, pelo seu WhatsApp/) });
    expect(feito.desfazer).toBeUndefined();
    expect(enviados.texto).toEqual([
      {
        instanceName: "carol-num",
        telefone: "5511955554444",
        texto: `Olá! Separei este empreendimento pra você: Vitta Alphaville, em Alphaville, Barueri.\n\n${ENDERECO}/empreendimentos/vitta-alphaville?corretor=carol`,
      },
    ]);
    expect(enviados.gravadas).toMatchObject([{ conversaId: "cj", remetente: "corretor" }]);
    // João esperava resposta: é resposta, sem gastar a cota do número.
    expect(enviados.pedidosDeCota).toBe(0);
  });

  it("fotos e planta saem como mídia do catálogo do grupo (nunca vídeo, nunca de outro grupo)", async () => {
    const { mandar_material } = cenario();
    const r = await mandar_material.preparar(carol, { lead: "João", imovel: "Vitta", material: "as fotos e a planta" });
    expect((r as { resumo: string }).resumo).toBe("Mandar a João Pereira, pelo seu WhatsApp, 2 fotos do Vitta Alphaville e a planta do Vitta Alphaville");
    await mandar_material.executar(carol, dadosDe(r));
    expect(enviados.midia.map((m) => [m.instanceName, m.tipo, m.url])).toEqual([
      ["carol-num", "foto", "https://cdn.test/vitta-1.jpg"],
      ["carol-num", "foto", "https://cdn.test/vitta-2.jpg"],
      ["carol-num", "planta", "https://cdn.test/vitta-planta.jpg"],
    ]);
    // A nota que a IA lê para não reenviar a mesma foto.
    expect(enviados.gravadas[0].conteudo).toBe("📎 Fachada do Vitta: https://cdn.test/vitta-1.jpg");
  });

  it("iniciativa da Carol (a última fala é dela) passa pela cota; sem cota, nada sai", async () => {
    const { mandar_material } = cenario();
    const r = await mandar_material.preparar(carol, { lead: "Maria", imovel: "Vitta" });
    enviados.cota = { permitido: false, motivo: "cota_diaria", detalhe: "", esperaMs: 0 };
    const feito = await mandar_material.executar(carol, dadosDe(r));
    expect(feito).toEqual({ ok: false, texto: expect.stringMatching(/cota de envios de hoje/) });
    expect(enviados.pedidosDeCota).toBe(1);
    nadaSaiu();

    enviados.cota = { permitido: true };
    expect(await mandar_material.executar(carol, dadosDe(r))).toMatchObject({ ok: true });
    expect(enviados.texto[0]).toMatchObject({ instanceName: "carol-num", telefone: "5511944443333" });
  });

  it("primeiro contato não sai pelo central: quem nunca respondeu, e quem nem tem conversa", async () => {
    const { mandar_material } = cenario();
    for (const quem of ["Pedro", "Bruno"]) {
      expect(await mandar_material.preparar(carol, { lead: quem, imovel: "Vitta" })).toMatchObject({
        tipo: "resposta",
        resultado: { erro: expect.stringMatching(/primeiro contato não sai pelo central/) },
      });
    }
    nadaSaiu();
  });

  it("cliente que pediu para não ser procurado recusa, no preparar e no sim", async () => {
    const { mandar_material } = cenario();
    expect(await mandar_material.preparar(carol, { lead: "Lúcia", imovel: "Vitta" })).toMatchObject({
      resultado: { erro: "Lúcia Rocha pediu para não receber mensagens." },
    });
    const feito = await mandar_material.executar(carol, { o_que: "material", leadId: "l1", nome: "Lúcia Rocha", descricao: "x", texto: "Olá!", midias: [] });
    expect(feito).toEqual({ ok: false, texto: "Lúcia Rocha pediu para não receber mensagens." });
    nadaSaiu();
  });

  it("número da Carol desconectado: recusa clara, e se cair entre o resumo e o sim, nada sai", async () => {
    const c = cenario();
    const r = await c.mandar_material.preparar(carol, { lead: "João", imovel: "Vitta" });
    c.tabelas.corretor_whatsapp_instancias[0].status_conexao = "desconectado";
    expect(await c.mandar_material.preparar(carol, { lead: "João", imovel: "Vitta" })).toMatchObject({
      resultado: { erro: expect.stringMatching(/desconectado/) },
    });
    expect(await c.mandar_material.executar(carol, dadosDe(r))).toEqual({ ok: false, texto: expect.stringMatching(/desconectado/) });
    nadaSaiu();
  });

  it("o gestor não manda pelo número de outro corretor, nem forjando os dados do sim", async () => {
    const { mandar_material } = cenario();
    expect(await mandar_material.preparar(gestor, { lead: "Ana Souza", imovel: "Vitta" })).toMatchObject({
      resultado: { erro: expect.stringMatching(/cliente de outro corretor/) },
    });
    const feito = await mandar_material.executar(gestor, { o_que: "material", leadId: "a1", nome: "Ana Souza", descricao: "x", texto: "Olá!", midias: [] });
    expect(feito).toMatchObject({ ok: false });
    nadaSaiu();
  });

  it("o corretor não alcança lead de outro", async () => {
    const { mandar_material } = cenario();
    expect(await mandar_material.preparar(carol, { lead: "Ana Souza", imovel: "Vitta" })).toMatchObject({
      resultado: { erro: expect.stringMatching(/Não achei/) },
    });
  });

  it("recado livre e vídeo não saem; imóvel não publicado não é material", async () => {
    const { mandar_material } = cenario();
    expect(await mandar_material.preparar(carol, { lead: "João", imovel: "Vitta", material: "diz que o preço baixou" })).toMatchObject({
      resultado: { erro: expect.stringMatching(/Recado livre você manda do seu WhatsApp/) },
    });
    expect(await mandar_material.preparar(carol, { lead: "João", imovel: "Vitta", material: "o vídeo" })).toMatchObject({
      resultado: { erro: expect.stringMatching(/Vídeo e tour/) },
    });
    expect(await mandar_material.preparar(carol, { lead: "João", imovel: "Solar Rascunho" })).toMatchObject({
      resultado: { erro: expect.stringMatching(/Não achei/) },
    });
    nadaSaiu();
  });
});

describe("selecao_ou_proposta", () => {
  it("seleção de 3: os que combinam com a ficha; no sim, grava a página e manda o link; desfazer desativa se não foi vista", async () => {
    const c = cenario();
    const r = await c.selecao_ou_proposta.preparar(carol, { lead: "João", tipo: "selecao", imoveis: "3 imóveis" });
    expect(r).toMatchObject({ tipo: "proposta", dados: { o_que: "selecao", leadId: "j1", empreendimentos: ["e1", "e2"] } });
    expect((r as { resumo: string }).resumo).toMatch(/^Criar a seleção de João Pereira com Vitta Alphaville e Breeze Home Clube \(só 2 combinam com a ficha\), e mandar/);
    expect(c.gravarLink).not.toHaveBeenCalled();
    nadaSaiu();

    const feito = await c.selecao_ou_proposta.executar(carol, dadosDe(r));
    expect(feito).toMatchObject({ ok: true, desfazer: { o_que: "selecao", token: "tok-sel" } });
    expect(c.gravarLink).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ tipo: "selecao", leadId: "j1", corretorId: "c1", dados: { empreendimentos: ["e1", "e2"] }, comCodigoCurto: true }));
    expect(enviados.texto).toHaveLength(1);
    expect(enviados.texto[0]).toMatchObject({ instanceName: "carol-num", texto: expect.stringContaining(`${ENDERECO}/v/AbCdEfGh`) });

    const desfeito = await c.selecao_ou_proposta.desfazer!(carol, feito.desfazer!);
    expect(desfeito).toEqual({ ok: true, texto: expect.stringMatching(/o link não abre mais.*mensagem enviada não volta/) });
    expect(c.tabelas.links_do_cliente.find((l) => l.token === "tok-sel")!.expira_em).toBe(AGORA.toISOString());
  });

  it("seleção já vista não é desativada; a mensagem enviada não volta", async () => {
    const c = cenario();
    c.tabelas.links_do_cliente.push({ token: "tok-vista", grupo_id: G, lead_id: "j1", corretor_id: "c1", tipo: "selecao", aberto_em: "2026-10-30T15:30:00Z", expira_em: "2026-11-29T00:00:00Z" });
    const r = await c.selecao_ou_proposta.desfazer!(carol, { o_que: "selecao", token: "tok-vista", nome: "João Pereira" });
    expect(r).toEqual({ ok: false, texto: expect.stringMatching(/já abriu a página.*mensagem enviada não volta/) });
    expect(c.tabelas.links_do_cliente.find((l) => l.token === "tok-vista")!.expira_em).toBe("2026-11-29T00:00:00Z");
  });

  it("seleção pelos nomes; sem critério na ficha e sem nomes, pergunta", async () => {
    const c = cenario();
    const r = await c.selecao_ou_proposta.preparar(carol, { lead: "João", tipo: "selecao", imoveis: "Royal e Vitta" });
    expect(dadosDe(r)).toMatchObject({ empreendimentos: ["e3", "e1"] });
    expect(await c.selecao_ou_proposta.preparar(carol, { lead: "Maria", tipo: "selecao" })).toMatchObject({
      resultado: { pergunta: expect.stringMatching(/Quais imóveis vão na seleção de Maria Costa/) },
    });
  });

  it("proposta: manda a que a Carol montou na ficha; sem proposta aberta, aponta o painel", async () => {
    const c = cenario();
    const r = await c.selecao_ou_proposta.preparar(carol, { lead: "Maria", tipo: "proposta", imoveis: "Vitta" });
    expect(r).toMatchObject({ tipo: "proposta", dados: { o_que: "proposta", leadId: "m1", token: "tok-prop" } });
    expect((r as { resumo: string }).resumo).toContain("Vitta Alphaville, unidade 32 (R$ 480.000, válida até 04/11)");
    nadaSaiu();
    expect(await c.selecao_ou_proposta.executar(carol, dadosDe(r))).toMatchObject({ ok: true });
    expect(enviados.texto[0].texto).toBe(`Oi, Maria! Preparei a proposta que conversamos. Dá uma olhada com calma e me diz por ali mesmo: ${ENDERECO}/proposta/tok-prop`);

    expect(await c.selecao_ou_proposta.preparar(carol, { lead: "João", tipo: "proposta", imoveis: "Vitta" })).toMatchObject({
      resultado: { erro: expect.stringMatching(/não tem proposta do Vitta Alphaville aberta.*Links do cliente → Proposta/) },
    });
  });
});

describe("meu_link_e_mensagens", () => {
  it("meu link responde direto, sem mandar a ninguém", async () => {
    const { meu_link_e_mensagens, escritas } = cenario();
    const r = await meu_link_e_mensagens.preparar(carol, { imovel: "Vitta" });
    expect(r).toEqual({
      tipo: "resposta",
      resultado: {
        imovel: "Vitta Alphaville",
        link: `${ENDERECO}/empreendimentos/vitta-alphaville?corretor=carol`,
        mensagemPronta: `Olá! Separei este empreendimento pra você: Vitta Alphaville, em Alphaville, Barueri.\n\n${ENDERECO}/empreendimentos/vitta-alphaville?corretor=carol`,
        aviso: expect.stringMatching(/Não mandei a ninguém/),
      },
    });
    expect(await meu_link_e_mensagens.preparar(carol, {})).toMatchObject({ resultado: { portfolio: `${ENDERECO}/?corretor=carol` } });
    nadaSaiu();
    expect(escritas).toEqual([]);
  });

  it("mensagem pronta: o modelo da Carol, preenchido, sai pelo número dela depois do sim", async () => {
    const { meu_link_e_mensagens } = cenario();
    const r = await meu_link_e_mensagens.preparar(carol, { mensagem_pronta: "boas vindas", lead: "João" });
    expect(r).toMatchObject({
      tipo: "proposta",
      resumo: 'Mandar a João Pereira, pelo seu WhatsApp, a mensagem pronta "Boas-vindas": "Olá João, aqui é Carol Lima! Qualquer dúvida, me chama."',
    });
    nadaSaiu();
    expect(await meu_link_e_mensagens.executar(carol, dadosDe(r))).toEqual({ ok: true, texto: 'Mandei a João Pereira, pelo seu WhatsApp, a mensagem pronta "Boas-vindas".' });
    expect(enviados.texto).toEqual([{ instanceName: "carol-num", telefone: "5511955554444", texto: "Olá João, aqui é Carol Lima! Qualquer dúvida, me chama." }]);
  });

  it("texto livre não vira mensagem pronta; campo de lista não sai cru", async () => {
    const { meu_link_e_mensagens } = cenario();
    expect(await meu_link_e_mensagens.preparar(carol, { mensagem_pronta: "oi joão, amanhã te ligo sem falta", lead: "João" })).toMatchObject({
      resultado: { erro: expect.stringMatching(/Não achei a mensagem pronta.*Recado livre/), suasMensagensProntas: ["Lançamento", "Boas-vindas"] },
    });
    expect(await meu_link_e_mensagens.preparar(carol, { mensagem_pronta: "lançamento", lead: "João" })).toMatchObject({
      resultado: { erro: expect.stringMatching(/\{imovel\}, \{bairro\}/) },
    });
    nadaSaiu();
  });

  it("'manda meu link do Vitta pro João' é a apresentação, com as mesmas travas", async () => {
    const { meu_link_e_mensagens } = cenario();
    const r = await meu_link_e_mensagens.preparar(carol, { imovel: "Vitta", lead: "João" });
    expect(r).toMatchObject({ tipo: "proposta", dados: { o_que: "material", leadId: "j1" } });
    expect(await meu_link_e_mensagens.executar(carol, dadosDe(r))).toMatchObject({ ok: true });
    expect(enviados.texto[0].texto).toContain("?corretor=carol");
    expect(await meu_link_e_mensagens.preparar(gestor, { imovel: "Vitta", lead: "Ana Souza" })).toMatchObject({
      resultado: { erro: expect.stringMatching(/cliente de outro corretor/) },
    });
  });
});
