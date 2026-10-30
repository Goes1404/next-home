import type { DeclaracaoDeFerramenta } from "./cerebro";

/**
 * As capacidades do número central como FERRAMENTAS do cérebro (spec 3).
 *
 * Todas as 33 já são declaradas na onda 0, cada uma com a sua onda (spec 5):
 * o modelo escolhe a ferramenta certa desde já (é o que o eval mede), e a
 * que ainda não chegou responde "ainda não sei fazer isso" (spec 3.0). Cada
 * onda seguinte só troca o tratador, sem mexer na declaração.
 *
 * Duas espécies:
 * - consulta: roda e responde;
 * - ação: NUNCA grava direto. Vira item de uma proposta, que só roda depois
 *   do "sim" (`proposta.ts`, spec 4.3).
 */

/** A onda em produção. Sobe a cada entrega (spec 5). */
export const ONDA_ATUAL = 3;

export type TipoDeFerramenta = "consulta" | "acao";

export type Ferramenta = {
  nome: string;
  /** O número da capacidade na spec (seção 3). */
  capacidade: number;
  tipo: TipoDeFerramenta;
  onda: 0 | 1 | 2 | 3;
  soGestor?: boolean;
  descricao: string;
  parametros: Record<string, unknown>;
};

const texto = (descricao: string) => ({ type: "string", description: descricao });
const numero = (descricao: string) => ({ type: "number", description: descricao });
const opcao = (valores: string[], descricao: string) => ({ type: "string", enum: valores, description: descricao });
const objeto = (propriedades: Record<string, unknown>, obrigatorios: string[] = []) => ({
  type: "object",
  properties: propriedades,
  required: obrigatorios,
  additionalProperties: false,
});

const LEAD = texto("O cliente: nome, parte do nome ou telefone, como a pessoa falou.");
const IMOVEL = texto("O imóvel ou empreendimento, como a pessoa falou (ex.: 'Vitta', '2 dorms do Vitta').");
/** As 10 etapas do funil (`ETAPA_LABEL`, 0165). */
const ETAPAS = ["novo", "primeiro_contato", "em_conversa", "qualificado", "visita_agendada", "visitou", "proposta", "documentacao", "fechado", "perdido"];
const QUANDO = texto("Data e hora como a pessoa falou (ex.: 'amanhã 10h', 'sexta à tarde').");

