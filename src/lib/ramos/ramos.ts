// O ramo da conta: a fonte ÚNICA do que muda de um negócio para outro
// (29/10/2026, 0244).
//
// Pedido do dono: "No app, não vamos limitar só para imobiliárias, porque tem
// seguradoras, advocacia... que vamos vender nosso sistema, com as mesmas
// funcionalidades. [...] No tipo de conta que vamos criar para a pessoa,
// vamos selecionar qual ramo e personalizar algumas coisas pra ela. E todo
// login vai redirecionar para o CRM da tipagem da conta."
//
// O app é UM só (as rotas `/corretor/...` não mudam: links salvos e o app
// Android dependem delas). O que o ramo muda:
//
//   - VOCABULÁRIO: quem é da equipe (corretor, consultor, advogado...), o
//     que se vende (imóvel, seguro, caso...), o compromisso (visita,
//     reunião, consulta), o documento profissional (CRECI, SUSEP, OAB...) e
//     o rótulo das etapas do funil que falam de visita.
//   - MÓDULOS: o que é de imobiliária (catálogo de imóveis, site vitrine,
//     crédito imobiliário, construtoras, parceiros, vídeo do imóvel, preços
//     do catálogo) some do menu dos outros ramos. O catálogo NÃO foi
//     reaproveitado como "Produtos e serviços": a tabela `empreendimentos`
//     é de imóvel (tipologias com dormitórios e vagas, torres, entrega,
//     construtora, unidades), e a IA e o site dependem desses campos.
//     Esconder é honesto; fingir genérico seria um formulário de imóvel
//     com outro nome.
//   - IA: o enquadramento do assistente do WhatsApp (que negócio é, que
//     papel ela tem, o que qualifica) para os ramos que não são imobiliária.
//
// A imobiliária é o padrão de tudo e o vocabulário dela é o texto de hoje,
// letra por letra: conta de imobiliária não muda de cara (testes de
// regressão em `ramos.test.ts` e `navegacao.test.ts`).
//
// Módulo PURO (sem React, sem banco): a página de vendas, o assistente de
// contratação, a plataforma, o painel e a IA leem daqui. A lista `RAMOS`
// espelha o CHECK de `grupos.ramo` (0244): mudou aqui, muda lá.

export const RAMOS = [
  "imobiliaria",
  "seguros",
  "advocacia",
  "contabilidade",
  "saude",
  "educacao",
  "varejo",
  "servicos",
  "outro",
] as const;
export type Ramo = (typeof RAMOS)[number];

export const RAMO_PADRAO: Ramo = "imobiliaria";

/** Teto do texto livre do "Outro" (igual ao CHECK da 0244). */
export const RAMO_DESCRICAO_MINIMO = 2;
export const RAMO_DESCRICAO_MAXIMO = 80;

/**
 * O que a ficha do primeiro acesso grava no lugar do documento profissional
 * quando o ramo não tem um obrigatório (`corretores.creci` é `not null`
 * desde a 0001). A pessoa troca no perfil quando quiser.
 */
export const SEM_DOCUMENTO_PROFISSIONAL = "Não informado";

/**
 * Os módulos que só existem para alguns ramos. Tudo que NÃO está aqui (leads,
 * conversas, funil, agenda, anotações, financeiro, IA, marketing, campanhas,
 * administração) vale para todos.
 */
export const MODULOS_DO_RAMO = [
  /** Catálogo de imóveis (`/corretor/imoveis`) e os links por imóvel. */
  "catalogoDeImoveis",
  /** O site vitrine de imóveis e o link pessoal do corretor para ele. */
  "siteDeImoveis",
  /** Taxas de financiamento imobiliário (`/corretor/admin/credito`). */
  "creditoImobiliario",
  /** Construtoras parceiras (`/corretor/admin/construtoras`). */
  "construtoras",
  /** Parceiros que vendem o estoque de imóveis (`/corretor/admin/parceiros`). */
  "parceirosDeImoveis",
  /** O vídeo montado com as fotos de um imóvel (`/corretor/marketing/video`). */
  "videoDeImovel",
  /** Reajuste de preços do catálogo em lote (`/corretor/admin/precos`). */
  "precosDoCatalogo",
] as const;
export type ModuloDoRamo = (typeof MODULOS_DO_RAMO)[number];

