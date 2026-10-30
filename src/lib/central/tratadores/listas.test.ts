import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { bancoFalso, type Linha } from "../bancoFalso";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));

/*
 * Nada do central pode mandar mensagem: o envio é do disparador. Se alguma
 * peça da lista chamar o provedor para enviar, o teste estoura.
 */
const envios = vi.hoisted(() => ({ total: 0 }));
vi.mock("@/lib/whatsapp/provider", async () => {
  const real = await vi.importActual<typeof import("@/lib/whatsapp/provider")>("@/lib/whatsapp/provider");
  const proibido = async () => {
    envios.total++;
    throw new Error("o central não envia: a lista vai para a fila");
  };
  return { ...real, enviarMensagemWhatsapp: proibido, enviarMidiaWhatsapp: proibido, enviarMensagemWhatsappParaGrupo: proibido };
});

const { criarTratadoresDeListas, lerPedido, escolherLista, MENSAGEM_PADRAO_DA_LISTA } = await import("./listas");
const { criarExecutor, executarProposta } = await import("../executar");
const { MOTIVO_DESCONECTADO, quantosSaemHoje } = await import("@/lib/whatsapp/listaPeloCentral");
const { leadsDoCorretor, idsProtegidosDeNovaLista } = await import("@/lib/whatsapp/publicoDaLista");
const { elegivel } = await import("@/lib/crm/publicoDaCampanha");
const { nuncaFalouComOCorretor } = await import("@/lib/whatsapp/primeiroContatoNoEnvio");
const { vagasDePrimeiroContato, diasDesde, inicioDoPrimeiroContato } = await import("@/lib/whatsapp/primeiroContato");
const { PARAMETROS_PADRAO } = await import("@/lib/credito/parametrosPadrao");

const G = "g1";
// Sexta, 12h em São Paulo: dentro da janela e do expediente.
const AGORA = new Date("2026-10-30T15:00:00.000Z");
const HA_30_DIAS = "2026-09-30T12:00:00.000Z";

const corretor = { corretorId: "c1", grupoId: G, papel: "corretor" as const, nome: "Carol", imobiliaria: "Next Home" };
const gestor = { ...corretor, corretorId: "gestor", papel: "gestor" as const, nome: "Gil" };

function lead(l: Linha): Linha {
  return {
    grupo_id: G,
    corretor_id: "c1",
    email: null,
    mensagem: null,
    tipo: "comprador",
    detalhes: null,
    origem: "painel/manual",
    portal_origem: null,
    anuncio_origem: null,
    created_at: "2026-10-01T12:00:00.000Z",
    etapa: "primeiro_contato",
    etapa_alterada_em: "2026-10-20T12:00:00.000Z",
    origem_atribuicao: null,
    visita_agendada_em: null,
    tentativas_sem_resposta: 0,
    nao_contatar_em: null,
    arquivado_em: null,
    corretor: null,
    empreendimento: null,
    regiao_interesse: "Barueri",
    dormitorios_min: null,
    orcamento_max: null,
    orcamento_min: null,
    renda_mensal: null,
    empreendimento_id: null,
    imovel_interesse_id: null,
    ...l,
  };
}

const tel = (n: string) => ({ telefone: `(11) 9${n}`, telefone_e164: `55119${n.replace(/\D/g, "")}` });

function instancia(i: Linha): Linha {
  return {
    grupo_id: G,
    status_conexao: "conectado",
    telefone_conectado: "5511900000000",
    conectado_em: HA_30_DIAS,
    aquecimento_desde: null,
    bloqueado_ate: null,
    envios_campanha_contador: 5,
    envios_campanha_data: "2026-10-30",
    expediente_inicio: 9,
    expediente_fim: 21,
    ...i,
  };
}

/**
 * A carteira da Carol (c1), pensada para cada régua morder:
 * - l1 e l8 são o MESMO telefone (cadastro duplicado): a lista conta uma pessoa;
 * - l3 nunca escreveu, mas o cadastro arquivado do mesmo telefone (l3b) sim:
 *   para o primeiro contato ela já conversou (o disparador olha os irmãos);
 * - l4 orçamento alto, l5 Osasco, l9 sem orçamento: fora de "Barueri até 600 mil";
 * - l6 pediu para sair, l10 já comprou, l7 está pendente em outra lista;
 * - o lead da colega (c2) e o do grupo 2 nunca entram.
 */