export const FERRAMENTAS: Ferramenta[] = [
  // ── 3.1 Leads ─────────────────────────────────────────────────────────
  {
    nome: "cadastrar_lead",
    capacidade: 1,
    tipo: "acao",
    onda: 1,
    descricao: "Cadastrar um cliente novo (lead) com o que a pessoa disse. Telefone incompleto não serve: peça o número inteiro.",
    parametros: objeto(
      {
        nome: texto("Nome do cliente."),
        telefone: texto("Telefone completo com DDD."),
        regiao: texto("Região ou bairro de interesse."),
        renda: numero("Renda mensal em reais."),
        orcamento: numero("Orçamento em reais."),
        dormitorios: numero("Quantidade de dormitórios."),
        origem: texto("De onde veio (portal, indicação, plantão…)."),
        observacao: texto("Qualquer outra informação."),
      },
      ["nome"],
    ),
  },
  {
    nome: "atualizar_lead",
    capacidade: 2,
    tipo: "acao",
    onda: 1,
    descricao: "Atualizar a ficha de um cliente: etapa do funil, renda, orçamento, região, anotação sobre o que aconteceu.",
    parametros: objeto(
      {
        lead: LEAD,
        etapa: opcao(ETAPAS, "Etapa nova do funil."),
        renda: numero("Renda mensal em reais."),
        orcamento: numero("Orçamento em reais."),
        regiao: texto("Região de interesse."),
        anotacao: texto("O que aconteceu, em uma frase."),
      },
      ["lead"],
    ),
  },
  {
    nome: "cadastrar_lead_da_foto",
    capacidade: 3,
    tipo: "acao",
    onda: 1,
    descricao: "A pessoa mandou foto de um print de conversa, ficha de plantão ou cartão: cadastrar o cliente com os dados lidos na foto.",
    parametros: objeto({ nome: texto("Nome lido."), telefone: texto("Telefone lido."), interesse: texto("Interesse lido.") }),
  },
  {
    nome: "consultar_lead",
    capacidade: 4,
    tipo: "consulta",
    onda: 1,
    descricao: "Como está um cliente: resumo da ficha, última conversa, próxima visita e o que falta.",
    parametros: objeto({ lead: LEAD }, ["lead"]),
  },
  {
    nome: "documentos_do_lead",
    capacidade: 5,
    tipo: "acao",
    onda: 2,
    descricao: "Documentos de um cliente: ver o que ele já mandou, anexar foto de documento recebida, ou mandar a ele o link para enviar documentos.",
    parametros: objeto({ lead: LEAD, o_que: opcao(["ver", "anexar", "mandar_link"], "O que fazer.") }, ["lead", "o_que"]),
  },
  // ── 3.2 Agenda e dia a dia ────────────────────────────────────────────
  {
    nome: "visita",
    capacidade: 6,
    tipo: "acao",
    onda: 1,
    descricao: "Marcar, remarcar ou cancelar visita de um cliente.",
    parametros: objeto(
      { lead: LEAD, o_que: opcao(["marcar", "remarcar", "cancelar"], "O que fazer."), quando: QUANDO, imovel: IMOVEL },
      ["lead", "o_que"],
    ),
  },
  {
    nome: "leads_mais_quentes",
    capacidade: 7,
    tipo: "consulta",
    onda: 1,
    descricao: "Os clientes mais quentes agora, pela nota do lead (0 a 100), com o motivo de cada um. Use para 'lead mais quente', 'melhores clientes', 'quem está mais perto de fechar'.",
    parametros: objeto({ quantos: numero("Quantos (padrão 5, até 10).") }),
  },
  {
    nome: "quem_ligar_hoje",
    capacidade: 7,
    tipo: "consulta",
    onda: 1,
    descricao: "A lista do dia: visitas de hoje, clientes quentes, quem está sem resposta, retornos combinados.",
    parametros: objeto({}),
  },
  {
    nome: "lembrete",
    capacidade: 8,
    tipo: "acao",
    onda: 2,
    descricao: "Criar um lembrete: o central avisa a pessoa na hora pedida.",
    parametros: objeto({ quando: QUANDO, texto: texto("Do que lembrar."), lead: LEAD }, ["quando", "texto"]),
  },
  {
    nome: "registrar_venda",
    capacidade: 9,
    tipo: "acao",
    onda: 2,
    descricao: "Registrar uma venda fechada: o cliente vai para fechado e a venda entra no financeiro.",
    parametros: objeto({ lead: LEAD, imovel: IMOVEL, valor: numero("Valor da venda em reais.") }, ["lead", "valor"]),
  },
  {
    nome: "agenda_pessoal",
    capacidade: 21,
    tipo: "acao",
    onda: 1,
    descricao: "Bloquear horário na agenda, marcar reunião de equipe (só gestor) ou anotar algo pessoal (sem cliente).",
    parametros: objeto(
      { o_que: opcao(["bloqueio", "reuniao", "anotacao"], "O que criar."), quando: QUANDO, texto: texto("Descrição.") },
      ["o_que"],
    ),
  },
  // ── 3.3 Imóveis ───────────────────────────────────────────────────────
  {
    nome: "informacao_de_imovel",
    capacidade: 10,
    tipo: "consulta",
    onda: 2,
    descricao: "Preço, metragem, disponibilidade, fotos e planta de um imóvel do catálogo.",
    parametros: objeto({ imovel: IMOVEL, pergunta: texto("O que a pessoa quer saber.") }, ["imovel"]),
  },
  {
    nome: "imoveis_para_o_lead",
    capacidade: 11,
    tipo: "consulta",
    onda: 2,
    descricao: "Quais imóveis do catálogo servem para um cliente, pela renda, região e dormitórios dele.",
    parametros: objeto({ lead: LEAD }, ["lead"]),
  },
  {
    nome: "leads_para_o_imovel",
    capacidade: 23,
    tipo: "consulta",
    onda: 2,
    descricao: "Quais clientes têm perfil para um imóvel.",
    parametros: objeto({ imovel: IMOVEL }, ["imovel"]),
  },
  {
    nome: "simular_financiamento",
    capacidade: 22,
    tipo: "consulta",
    onda: 2,
    descricao: "Simular financiamento: parcela pelo valor do imóvel, renda, entrada e prazo.",
    parametros: objeto(
      { valor: numero("Valor do imóvel."), renda: numero("Renda mensal."), entrada: numero("Entrada."), prazo_meses: numero("Prazo em meses.") },
      ["valor"],
    ),
  },
  {
    nome: "atualizar_imovel",
    capacidade: 28,
    tipo: "acao",
    onda: 2,
    soGestor: true,
    descricao: "Atualizar preço ou disponibilidade de um imóvel do catálogo (ex.: subiu de preço, unidade vendida).",
    parametros: objeto({ imovel: IMOVEL, preco: numero("Preço novo."), unidade: texto("Unidade."), disponivel: { type: "boolean" } }, ["imovel"]),
  },
  // ── 3.4 Relatórios ────────────────────────────────────────────────────
  {
    nome: "relatorio_do_corretor",
    capacidade: 12,
    tipo: "consulta",
    onda: 2,
    descricao: "Relatório da própria pessoa: leads, visitas, vendas e funil no período.",
    parametros: objeto({ periodo: texto("Período (ex.: 'este mês', 'semana passada').") }),
  },
  {
    nome: "relatorio_da_equipe",
    capacidade: 13,
    tipo: "consulta",
    onda: 2,
    soGestor: true,
    descricao: "Relatório da equipe: ranking, quem está parado, campanhas da tela Anúncios pagos.",
    parametros: objeto({ periodo: texto("Período.") }),
  },
  {
    nome: "redistribuir_leads",
    capacidade: 13,
    tipo: "acao",
    onda: 2,
    soGestor: true,
    descricao: "Passar clientes de um corretor para outro (ex.: os parados da Ana para o Beto).",
    parametros: objeto({ de: texto("Corretor de origem."), para: texto("Corretor de destino."), quais: texto("Quais clientes.") }, ["de", "para"]),
  },
  {
    nome: "meta_e_comissao",
    capacidade: 24,
    tipo: "consulta",
    onda: 2,
    descricao: "Quanto falta para a meta e quanto a pessoa tem a receber de comissão.",
    parametros: objeto({}),
  },
  {
    nome: "resultado_do_mes",
    capacidade: 27,
    tipo: "consulta",
    onda: 2,
    soGestor: true,
    descricao: "Resultado do mês da imobiliária: receita, despesas, comissões e resultado.",
    parametros: objeto({ mes: texto("Mês (ex.: 'outubro').") }),
  },
  {
    nome: "lancar_no_caixa",
    capacidade: 26,
    tipo: "acao",
    onda: 2,
    soGestor: true,
    descricao: "Lançar uma despesa ou receita no caixa da imobiliária.",
    parametros: objeto(
      { tipo: opcao(["despesa", "receita"], "Tipo."), valor: numero("Valor."), descricao: texto("Do que é."), quando: QUANDO },
      ["tipo", "valor", "descricao"],
    ),
  },
  {
    nome: "informar_gasto_de_anuncio",
    capacidade: 25,
    tipo: "acao",
    onda: 2,
    descricao: "Informar quanto foi gasto num anúncio ou campanha paga.",
    parametros: objeto({ campanha: texto("O anúncio ou campanha."), valor: numero("Valor gasto até hoje, em reais.") }, ["campanha", "valor"]),
  },
  {
    nome: "whatsapp_da_equipe",
    capacidade: 30,
    tipo: "consulta",
    onda: 2,
    soGestor: true,
    descricao: "Quem da equipe está com o WhatsApp desconectado do sistema.",
    parametros: objeto({}),
  },
  {
    nome: "importar_planilha",
    capacidade: 29,
    tipo: "acao",
    onda: 2,
    descricao: "A pessoa mandou uma planilha de clientes (Excel ou CSV) para cadastrar.",
    parametros: objeto({}),
  },
  // ── 3.5 Listas e imagens ──────────────────────────────────────────────
  {
    nome: "montar_lista",
    capacidade: 14,
    tipo: "acao",
    onda: 3,
    // Conversa da Bruna, 30/10/2026: a IA ofereceu filtros que a lista não
    // entendia ("quem já respondeu", "quem parou de responder") e todos deram
    // "ninguém". Os filtros agora são campos; a descrição diz que não há outros.
    descricao:
      "Montar lista de transmissão. Filtros que EXISTEM (combine à vontade): região, orçamento máximo, dormitórios, imóvel de interesse, etapa do funil, se o cliente já respondeu alguma mensagem ou nunca respondeu, e parado há N dias (sem conversa). Não ofereça nem invente outro filtro. Sem texto, usa o texto padrão do imóvel.",
    parametros: objeto({
      regiao: texto("Região ou bairro de interesse do cliente."),
      orcamento_max: numero("Orçamento máximo em reais."),
      dormitorios: numero("Dormitórios."),
      imovel: IMOVEL,
      etapas: { type: "array", items: { type: "string", enum: ETAPAS }, description: "Etapas do funil (ex.: em_conversa, qualificado)." },
      respondeu: opcao(["sim", "nao"], "sim = já respondeu alguma mensagem; nao = nunca respondeu."),
      parado_ha_dias: numero("Sem conversa há pelo menos N dias."),
      para_quem: texto("O pedido como a pessoa falou, para o resumo."),
      texto: texto("Mensagem."),
    }),
  },
  {
    nome: "acompanhar_lista",
    capacidade: 15,
    tipo: "acao",
    onda: 3,
    descricao: "Ver como está uma lista de transmissão, pausar ou retomar.",
    parametros: objeto({ lista: texto("Qual lista."), o_que: opcao(["ver", "pausar", "retomar"], "O que fazer.") }, ["o_que"]),
  },
  {
    nome: "gerar_arte",
    capacidade: 16,
    tipo: "acao",
    onda: 3,
    // Conversa da Bruna, 30/10/2026: a frase pedida ("Visite e ganhe um
    // champanhe…") se perdia, e imagem sem imóvel virava "use o Midjourney".
    descricao:
      "Gerar arte para redes sociais pelo Estúdio da plataforma: de um imóvel do catálogo e/ou de um pedido livre (ex.: 'prédio futurista flutuante'), com a frase ou oferta que a pessoa pedir escrita na arte.",
    parametros: objeto({
      imovel: IMOVEL,
      formato: texto("Formato (post, story…)."),
      texto_na_arte: texto("Frase ou oferta para aparecer escrita na arte, exatamente como a pessoa pediu."),
      pedido: texto("O que a pessoa quer ver na imagem, em palavras dela."),
    }),
  },
  {
    nome: "criar_video",
    capacidade: 32,
    tipo: "acao",
    onda: 3,
    descricao: "Criar vídeo de um imóvel para redes sociais.",
    parametros: objeto({ imovel: IMOVEL }, ["imovel"]),
  },
  {
    nome: "mandar_material",
    capacidade: 17,
    tipo: "acao",
    onda: 3,
    descricao: "Mandar ao cliente material de um imóvel (book, fotos, planta).",
    parametros: objeto({ lead: LEAD, imovel: IMOVEL, material: texto("Qual material.") }, ["lead", "imovel"]),
  },
  {
    nome: "selecao_ou_proposta",
    capacidade: 31,
    tipo: "acao",
    onda: 3,
    descricao: "Montar uma seleção de imóveis ou uma proposta para um cliente e mandar o link.",
    parametros: objeto({ lead: LEAD, tipo: opcao(["selecao", "proposta"], "O que montar."), imoveis: texto("Quais imóveis.") }, ["lead", "tipo"]),
  },
  {
    nome: "meu_link_e_mensagens",
    capacidade: 33,
    tipo: "acao",
    onda: 3,
    descricao: "O link pessoal da pessoa para um imóvel, ou usar uma mensagem pronta com um cliente.",
    parametros: objeto({ imovel: IMOVEL, mensagem_pronta: texto("Qual mensagem pronta."), lead: LEAD }),
  },
  // ── 3.6 Controle e ajuda ──────────────────────────────────────────────
  {
    nome: "ia_do_cliente",
    capacidade: 18,
    tipo: "acao",
    onda: 1,
    descricao: "Ligar ou desligar a IA que atende um cliente, ou ver o que ela conversou com ele.",
    parametros: objeto({ lead: LEAD, o_que: opcao(["ligar", "desligar", "resumo"], "O que fazer.") }, ["lead", "o_que"]),
  },
  {
    nome: "desfazer",
    capacidade: 19,
    tipo: "acao",
    onda: 1,
    descricao: "Desfazer o último pedido confirmado pelo central.",
    parametros: objeto({}),
  },
  {
    nome: "ajuda",
    capacidade: 19,
    tipo: "consulta",
    onda: 0,
    descricao: "O que o assistente sabe fazer, com exemplos de pedidos.",
    parametros: objeto({}),
  },
  {
    nome: "saude_do_numero",
    capacidade: 20,
    tipo: "consulta",
    onda: 3,
    descricao: "Se o WhatsApp da pessoa está conectado e quantos primeiros contatos ainda cabem hoje.",
    parametros: objeto({}),
  },
];