/** Os ícones que a interface sabe desenhar (`IconeDoRamo.tsx`). */
export type IconeDoRamo =
  | "predio"
  | "escudo"
  | "balanca"
  | "calculadora"
  | "estetoscopio"
  | "capelo"
  | "sacola"
  | "ferramenta"
  | "estrela";

type Palavra = { singular: string; plural: string };

export type Vocabulario = {
  /** Quem atende pelo CRM: "corretor", "consultor", "advogado"... */
  equipe: Palavra;
  /** Quem chega pelo WhatsApp: "cliente", "paciente", "aluno"... */
  cliente: Palavra;
  /** O que se vende: "imóvel", "seguro", "caso"... */
  oferta: Palavra & {
    /** O título do catálogo no menu e nos atalhos ("Imóveis"). */
    titulo: string;
  };
  /** O encontro que a IA marca na agenda: "visita", "reunião", "consulta"... */
  compromisso: Palavra & { genero: "f" | "m" };
  /** O registro profissional (CRECI, SUSEP, OAB...). */
  documento: {
    /** Como aparece no campo: "CRECI", "Registro SUSEP", "OAB". */
    rotulo: string;
    /** Obrigatório para começar o teste grátis e criar a conta. */
    obrigatorio: boolean;
  };
  /** O negócio: "imobiliária", "corretora de seguros", "escritório"... */
  empresa: Palavra & { genero: "f" | "m" };
  /** O ranking de vendas no Financeiro ("Ranking de VGV" na imobiliária). */
  ranking: string;
};

export type ContextoDaIa = {
  /** O papel no "Você é <nome>, ___": "consultora de seguros". */
  papel: string;
  /** Uma frase sobre o negócio, sem nome próprio. */
  negocio: string;
  /** Aonde a conversa tem de chegar. */
  objetivo: string;
  /** O que perguntar antes de indicar algo, uma coisa por vez. */
  qualificacao: string[];
};

export type ConfigDoRamo = {
  id: Ramo;
  /** Nome no seletor e no selo: "Imobiliária", "Corretora de seguros". */
  rotulo: string;
  /** Linha curta do cartão "Para quem é" da página de vendas. */
  resumo: string;
  icone: IconeDoRamo;
  vocabulario: Vocabulario;
  modulos: readonly ModuloDoRamo[];
  /** `null` na imobiliária: o prompt dela é o de sempre, byte a byte. */
  ia: ContextoDaIa | null;
};

const p = (singular: string, plural: string): Palavra => ({ singular, plural });

/** O vocabulário de hoje (imobiliária). Os outros ramos partem dele. */
const VOCABULARIO_IMOBILIARIA: Vocabulario = {
  equipe: p("corretor", "corretores"),
  cliente: p("cliente", "clientes"),
  oferta: { ...p("imóvel", "imóveis"), titulo: "Imóveis" },
  compromisso: { ...p("visita", "visitas"), genero: "f" },
  documento: { rotulo: "CRECI", obrigatorio: true },
  empresa: { ...p("imobiliária", "imobiliárias"), genero: "f" },
  ranking: "Ranking de VGV",
};

/** O vocabulário neutro, base dos ramos que não são imobiliária. */
const VOCABULARIO_GERAL: Vocabulario = {
  equipe: p("consultor", "consultores"),
  cliente: p("cliente", "clientes"),
  oferta: { ...p("produto ou serviço", "produtos e serviços"), titulo: "Produtos e serviços" },
  compromisso: { ...p("reunião", "reuniões"), genero: "f" },
  documento: { rotulo: "Registro profissional", obrigatorio: false },
  empresa: { ...p("empresa", "empresas"), genero: "f" },
  ranking: "Ranking de vendas",
};

const geral = (v: Partial<Vocabulario>): Vocabulario => ({ ...VOCABULARIO_GERAL, ...v });