function cenario(mudar: (t: Record<string, Linha[]>) => void = () => {}) {
  const tabelas: Record<string, Linha[]> = {
    corretores: [
      { id: "c1", nome: "Carol Dias", slug: "carol", grupo_id: G },
      { id: "c2", nome: "Ana Lima", slug: "ana", grupo_id: G },
      { id: "gestor", nome: "Gil Ramos", slug: "gil", grupo_id: G },
    ],
    corretor_whatsapp_instancias: [
      instancia({ id: "i1", corretor_id: "c1", instance_name: "inst-carol" }),
      instancia({ id: "i2", corretor_id: "c2", instance_name: "inst-ana" }),
      instancia({ id: "i3", corretor_id: "gestor", instance_name: "inst-gil", status_conexao: "desconectado" }),
    ],
    leads: [
      lead({ id: "l1", nome: "Ana Souza", ...tel("1111-1111"), orcamento_max: "500000", created_at: "2026-10-10T12:00:00.000Z" }),
      lead({ id: "l2", nome: "Bruno Lima", ...tel("2222-2222"), orcamento_max: "550000" }),
      lead({ id: "l3", nome: "Carla Reis", ...tel("3333-3333"), orcamento_max: "600000" }),
      lead({ id: "l3b", nome: "Carla R.", ...tel("3333-3333"), orcamento_max: "600000", arquivado_em: "2026-10-02T12:00:00.000Z" }),
      lead({ id: "l4", nome: "Davi Melo", ...tel("4444-4444"), orcamento_max: "900000" }),
      lead({ id: "l5", nome: "Eva Ramos", ...tel("5555-5555"), orcamento_max: "400000", regiao_interesse: "Osasco" }),
      lead({ id: "l6", nome: "Fabio Neto", ...tel("6666-6666"), orcamento_max: "450000", nao_contatar_em: "2026-10-20T12:00:00.000Z" }),
      lead({ id: "l7", nome: "Gil Pires", ...tel("7777-7777"), orcamento_max: "500000" }),
      lead({ id: "l8", nome: "Ana S.", ...tel("1111-1111"), orcamento_max: "500000", created_at: "2026-09-01T12:00:00.000Z" }),
      lead({ id: "l9", nome: "Iara Cruz", ...tel("9999-9999") }),
      lead({ id: "l10", nome: "Joel Dias", ...tel("1010-1010"), orcamento_max: "500000", etapa: "fechado" }),
      lead({ id: "l11", nome: "Julia Prado", ...tel("1212-1212"), orcamento_max: "480000" }),
      lead({ id: "x1", nome: "Colega Cliente", ...tel("8080-8080"), orcamento_max: "500000", corretor_id: "c2" }),
      lead({ id: "g1", nome: "Gestor Cliente", ...tel("8181-8181"), orcamento_max: "500000", corretor_id: "gestor" }),
      lead({ id: "z1", nome: "Outro Grupo", ...tel("8282-8282"), orcamento_max: "500000", grupo_id: "g2", corretor_id: "c9" }),
    ],
    lead_observacoes_ia: [],
    whatsapp_conversas: [
      { id: "cv1", grupo_id: G, corretor_id: "c1", lead_id: "l1", ultima_interacao_em: "2026-10-28T12:00:00.000Z" },
      { id: "cv2", grupo_id: G, corretor_id: "c1", lead_id: "l2", ultima_interacao_em: "2026-10-01T12:00:00.000Z" },
      { id: "cv3b", grupo_id: G, corretor_id: "c1", lead_id: "l3b", ultima_interacao_em: "2026-10-05T12:00:00.000Z" },
    ],
    whatsapp_mensagens: [
      { id: "m1", grupo_id: G, conversa_id: "cv1", remetente: "cliente" },
      { id: "m2", grupo_id: G, conversa_id: "cv2", remetente: "bot" },
      { id: "m3", grupo_id: G, conversa_id: "cv3b", remetente: "cliente" },
    ],
    empreendimentos: [
      {
        id: "vitra",
        grupo_id: G,
        nome: "Vitra Residencial",
        slug: "vitra-residencial",
        nomes_alternativos: ["Vitta"],
        cidade: "Barueri",
        bairro: "Alphaville",
        endereco: null,
        construtora: null,
        preco_a_partir: "450000",
        status: "lancamento",
        publicado: true,
        entrega_prevista: null,
        tipologias: [
          { id: "t1", nome: "2 dorms", dormitorios: 2, suites: 0, vagas: 1, area_privativa: null, preco: null, unidades_disponiveis: null, planta_url: null, ordem: 0 },
          { id: "t2", nome: "3 dorms", dormitorios: 3, suites: 1, vagas: 2, area_privativa: null, preco: null, unidades_disponiveis: null, planta_url: null, ordem: 1 },
        ],
      },
    ],
    whatsapp_campanhas: [
      { id: "outra", grupo_id: G, corretor_id: "c1", titulo: "Dom Parque · quem esfriou", status: "em_andamento", created_at: "2026-10-25T12:00:00.000Z", total_leads: 1, pausa_automatica: null, empreendimento: { nome: "Dom Parque" } },
      { id: "da-colega", grupo_id: G, corretor_id: "c2", titulo: "Reserva · todos", status: "em_andamento", created_at: "2026-10-26T12:00:00.000Z", total_leads: 1, pausa_automatica: null, empreendimento: { nome: "Reserva" } },
    ],
    whatsapp_campanhas_fila: [
      // A chave com ponto imita o filtro pelo embed (`campanha.corretor_id`) de `idsProtegidosDeNovaLista`.
      { id: "f-outra", grupo_id: G, campanha_id: "outra", "campanha.corretor_id": "c1", lead_id: "l7", telefone: "5511977777777", status: "pendente", agendado_para: "2026-10-30T18:00:00.000Z", enviado_em: null, erro_motivo: null, tentativas_texto: 0 },
      { id: "f-colega", grupo_id: G, campanha_id: "da-colega", "campanha.corretor_id": "c2", lead_id: "x1", telefone: "5511980808080", status: "pendente", agendado_para: "2026-10-30T18:00:00.000Z", enviado_em: null, erro_motivo: null, tentativas_texto: 0 },
    ],
  };
  mudar(tabelas);
  const b = bancoFalso(tabelas);
  // Os primeiros contatos que o corretor já fez (0222): 9 hoje e 12 na semana.
  const primeiros = { hoje: 9, semana: 12 };
  const rpc = vi.fn(async (nome: string, a: { p_desde?: string; p_ids?: string[] }) => {
    // A 0156: das conversas pedidas, as que têm fala do cliente.
    if (nome === "conversas_com_fala_do_cliente") {
      const comFala = new Set(tabelas.whatsapp_mensagens.filter((m) => m.remetente === "cliente").map((m) => m.conversa_id));
      return { data: (a.p_ids ?? []).filter((id) => comFala.has(id)), error: null };
    }
    return { data: Date.parse(a.p_desde ?? "") > AGORA.getTime() - 2 * 86_400_000 ? primeiros.hoje : primeiros.semana, error: null };
  });
  const cliente = comContagemERpc(b.cliente, rpc);
  const externos = {
    limiteDoDia: vi.fn(async () => ({ limite: 30, motivo: "uso" as const, maiorDiaRecente: 20 })),
    conferirNumeros: vi.fn<(p: { instanceName: string; telefones: string[] }) => Promise<Map<string, boolean>>>(async () => new Map()),
    provedorConfigurado: () => true,
    limiteDoPlano: vi.fn(async () => ({ ok: true as const })),
    regiaoDaCasa: async () => "Barueri",
    acender: vi.fn(),
  };
  const tratadores = criarTratadoresDeListas({
    banco: () => cliente,
    externos,
    parametros: async () => PARAMETROS_PADRAO,
    link: async (_g, slug) => `https://site/imoveis/${slug}`,
    relogio: () => AGORA,
  });
  return { ...b, cliente, tratadores, externos, primeiros, montar: tratadores.acoes.montar_lista, acompanhar: tratadores.acoes.acompanhar_lista };
}