/** As declarações que o modelo recebe: o gestor vê todas; o corretor, as dele. */
export function declaracoesPara(papel: "corretor" | "gestor"): DeclaracaoDeFerramenta[] {
  return FERRAMENTAS.filter((f) => papel === "gestor" || !f.soGestor).map((f) => ({
    nome: f.nome,
    descricao: f.descricao,
    parametros: f.parametros,
  }));
}

export function ferramenta(nome: string): Ferramenta | undefined {
  return FERRAMENTAS.find((f) => f.nome === nome);
}

export const AINDA_NAO = "Ainda não sei fazer isso, chega nas próximas semanas.";

/** Exemplos que a ajuda e as boas-vindas mostram, por onda. */
export const EXEMPLOS_POR_ONDA: Record<number, string[]> = {
  0: ["O que você sabe fazer?"],
  1: [
    "Cadastra o João, 11 99999-0000, quer Alphaville, renda 5 mil",
    "O João visitou o Vitta e gostou",
    "Quem eu ligo hoje?",
    "Marca visita com a Maria sábado às 10h",
  ],
  2: ["Quanto falta pra minha meta?", "Quanto fica a parcela de 450 mil com renda de 8 mil?", "Como foi meu mês?"],
  3: ["Manda o lançamento do Vitta pra quem quer Barueri", "Faz um post do Vitta para o Instagram"],
};

/** O texto da ajuda: o que já funciona, e o que chega depois. */
export function textoDaAjuda(onda: number = ONDA_ATUAL): string {
  const ja = Object.entries(EXEMPLOS_POR_ONDA)
    .filter(([o]) => Number(o) <= onda)
    .flatMap(([, exemplos]) => exemplos);
  const depois = Object.entries(EXEMPLOS_POR_ONDA)
    .filter(([o]) => Number(o) > onda)
    .flatMap(([, exemplos]) => exemplos)
    .slice(0, 4);
  const linhas = [`Por enquanto eu entendo texto e áudio e respondo coisas como:`, ...ja.map((e) => `• "${e}"`)];
  if (depois.length > 0) {
    linhas.push("", "Nas próximas semanas você vai poder pedir, por exemplo:", ...depois.map((e) => `• "${e}"`));
  }
  return linhas.join("\n");
}