export const CONFIG_DOS_RAMOS: Record<Ramo, ConfigDoRamo> = {
  imobiliaria: {
    id: "imobiliaria",
    rotulo: "Imobiliária",
    resumo: "Imobiliárias e corretores de imóveis, com catálogo, site e funil de visitas.",
    icone: "predio",
    vocabulario: VOCABULARIO_IMOBILIARIA,
    modulos: MODULOS_DO_RAMO,
    ia: null,
  },
  seguros: {
    id: "seguros",
    rotulo: "Corretora de seguros",
    resumo: "Corretoras e corretores de seguros: cotação, renovação e indicação.",
    icone: "escudo",
    vocabulario: geral({
      oferta: { ...p("seguro", "seguros"), titulo: "Seguros" },
      documento: { rotulo: "Registro SUSEP", obrigatorio: false },
      empresa: { ...p("corretora", "corretoras"), genero: "f" },
    }),
    modulos: [],
    ia: {
      papel: "consultora de seguros",
      negocio: "uma corretora de seguros (auto, vida, residencial, empresarial, saúde e outros)",
      objetivo: "entender o que a pessoa quer proteger e levar a conversa até uma cotação ou uma reunião com o consultor",
      qualificacao: [
        "que tipo de seguro procura (auto, vida, residencial, empresa...)",
        "o que quer proteger e se já tem seguro hoje (e quando vence)",
        "os dados mínimos para a cotação, um de cada vez",
      ],
    },
  },
  advocacia: {
    id: "advocacia",
    rotulo: "Advocacia",
    resumo: "Escritórios e advogados: triagem do caso e agendamento da consulta.",
    icone: "balanca",
    vocabulario: geral({
      equipe: p("advogado", "advogados"),
      oferta: { ...p("caso", "casos"), titulo: "Áreas de atuação" },
      compromisso: { ...p("consulta", "consultas"), genero: "f" },
      documento: { rotulo: "OAB", obrigatorio: false },
      empresa: { ...p("escritório", "escritórios"), genero: "m" },
    }),
    modulos: [],
    ia: {
      papel: "assistente de atendimento do escritório",
      negocio: "um escritório de advocacia",
      objetivo: "entender o caso em linhas gerais e agendar uma consulta com o advogado",
      qualificacao: [
        "qual é a área do problema (trabalhista, família, consumidor, previdência...)",
        "o que aconteceu, em poucas palavras, e se há prazo correndo",
        "se a pessoa já tem processo ou documento sobre o assunto",
      ],
    },
  },
  contabilidade: {
    id: "contabilidade",
    rotulo: "Contabilidade",
    resumo: "Escritórios contábeis: abertura de empresa, rotina fiscal e consultoria.",
    icone: "calculadora",
    vocabulario: geral({
      equipe: p("contador", "contadores"),
      oferta: { ...p("serviço", "serviços"), titulo: "Serviços" },
      documento: { rotulo: "CRC", obrigatorio: false },
      empresa: { ...p("escritório", "escritórios"), genero: "m" },
    }),
    modulos: [],
    ia: {
      papel: "assistente de atendimento do escritório contábil",
      negocio: "um escritório de contabilidade",
      objetivo: "entender a necessidade da empresa ou da pessoa e levar a uma proposta ou reunião com o contador",
      qualificacao: [
        "se é para abrir empresa, trocar de contador ou um serviço avulso",
        "o tipo e o porte do negócio (MEI, Simples, Lucro Presumido...)",
        "o que mais está pesando hoje (impostos, folha, atrasos)",
      ],
    },
  },
  saude: {
    id: "saude",
    rotulo: "Saúde e estética",
    resumo: "Clínicas, consultórios e estética: agendamento e retorno de pacientes.",
    icone: "estetoscopio",
    vocabulario: geral({
      equipe: p("profissional", "profissionais"),
      cliente: p("paciente", "pacientes"),
      oferta: { ...p("procedimento", "procedimentos"), titulo: "Procedimentos" },
      compromisso: { ...p("consulta", "consultas"), genero: "f" },
      empresa: { ...p("clínica", "clínicas"), genero: "f" },
    }),
    modulos: [],
    ia: {
      papel: "assistente de atendimento da clínica",
      negocio: "uma clínica ou consultório de saúde e estética",
      objetivo: "entender o que a pessoa procura e agendar a consulta ou avaliação",
      qualificacao: [
        "qual procedimento ou especialidade procura",
        "se já é paciente e se tem convênio ou é particular",
        "o melhor dia e período para a consulta",
      ],
    },
  },
  educacao: {
    id: "educacao",
    rotulo: "Educação",
    resumo: "Escolas, cursos e cursinhos: matrícula, aula experimental e retorno.",
    icone: "capelo",
    vocabulario: geral({
      cliente: p("aluno", "alunos"),
      oferta: { ...p("curso", "cursos"), titulo: "Cursos" },
      compromisso: { ...p("visita", "visitas"), genero: "f" },
      empresa: { ...p("escola", "escolas"), genero: "f" },
    }),
    modulos: [],
    ia: {
      papel: "assistente de matrículas",
      negocio: "uma escola ou curso",
      objetivo: "entender o objetivo do aluno e levar a uma visita, aula experimental ou matrícula",
      qualificacao: [
        "qual curso ou série procura e para quem é",
        "o objetivo (vestibular, concurso, reforço, carreira...)",
        "o turno e a modalidade que prefere (presencial ou online)",
      ],
    },
  },
  varejo: {
    id: "varejo",
    rotulo: "Comércio e varejo",
    resumo: "Lojas que vendem pelo WhatsApp: catálogo na conversa, pedido e pós-venda.",
    icone: "sacola",
    vocabulario: geral({
      equipe: p("vendedor", "vendedores"),
      oferta: { ...p("produto", "produtos"), titulo: "Produtos" },
      compromisso: { ...p("atendimento", "atendimentos"), genero: "m" },
      empresa: { ...p("loja", "lojas"), genero: "f" },
    }),
    modulos: [],
    ia: {
      papel: "vendedora da loja",
      negocio: "uma loja que vende pelo WhatsApp",
      objetivo: "entender o que a pessoa procura e levar até o pedido ou o atendimento com um vendedor",
      qualificacao: [
        "o que procura e para que uso",
        "tamanho, modelo, cor ou quantidade, quando fizer sentido",
        "como prefere receber ou retirar",
      ],
    },
  },
  servicos: {
    id: "servicos",
    rotulo: "Prestação de serviços",
    resumo: "Prestadores de serviço: orçamento, agendamento e acompanhamento.",
    icone: "ferramenta",
    vocabulario: geral({
      oferta: { ...p("serviço", "serviços"), titulo: "Serviços" },
      compromisso: { ...p("atendimento", "atendimentos"), genero: "m" },
    }),
    modulos: [],
    ia: {
      papel: "assistente de atendimento",
      negocio: "uma empresa de prestação de serviços",
      objetivo: "entender o que a pessoa precisa e levar até um orçamento ou um atendimento agendado",
      qualificacao: [
        "qual serviço precisa e onde",
        "o tamanho do trabalho e a urgência",
        "o melhor dia e horário para o atendimento",
      ],
    },
  },
  outro: {
    id: "outro",
    rotulo: "Outro",
    resumo: "Qualquer negócio que vende e atende pelo WhatsApp.",
    icone: "estrela",
    vocabulario: VOCABULARIO_GERAL,
    modulos: [],
    ia: {
      papel: "assistente de atendimento",
      negocio: "uma empresa que vende e atende pelo WhatsApp",
      objetivo: "entender o que a pessoa procura e levar até uma proposta ou um atendimento com a equipe",
      qualificacao: [
        "o que a pessoa procura e para quê",
        "a urgência e o que já tentou",
        "o melhor jeito e horário para seguir o atendimento",
      ],
    },
  },
};