/**
 * O banco falso não conta (`count: "exact"`) nem tem `rpc`: o primeiro contato
 * do disparador usa os dois. Aqui a contagem é o tamanho do resultado. E o
 * `grupo_id` que o gatilho do banco põe na lista e na fila (0191, pelo
 * corretor) é posto aqui.
 */
function comContagemERpc(cliente: unknown, rpc: unknown) {
  type Q = Record<string, (...a: unknown[]) => unknown>;
  const original = cliente as { from: (t: string) => Q };
  return {
    rpc,
    from: (tabela: string) => {
      const q = original.from(tabela);
      const select = q.select;
      const then = q.then;
      const inserir = q.insert;
      const doGrupo = (l: Linha) => ({ grupo_id: G, ...l });
      q.insert = (v: unknown) => inserir(Array.isArray(v) ? v.map(doGrupo) : doGrupo(v as Linha));
      let contar = false;
      q.select = (colunas: unknown, opcoes?: unknown) => {
        if ((opcoes as { count?: string } | undefined)?.count) contar = true;
        select(colunas, opcoes);
        return q;
      };
      q.then = (ok: unknown, erro?: unknown) =>
        then((r: { data: unknown }) => (ok as (x: unknown) => unknown)(contar ? { ...r, count: Array.isArray(r.data) ? r.data.length : 0 } : r), erro);
      return q;
    },
  } as never;
}

type Proposta = { tipo: "proposta"; resumo: string; dados: Record<string, unknown> };
const comoProposta = (p: unknown) => {
  expect((p as { tipo: string }).tipo, JSON.stringify(p)).toBe("proposta");
  return p as Proposta;
};
const comoResposta = (p: unknown) => {
  expect((p as { tipo: string }).tipo, JSON.stringify(p)).toBe("resposta");
  return (p as { resultado: Record<string, unknown> }).resultado;
};

const PEDIDO = { regiao: "Barueri", orcamento_max: 600_000, imovel: "Vitta", para_quem: "quem quer Barueri até 600 mil" };

describe("lerPedido: os campos da ferramenta, conferidos", () => {
  it("cada filtro no seu campo; valor estranho vira 'sem esse filtro'", () => {
    expect(lerPedido({ regiao: "Barueri", orcamento_max: 600_000, dormitorios: 2 })).toEqual({
      regiao: "Barueri",
      orcamentoMax: 600_000,
      dormitorios: 2,
      etapas: [],
      respondeu: null,
      paradoHaDias: null,
      paraQuem: null,
    });
    expect(lerPedido({ orcamento_max: "1,2 milhão" }).orcamentoMax).toBe(1_200_000);
    expect(lerPedido({ orcamento_max: "600 mil" }).orcamentoMax).toBe(600_000);
    // Em imóvel, "600" é 600 mil.
    expect(lerPedido({ orcamento_max: 600 }).orcamentoMax).toBe(600_000);
    expect(lerPedido({ etapas: ["em_conversa", "qualificado", "inventada"] }).etapas).toEqual(["em_conversa", "qualificado"]);
    expect(lerPedido({ etapas: "em conversa" }).etapas).toEqual(["em_conversa"]);
    expect(lerPedido({ respondeu: "não" }).respondeu).toBe("nao");
    expect(lerPedido({ respondeu: "talvez" }).respondeu).toBeNull();
    expect(lerPedido({ parado_ha_dias: "15" }).paradoHaDias).toBe(15);
    expect(lerPedido({ dormitorios: 40, parado_ha_dias: 0 })).toMatchObject({ dormitorios: null, paradoHaDias: null });
  });
  it("o para_quem só vai para o resumo: palavra desconhecida não vira mais lugar", () => {
    expect(lerPedido({ para_quem: "quem gosta de piscina" })).toMatchObject({ regiao: null, paraQuem: "quem gosta de piscina" });
  });
});