export function ehRamo(valor: unknown): valor is Ramo {
  return typeof valor === "string" && (RAMOS as readonly string[]).includes(valor);
}

/** O ramo lido do banco, da URL ou do formulário. Desconhecido ou ausente = imobiliária. */
export function lerRamo(valor: unknown): Ramo {
  return ehRamo(valor) ? valor : RAMO_PADRAO;
}

export function configDoRamo(ramo: Ramo | null | undefined): ConfigDoRamo {
  return CONFIG_DOS_RAMOS[lerRamo(ramo)];
}

export function vocabularioDoRamo(ramo: Ramo | null | undefined): Vocabulario {
  return configDoRamo(ramo).vocabulario;
}

export function temModulo(ramo: Ramo | null | undefined, modulo: ModuloDoRamo): boolean {
  return configDoRamo(ramo).modulos.includes(modulo);
}

/** "corretor" → "Corretor". */
export function maiuscula(texto: string): string {
  return texto ? texto[0].toLocaleUpperCase("pt-BR") + texto.slice(1) : texto;
}

/**
 * O nome do ramo para mostrar: o rótulo da lista, ou o texto que a pessoa
 * escreveu no "Outro" ("Outro" sozinho quando não há texto).
 */
export function nomeDoRamo(ramo: Ramo | null | undefined, descricao?: string | null): string {
  const r = lerRamo(ramo);
  if (r === "outro") return limparDescricaoDoRamo(descricao) ?? CONFIG_DOS_RAMOS.outro.rotulo;
  return CONFIG_DOS_RAMOS[r].rotulo;
}

/** Texto do "Outro": uma linha, sem espaço sobrando, com teto. Vazio = `null`. */
export function limparDescricaoDoRamo(texto: string | null | undefined): string | null {
  const limpo = (texto ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return limpo ? limpo.slice(0, RAMO_DESCRICAO_MAXIMO + 1) : null;
}

export type RamoValidado = { ramo: Ramo; ramoDescricao: string | null };

/**
 * O par (ramo, descrição) de um formulário. Regra da 0244: "Outro" exige a
 * descrição (2 a 80); os outros ramos nunca a guardam.
 */
export function validarRamo(
  ramo: unknown,
  descricao: unknown,
): { ok: true; dados: RamoValidado } | { ok: false; campo: "ramo" | "ramoDescricao"; erro: string } {
  if (!ehRamo(ramo)) return { ok: false, campo: "ramo", erro: "Escolha o ramo do seu negócio." };
  if (ramo !== "outro") return { ok: true, dados: { ramo, ramoDescricao: null } };
  const texto = limparDescricaoDoRamo(typeof descricao === "string" ? descricao : "");
  if (!texto || texto.length < RAMO_DESCRICAO_MINIMO) {
    return { ok: false, campo: "ramoDescricao", erro: "Conte em poucas palavras qual é o seu ramo." };
  }
  if (texto.length > RAMO_DESCRICAO_MAXIMO) {
    return { ok: false, campo: "ramoDescricao", erro: `Use até ${RAMO_DESCRICAO_MAXIMO} caracteres.` };
  }
  return { ok: true, dados: { ramo, ramoDescricao: texto } };
}

/** "Visita marcada", "Reunião marcada", "Atendimento marcado". */
function marcado(c: Vocabulario["compromisso"]): string {
  return `${maiuscula(c.singular)} ${c.genero === "f" ? "marcada" : "marcado"}`;
}

/**
 * Os rótulos das etapas do funil que mudam com o ramo (as etapas em si são
 * as mesmas, enum do banco). Só "Visita marcada" e "Visitou" falam do
 * negócio; o resto ("Em conversa", "Proposta", "Fechado"...) vale para todos.
 * Na imobiliária devolve `{}`: o `ETAPA_LABEL` de sempre.
 */
export function rotulosDeEtapaDoRamo(ramo: Ramo | null | undefined): Partial<Record<"visita_agendada" | "visitou", string>> {
  const r = lerRamo(ramo);
  if (r === "imobiliaria") return {};
  const v = vocabularioDoRamo(r);
  return { visita_agendada: marcado(v.compromisso), visitou: "Compareceu" };
}

/**
 * O rótulo da coluna "Visita" do funil agrupado (`GRUPO_LABEL.visita`) no
 * ramo: "Reunião", "Consulta". `null` na imobiliária (o de sempre).
 */
export function rotuloDoGrupoVisita(ramo: Ramo | null | undefined): string | null {
  const r = lerRamo(ramo);
  return r === "imobiliaria" ? null : maiuscula(vocabularioDoRamo(r).compromisso.singular);
}

/**
 * O documento profissional da ficha: o digitado, ou o marcador quando o
 * ramo não exige um (`SEM_DOCUMENTO_PROFISSIONAL`). `null` = falta e é
 * obrigatório.
 */
export function documentoProfissionalDaFicha(ramo: Ramo | null | undefined, digitado: string | null | undefined): string | null {
  const limpo = (digitado ?? "").trim();
  if (limpo) return limpo;
  return vocabularioDoRamo(ramo).documento.obrigatorio ? null : SEM_DOCUMENTO_PROFISSIONAL;
}