describe("montar_lista: a proposta", () => {
  it("as contas batem com a régua da tela e do disparador", async () => {
    const c = cenario();
    const p = comoProposta(await c.montar.preparar(corretor, PEDIDO));

    // Público da tela: carteira dele, elegível, sem os protegidos, um por telefone.
    const protegidos = await idsProtegidosDeNovaLista(c.cliente, "c1");
    const daTela = (await leadsDoCorretor(c.cliente, "c1")).filter((l) => elegivel(l, "todos") && !protegidos.has(l.id));
    expect(daTela.map((l) => l.id).sort()).toEqual(["l1", "l11", "l2", "l3", "l4", "l5", "l8", "l9"]);
    // Recorte do pedido (Barueri, até 600 mil, combina com o Vitra) e l8 = l1 pelo telefone.
    expect([...(p.dados._leadIds as string[])].sort()).toEqual(["l1", "l11", "l2", "l3"]);
    expect(p.dados.pessoas).toBe(4);

    // Nunca falou: a pergunta do disparador, pessoa a pessoa, com os cadastros do mesmo telefone.
    const irmaos: Record<string, string[]> = { l1: ["l8"], l2: [], l3: ["l3b"], l11: [] };
    const nunca: string[] = [];
    for (const [id, outros] of Object.entries(irmaos)) if (await nuncaFalouComOCorretor(c.cliente, [id, ...outros])) nunca.push(id);
    expect(nunca.sort()).toEqual(["l11", "l2"]);
    expect(p.dados.nuncaFalaram).toBe(2);

    // Cabem hoje no primeiro contato: as vagas do disparador (9 hoje e 12 na semana → 1).
    const vagas = vagasDePrimeiroContato({ diasDesdeInicio: diasDesde(inicioDoPrimeiroContato(new Date(HA_30_DIAS), null), AGORA), enviadosHoje: 9, enviadosNaSemana: 12 });
    expect(vagas).toBe(1);
    expect(p.resumo).toContain("hoje cabem 1 de 2");
    // Saem hoje: as 2 que já conversaram + 1 primeiro contato (cota 30 − 5 enviadas − 1 na fila).
    expect(p.dados.saemHoje).toBe(quantosSaemHoje({ pessoas: 4, nuncaFalaram: 2, vagasDePrimeiroContato: 1, saldoDaCota: 25, naFilaHoje: 1, expediente: { inicioHora: 9, fimHora: 21 }, agora: AGORA }));
    expect(p.dados.saemHoje).toBe(3);

    expect(p.resumo).toContain("4 pessoas; 2 nunca falaram com você");
    expect(p.resumo).toContain("pelo SEU WhatsApp");
    // O texto padrão da tela, com as variáveis do imóvel.
    expect(p.resumo).toContain("condição nova no Vitra Residencial, em Alphaville");
    expect(p.dados.mensagemBase).toBe(MENSAGEM_PADRAO_DA_LISTA);
    expect(p.dados.titulo).toBe("Vitra Residencial · Barueri, até R$ 600.000");
    // Proposta não grava nada.
    expect(c.escritas).toEqual([]);
  });

  it("o texto ditado vai como a pessoa disse", async () => {
    const c = cenario();
    const p = comoProposta(await c.montar.preparar(corretor, { ...PEDIDO, texto: "Oi {nome}! Saiu a tabela do {imovel}. Posso te mandar?" }));
    expect(p.dados.mensagemBase).toBe("Oi {nome}! Saiu a tabela do {imovel}. Posso te mandar?");
    expect(p.resumo).toContain('Texto: "Oi {nome}! Saiu a tabela do Vitra Residencial. Posso te mandar?"');
  });

  it("sem imóvel e sem texto, pergunta o texto; variável sem valor não vira proposta", async () => {
    const c = cenario();
    expect(comoResposta(await c.montar.preparar(corretor, { regiao: "Barueri" }))).toHaveProperty("pergunta");
    expect(comoResposta(await c.montar.preparar(corretor, { regiao: "Barueri", texto: "Saiu no {bairro}!" }))).toHaveProperty("erro");
  });

  it("WhatsApp desconectado: resposta clara, sem proposta", async () => {
    const c = cenario((t) => (t.corretor_whatsapp_instancias[0].status_conexao = "desconectado"));
    expect(comoResposta(await c.montar.preparar(corretor, PEDIDO))).toEqual({ erro: MOTIVO_DESCONECTADO });
  });

  it("o gestor não dispara pelo número de outro corretor nem para a carteira dele", async () => {
    // O número do gestor está desconectado; o da Carol, conectado: não serve.
    const c = cenario();
    expect(comoResposta(await c.montar.preparar(gestor, PEDIDO))).toEqual({ erro: MOTIVO_DESCONECTADO });

    // Conectado, a lista é dos clientes DELE, pelo número DELE.
    const d = cenario((t) => (t.corretor_whatsapp_instancias[2].status_conexao = "conectado"));
    const p = comoProposta(await d.montar.preparar(gestor, PEDIDO));
    expect(p.dados._leadIds).toEqual(["g1"]);
    const r = await d.montar.executar(gestor, p.dados);
    expect(r.ok).toBe(true);
    expect(d.tabelas.whatsapp_campanhas.at(-1)).toMatchObject({ corretor_id: "gestor" });
    expect(d.externos.conferirNumeros).toHaveBeenCalledWith({ instanceName: "inst-gil", telefones: ["(11) 98181-8181"] });
  });

  it("ninguém no filtro: diz os filtros e qual zerou, sem proposta", async () => {
    const c = cenario();
    const r = comoResposta(await c.montar.preparar(corretor, { regiao: "Santana", imovel: "Vitta" }));
    expect(String(r.nenhum)).toContain("querem Santana · combinam com o Vitra Residencial");
    expect(r.porque).toBe("carteira elegível: 8; querem Santana: 0; destes, combinam com o Vitra Residencial: 0; destes, fora por já estarem em outra lista ou terem recebido lista nos últimos 7 dias: 0");
    expect(r.zerouEm).toBe("querem Santana");
    expect(String(r.dica)).toContain('"querem Santana"');
  });

  it("imóvel ambíguo ou fora do catálogo vira pergunta", async () => {
    const c = cenario();
    expect(comoResposta(await c.montar.preparar(corretor, { imovel: "Aurora" }))).toHaveProperty("erro");
  });
});

/**
 * Os filtros da conversa da Bruna (30/10/2026): etapa, já respondeu / nunca
 * respondeu e parado há N dias, por cima das travas de hoje. A carteira:
 * - l1 em conversa, respondeu (cv1), última mensagem há 2 dias;
 * - l2 em conversa, só o robô falou (cv2), última mensagem há 29 dias;
 * - l3 qualificado: quem respondeu foi o cadastro arquivado do mesmo telefone (cv3b, há 25 dias);
 * - l4 em conversa, sem conversa, nossa última tentativa há 29 dias, 3 mensagens sem resposta (teto);
 * - l5 em conversa: respondeu, mas na conversa com a COLEGA (c2), não com a Carol;
 * - l7 em conversa e respondeu (cv7), mas está pendente em outra lista (protegido);
 * - l6 (pediu para sair) e l10 (fechado) responderam e continuam fora;
 * - l9 e l11 nunca tiveram contato.
 */
function cenarioDaConversa(mudar: (t: Record<string, Linha[]>) => void = () => {}) {
  return cenario((t) => {
    const l = (id: string) => t.leads.find((x) => x.id === id)!;
    Object.assign(l("l1"), { etapa: "em_conversa" });
    Object.assign(l("l2"), { etapa: "em_conversa" });
    Object.assign(l("l3"), { etapa: "qualificado" });
    Object.assign(l("l4"), { etapa: "em_conversa", ultima_tentativa_em: "2026-10-01T12:00:00.000Z", tentativas_sem_resposta: 3 });
    Object.assign(l("l5"), { etapa: "em_conversa" });
    Object.assign(l("l6"), { etapa: "em_conversa" });
    Object.assign(l("l7"), { etapa: "em_conversa" });
    t.whatsapp_conversas.push(
      { id: "cv5", grupo_id: G, corretor_id: "c2", lead_id: "l5", ultima_interacao_em: "2026-10-01T12:00:00.000Z" },
      { id: "cv6", grupo_id: G, corretor_id: "c1", lead_id: "l6", ultima_interacao_em: "2026-10-01T12:00:00.000Z" },
      { id: "cv7", grupo_id: G, corretor_id: "c1", lead_id: "l7", ultima_interacao_em: "2026-10-01T12:00:00.000Z" },
      { id: "cv10", grupo_id: G, corretor_id: "c1", lead_id: "l10", ultima_interacao_em: "2026-10-01T12:00:00.000Z" },
    );
    t.whatsapp_mensagens.push(
      { id: "m5", grupo_id: G, conversa_id: "cv5", remetente: "cliente" },
      { id: "m6", grupo_id: G, conversa_id: "cv6", remetente: "cliente" },
      { id: "m7", grupo_id: G, conversa_id: "cv7", remetente: "cliente" },
      { id: "m10", grupo_id: G, conversa_id: "cv10", remetente: "cliente" },
    );
    mudar(t);
  });
}

const TEXTO = { texto: "Oi! Saiu novidade por aqui, posso te contar?" };
const quem = (p: Proposta) => [...(p.dados._leadIds as string[])].sort();
type Rpc = (nome: string, a: unknown) => Promise<{ data: unknown; error: unknown }>;
const rpcDe = (c: { cliente: unknown }) => (c.cliente as { rpc: ReturnType<typeof vi.fn<Rpc>> }).rpc;

describe("montar_lista: os filtros estruturados", () => {
  it("etapas: só quem está nas etapas pedidas", async () => {
    const c = cenarioDaConversa();
    const p = comoProposta(await c.montar.preparar(corretor, { ...TEXTO, etapas: ["em_conversa"] }));
    // l7 também está em conversa, mas protegida: fica de fora e o resumo conta.
    expect(quem(p)).toEqual(["l1", "l2", "l4", "l5"]);
    expect(p.resumo).toContain("Filtros: Em conversa.");
    expect(p.resumo).toContain("1 pessoa ficou de fora por já estarem em outra lista");
    expect(p.dados.titulo).toBe("Lista · Em conversa");
  });

  it("respondeu 'sim': fala do cliente na conversa com ESTE corretor, contando o outro cadastro do telefone", async () => {
    const c = cenarioDaConversa();
    const p = comoProposta(await c.montar.preparar(corretor, { ...TEXTO, respondeu: "sim" }));
    // l3 pelo cadastro arquivado (l3b); l5 só falou com a colega; l6, l7 e l10 continuam fora.
    expect(quem(p)).toEqual(["l1", "l3"]);
    expect(p.resumo).toContain("Filtros: já responderam.");
    expect(p.dados.nuncaFalaram).toBe(0);
    // Uma pergunta para todas as conversas (0156), não uma por pessoa.
    const chamadas = rpcDe(c).mock.calls.filter(([nome]) => nome === "conversas_com_fala_do_cliente");
    expect(chamadas).toHaveLength(1);
    expect((chamadas[0][1] as { p_ids: string[] }).p_ids).toEqual(expect.arrayContaining(["cv1", "cv2", "cv3b"]));
  });

  it("respondeu 'nao': nunca respondeu, com o teto de insistência da tela", async () => {
    const c = cenarioDaConversa();
    const p = comoProposta(await c.montar.preparar(corretor, { ...TEXTO, respondeu: "nao" }));
    // l4 nunca respondeu, mas já levou 3 mensagens seguidas sem resposta: fora.
    expect(quem(p)).toEqual(["l11", "l2", "l5", "l9"]);
    expect(p.resumo).toContain("Filtros: nunca responderam.");
    // O primeiro contato continua com a régua do disparador.
    expect(p.resumo).toContain("hoje cabem 1 de");
  });

  it("parado há N dias: o último contato (mensagem de qualquer lado ou nossa tentativa) há N dias ou mais", async () => {
    const c = cenarioDaConversa();
    const p = comoProposta(await c.montar.preparar(corretor, { ...TEXTO, parado_ha_dias: 15 }));
    // l1 falou há 2 dias; l9 e l11 nunca tiveram contato (são novos, não parados); l5 só com a colega.
    expect(quem(p)).toEqual(["l2", "l3", "l4"]);
    expect(p.resumo).toContain("Filtros: parados há 15+ dias.");
    const q = comoProposta(await c.montar.preparar(corretor, { ...TEXTO, parado_ha_dias: 27 }));
    expect(quem(q)).toEqual(["l2", "l4"]);
  });

  it("combinação: os filtros se somam, e o resumo lista todos em português", async () => {
    const c = cenarioDaConversa();
    const p = comoProposta(
      await c.montar.preparar(corretor, {
        ...TEXTO,
        etapas: ["em_conversa", "qualificado"],
        respondeu: "sim",
        parado_ha_dias: 15,
        para_quem: "quem ficou em conversa e parou de responder",
      }),
    );
    expect(quem(p)).toEqual(["l3"]);
    expect(p.resumo).toContain("Filtros: Em conversa ou Qualificado · já responderam · parados há 15+ dias.");
    expect(p.resumo).toContain('Pedido: "quem ficou em conversa e parou de responder".');
    expect(p.dados.filtros).toEqual(["Em conversa ou Qualificado", "já responderam", "parados há 15+ dias"]);
  });

  it("para_quem não filtra: sem filtro vai a carteira elegível inteira, e o resumo diz isso", async () => {
    const c = cenarioDaConversa();
    const p = comoProposta(await c.montar.preparar(corretor, { ...TEXTO, para_quem: "quem gosta de piscina" }));
    expect(quem(p)).toEqual(["l1", "l11", "l2", "l3", "l4", "l5", "l9"]);
    expect(p.resumo).toContain("Sem filtro: toda a sua carteira elegível: 7 pessoas.");
    expect(p.resumo).toContain('Pedido: "quem gosta de piscina".');
  });

  it("zero: diz por quê, com os números de cada filtro e a trava que zerou", async () => {
    const c = cenarioDaConversa((t) => (t.leads.find((x) => x.id === "l1")!.etapa = "qualificado"));
    const r = comoResposta(await c.montar.preparar(corretor, { ...TEXTO, etapas: ["em_conversa"], respondeu: "sim" }));
    expect(r.nenhum).toBe('Ninguém da sua carteira entra em "Em conversa · já responderam" agora.');
    expect(r.porque).toBe(
      "carteira elegível: 8; Em conversa: 4; destes, já responderam: 1; destes, fora por já estarem em outra lista ou terem recebido lista nos últimos 7 dias: 1",
    );
    expect(r.zerouEm).toBe("por já estarem em outra lista ou terem recebido lista nos últimos 7 dias");
    expect(String(r.dica)).toContain("não se afrouxa");
    expect(c.escritas).toEqual([]);
  });

  it("zero por filtro: aponta o filtro, e fechado/perdido explicam que não entram", async () => {
    const c = cenarioDaConversa();
    const r = comoResposta(await c.montar.preparar(corretor, { ...TEXTO, etapas: ["perdido"] }));
    expect(r.porque).toBe("carteira elegível: 8; Perdido: 0; destes, fora por já estarem em outra lista ou terem recebido lista nos últimos 7 dias: 0");
    expect(r.zerouEm).toBe("Perdido");
    expect(String(r.etapas)).toContain("nunca entram em lista");
  });

  it("as travas de hoje continuam: quem pediu para sair, fechado, protegido e a carteira da colega nunca entram", async () => {
    const c = cenarioDaConversa();
    const p = comoProposta(await c.montar.preparar(corretor, { ...TEXTO, etapas: ["em_conversa", "fechado"], respondeu: "sim" }));
    // l6 (pediu para sair), l10 (fechado), l7 (outra lista) e x1 (da colega) ficam fora.
    expect(quem(p)).toEqual(["l1"]);
    // E o "sim" refaz a régua da tela: quem pediu para sair desde a proposta não entra.
    c.tabelas.leads.find((x) => x.id === "l1")!.nao_contatar_em = "2026-10-30T14:00:00.000Z";
    const r = await c.montar.executar(corretor, p.dados);
    expect(r.ok).toBe(false);
    expect(c.tabelas.whatsapp_campanhas).toHaveLength(2);
    expect(envios.total).toBe(0);
  });

  it("compradores: só 'fechado' com o imóvel, como a tela", async () => {
    const c = cenarioDaConversa(
      (t) => (t.leads.find((x) => x.id === "l10")!.empreendimento = { nome: "Vitra Residencial", slug: "vitra-residencial", endereco: null }),
    );
    const p = comoProposta(await c.montar.preparar(corretor, { imovel: "Vitta", etapas: ["fechado"] }));
    expect(quem(p)).toEqual(["l10"]);
    expect(p.dados.filtro).toBe("compradores");
    expect(p.resumo).toContain("Filtros: quem comprou no Vitra Residencial.");
  });

  it("conversa ilegível: não recorta no escuro, responde que não conseguiu", async () => {
    const c = cenarioDaConversa();
    const original = rpcDe(c).getMockImplementation()!;
    rpcDe(c).mockImplementation(async (nome: string, a: unknown) =>
      nome === "conversas_com_fala_do_cliente" ? { data: null, error: { message: "fora do ar" } } : original(nome, a),
    );
    expect(comoResposta(await c.montar.preparar(corretor, { ...TEXTO, respondeu: "sim" }))).toHaveProperty("erro");
  });
});

describe("montar_lista: o 'sim' só enfileira", () => {
  it("cria a lista e a fila pelo domínio da tela, do número de quem pediu, sem enviar", async () => {
    const c = cenario();
    const p = comoProposta(await c.montar.preparar(corretor, PEDIDO));
    const r = await c.montar.executar(corretor, p.dados);
    expect(r.ok, r.texto).toBe(true);

    const lista = c.tabelas.whatsapp_campanhas.at(-1)!;
    expect(lista).toMatchObject({ corretor_id: "c1", status: "em_andamento", ignorar_janela: false, viva: false, midias: [], empreendimento_id: "vitra" });
    expect(lista.criterio).toEqual({ filtro: "selecionados", imovelSlug: null, recorte: null });
    const fila = c.tabelas.whatsapp_campanhas_fila.filter((f) => f.campanha_id === lista.id);
    expect(fila.map((f) => f.lead_id).sort()).toEqual(["l1", "l11", "l2", "l3"]);
    expect(fila.every((f) => f.status === "pendente")).toBe(true);
    // Fila espaçada, nunca no passado (`montarFilaCampanha`).
    expect(fila.every((f) => Date.parse(String(f.agendado_para)) >= Date.now() - 1000)).toBe(true);

    // Pelo número da Carol, com os números conferidos antes e o limite do plano.
    expect(c.externos.conferirNumeros).toHaveBeenCalledWith(expect.objectContaining({ instanceName: "inst-carol" }));
    expect(c.externos.limiteDoPlano).toHaveBeenLastCalledWith(G, 4);
    expect(c.externos.acender).toHaveBeenCalledTimes(1);
    // Nada foi enviado nem gravado como conversa.
    expect(envios.total).toBe(0);
    expect(c.escritas.some((e) => e.tabela === "whatsapp_mensagens" || e.tabela === "whatsapp_conversas")).toBe(false);
    expect(r.desfazer).toEqual({ campanhaId: lista.id, titulo: p.dados.titulo });
  });

  it("número sem WhatsApp e quem saiu desde a proposta ficam de fora", async () => {
    const c = cenario();
    const p = comoProposta(await c.montar.preparar(corretor, PEDIDO));
    c.externos.conferirNumeros.mockResolvedValueOnce(new Map([["(11) 92222-2222", false]]));
    c.tabelas.leads.find((l) => l.id === "l11")!.nao_contatar_em = "2026-10-30T14:00:00.000Z";
    const r = await c.montar.executar(corretor, p.dados);
    expect(r.texto).toContain("2 pessoas");
    expect(r.texto).toContain("1 número não tem WhatsApp");
    expect(r.texto).toContain("1 pessoa saiu desde a proposta");
  });

  it("desconectou entre a proposta e o 'sim': não cria nada", async () => {
    const c = cenario();
    const p = comoProposta(await c.montar.preparar(corretor, PEDIDO));
    c.tabelas.corretor_whatsapp_instancias[0].status_conexao = "desconectado";
    const r = await c.montar.executar(corretor, p.dados);
    expect(r).toEqual({ ok: false, texto: MOTIVO_DESCONECTADO });
    expect(c.tabelas.whatsapp_campanhas).toHaveLength(2);
  });

  it("pelo executor: a onda 3 propõe sem gravar e o 'sim' roda o mesmo executar", async () => {
    const c = cenario();
    const tratadores = { consultas: {}, acoes: c.tratadores.acoes };
    const ex = criarExecutor(corretor, tratadores, 3);
    expect(await ex.executar("montar_lista", PEDIDO)).toMatchObject({ proposto: true });
    expect(c.escritas).toEqual([]);
    const { resultados, desfaziveis } = await executarProposta(corretor, ex.itensPropostos, tratadores);
    expect(resultados[0].ok).toBe(true);
    expect(desfaziveis).toHaveLength(1);
    // Abaixo da onda 3, a lista ainda não existe pelo central.
    expect(await criarExecutor(corretor, tratadores, 2).executar("montar_lista", PEDIDO)).toMatchObject({ aindaNao: true });
  });
});

describe("montar_lista: desfazer", () => {
  async function criada() {
    const c = cenario();
    const p = comoProposta(await c.montar.preparar(corretor, PEDIDO));
    const r = await c.montar.executar(corretor, p.dados);
    const id = (r.desfazer as { campanhaId: string }).campanhaId;
    return { c, r, id, fila: () => c.tabelas.whatsapp_campanhas_fila.filter((f) => f.campanha_id === id) };
  }

  it("antes de sair qualquer mensagem, cancela a lista e tira a fila", async () => {
    const { c, r, id, fila } = await criada();
    const d = await c.montar.desfazer!(corretor, r.desfazer!);
    expect(d.ok).toBe(true);
    expect(d.texto).toContain("cancelada antes de sair qualquer mensagem");
    expect(c.tabelas.whatsapp_campanhas.find((l) => l.id === id)).toMatchObject({ status: "cancelada", viva: false });
    expect(fila()).toEqual([]);
  });

  it("depois que começou a sair, só pausa e diz isso", async () => {
    const { c, r, id, fila } = await criada();
    Object.assign(fila()[0], { status: "enviado", enviado_em: "2026-10-30T15:05:00.000Z" });
    const d = await c.montar.desfazer!(corretor, r.desfazer!);
    expect(d.ok).toBe(true);
    expect(d.texto).toContain("já começou a sair (1 mensagem enviada)");
    expect(d.texto).toContain("Pausei o resto");
    expect(c.tabelas.whatsapp_campanhas.find((l) => l.id === id)).toMatchObject({ status: "pausada" });
    expect(fila().filter((f) => f.status === "pendente")).toHaveLength(3);
  });

  it("envio sem comprovante ('pode ter saído') conta como saída", async () => {
    const { c, r, fila } = await criada();
    const { MOTIVO_ENVIO_INCERTO } = await import("@/lib/whatsapp/listaDeTransmissao");
    Object.assign(fila()[0], { status: "erro", erro_motivo: MOTIVO_ENVIO_INCERTO });
    expect((await c.montar.desfazer!(corretor, r.desfazer!)).texto).toContain("já começou a sair");
  });

  it("de outro corretor (mesmo o gestor) não desfaz", async () => {
    const { c, r, id } = await criada();
    const d = await c.montar.desfazer!(gestor, r.desfazer!);
    expect(d.ok).toBe(false);
    expect(c.tabelas.whatsapp_campanhas.find((l) => l.id === id)).toMatchObject({ status: "em_andamento" });
  });
});

describe("acompanhar_lista", () => {
  function comLista(mudar: (t: Record<string, Linha[]>) => void = () => {}) {
    return cenario((t) => {
      t.whatsapp_campanhas.push({
        id: "vitta",
        grupo_id: G,
        corretor_id: "c1",
        titulo: "Vitra Residencial · quem combina",
        status: "em_andamento",
        created_at: "2026-10-29T12:00:00.000Z",
        total_leads: 6,
        pausa_automatica: null,
        empreendimento_id: "vitra",
        empreendimento: { nome: "Vitra Residencial" },
      });
      const item = (i: Linha): Linha => ({ grupo_id: G, campanha_id: "vitta", "campanha.corretor_id": "c1", erro_motivo: null, tentativas_texto: 0, enviado_em: null, ...i });
      t.whatsapp_campanhas_fila.push(
        item({ id: "v1", lead_id: "l1", telefone: "5511911111111", status: "enviado", agendado_para: "2026-10-29T13:00:00.000Z", enviado_em: "2026-10-29T13:00:00.000Z" }),
        item({ id: "v2", lead_id: "l2", telefone: "5511922222222", status: "respondido", agendado_para: "2026-10-29T13:02:00.000Z", enviado_em: "2026-10-29T13:02:00.000Z" }),
        item({ id: "v3", lead_id: "l3", telefone: "5511933333333", status: "pendente", agendado_para: "2026-10-30T16:00:00.000Z", tentativas_texto: 2, erro_motivo: "texto parecido" }),
        item({ id: "v4", lead_id: "l11", telefone: "5511912121212", status: "pendente", agendado_para: "2026-10-31T12:10:00.000Z", erro_motivo: "Esta pessoa nunca falou com você. Primeiro contato é limitado..." }),
        item({ id: "v5", lead_id: "l4", telefone: "5511944444444", status: "pendente", agendado_para: "2026-11-02T12:00:00.000Z" }),
        item({ id: "v6", lead_id: "l5", telefone: "5511955555555", status: "erro", agendado_para: "2026-10-29T13:04:00.000Z", erro_motivo: "Pediu para não receber mais mensagens." }),
      );
      mudar(t);
    });
  }

  it("ver: só números, nunca nome nem texto de cliente", async () => {
    const c = comLista();
    const r = comoResposta(await c.acompanhar.preparar(corretor, { lista: "Vitta", o_que: "ver" }));
    expect(r).toMatchObject({
      lista: "Vitra Residencial · quem combina",
      situacao: "enviando",
      pessoas: 6,
      enviadas: 2,
      responderam: 1,
      naFilaParaHoje: 1,
      ficaramParaOsProximosDias: 2,
      esperandoVagaDePrimeiroContato: 1,
      naoVaoSair: 1,
    });
    const json = JSON.stringify(r);
    for (const nome of ["Ana", "Bruno", "Carla", "Julia", "5511"]) expect(json).not.toContain(nome);
    expect(c.escritas).toEqual([]);
  });

  it("pausar e retomar pedem 'sim', vão pelo domínio da tela e um desfaz o outro", async () => {
    const c = comLista();
    const p = comoProposta(await c.acompanhar.preparar(corretor, { lista: "Vitta", o_que: "pausar" }));
    expect(p.resumo).toContain('Pausar a lista "Vitra Residencial');
    expect(c.escritas).toEqual([]);
    const lista = () => c.tabelas.whatsapp_campanhas.find((l) => l.id === "vitta")!;

    const r = await c.acompanhar.executar(corretor, p.dados);
    expect(r.ok).toBe(true);
    expect(lista().status).toBe("pausada");

    // Desfazer a pausa = retomar (com a base da pausa automática e o texto conferido de novo).
    expect((await c.acompanhar.desfazer!(corretor, r.desfazer!)).ok).toBe(true);
    expect(lista()).toMatchObject({ status: "em_andamento", pausa_automatica: null, pausa_base: { enviados: 2, semWhatsapp: 0, pediramParaSair: 0 } });
    expect(c.tabelas.whatsapp_campanhas_fila.find((f) => f.id === "v3")).toMatchObject({ tentativas_texto: 0 });
    expect(c.externos.acender).toHaveBeenCalledTimes(1);

    // Retomar com "sim"; desfazer = pausar de novo.
    lista().status = "pausada";
    lista().pausa_automatica = "Muitos números sem WhatsApp.";
    const q = comoProposta(await c.acompanhar.preparar(corretor, { o_que: "retomar" }));
    expect(q.resumo).toContain("Ela parou sozinha: Muitos números sem WhatsApp.");
    const s = await c.acompanhar.executar(corretor, q.dados);
    expect(lista().status).toBe("em_andamento");
    await c.acompanhar.desfazer!(corretor, s.desfazer!);
    expect(lista().status).toBe("pausada");
    expect(envios.total).toBe(0);
  });

  it("pausar o que não está enviando não vira proposta", async () => {
    const c = comLista((t) => (t.whatsapp_campanhas.find((l) => l.id === "vitta")!.status = "concluida"));
    expect(comoResposta(await c.acompanhar.preparar(corretor, { lista: "Vitta", o_que: "pausar" }))).toHaveProperty("mensagem");
  });

  it("lista ambígua vira pergunta numerada", async () => {
    const c = comLista();
    const r = comoResposta(await c.acompanhar.preparar(corretor, { o_que: "pausar" }));
    expect(r.pergunta).toBeTruthy();
    expect(r.opcoes).toHaveLength(2);
  });

  it("corretor só as listas dele; o gestor também não vê a lista da colega", async () => {
    const c = comLista();
    expect(comoResposta(await c.acompanhar.preparar(corretor, { lista: "Reserva", o_que: "ver" }))).toHaveProperty("erro");
    expect(comoResposta(await c.acompanhar.preparar(gestor, { lista: "Vitta", o_que: "pausar" }))).toHaveProperty("erro");
    // E o "sim" com o id de outra pessoa não mexe em nada.
    const r = await c.acompanhar.executar(gestor, { campanhaId: "vitta", titulo: "x", acao: "pausar" });
    expect(r.ok).toBe(false);
    expect(c.tabelas.whatsapp_campanhas.find((l) => l.id === "vitta")!.status).toBe("em_andamento");
  });

  it("escolherLista: pelo nome, e sem nome pelo estado que o pedido alcança", () => {
    const l = (id: string, titulo: string, status: "em_andamento" | "pausada" | "concluida") => ({ id, titulo, imovel: null, imovelId: null, status, criadaEm: "2026-10-29T12:00:00.000Z", totalLeads: 1, pausaAutomatica: null });
    const listas = [l("a", "Vitta · todos", "em_andamento"), l("b", "Reserva · novos", "pausada"), l("c", "Vitta · antiga", "concluida")];
    expect(escolherLista(listas, "lista do Vitta", "ver")).toMatchObject({ tipo: "uma", lista: { id: "a" } });
    expect(escolherLista(listas, null, "retomar")).toMatchObject({ tipo: "uma", lista: { id: "b" } });
    expect(escolherLista(listas, null, "ver")).toMatchObject({ tipo: "varias" });
    expect(escolherLista(listas, "Dom Parque", "ver")).toEqual({ tipo: "nenhuma" });
  });
});

describe("o texto padrão é o da tela", () => {
  it("igual ao MENSAGEM_PADRAO de NovaCampanha.tsx", () => {
    const tela = readFileSync("src/app/corretor/(painel)/campanhas/_componentes/NovaCampanha.tsx", "utf8");
    expect(tela.match(/const MENSAGEM_PADRAO =\s*"([^"]*)"/)?.[1]).toBe(MENSAGEM_PADRAO_DA_LISTA);
  });
});
