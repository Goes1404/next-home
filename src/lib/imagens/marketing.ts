/**
 * As regras de marketing imobiliário como CÓDIGO — o que diferencia esta tela
 * de "um ChatGPT que gera imagem".
 *
 * ## O que o ChatGPT não tem, e este módulo tem
 *
 * 1. **O catálogo real.** O briefing sai da ficha do imóvel: estágio da obra
 *    (com o rótulo humano, nunca o enum), tipo, bairro, construtora e o LAZER
 *    QUE EXISTE. A IA não pode desenhar piscina num prédio sem piscina — e o
 *    jeito de garantir isso é só oferecer a ela o que está cadastrado.
 * 2. **O objetivo da peça.** Lançamento, visita ao decorado, últimas
 *    unidades, investimento, vida no bairro: cada um tem um assunto-herói e
 *    uma hora do dia que o mercado já sabe que funciona. Isso não é gosto:
 *    é a régua de quem faz criativo imobiliário todo dia.
 * 3. **O canal.** Story tem zona morta em cima e embaixo; feed 4:5 quer o
 *    assunto centrado; anúncio quer UM foco e respiro; WhatsApp vai ser visto
 *    pequeno e comprimido. A composição muda, e quem escolhe é o código.
 * 4. **O público.** Família, investidor, casal jovem e alto padrão não
 *    respondem à mesma luz nem ao mesmo elemento de cena.
 * 5. **A honestidade.** Toda arte gerada por IA leva a ressalva de imagem
 *    ilustrativa — publicidade imobiliária no Brasil já traz isso em toda
 *    peça de lançamento, e aqui a imagem é 100% ilustrativa por definição.
 *
 * ## Por que é código e não instrução
 *
 * A lição mais repetida desta casa: instrução de prompt é probabilística e
 * falha justo na peça que importa. O briefing abaixo é montado por função
 * pura, testável, e o modelo recebe uma CENA JÁ DECIDIDA — a ele cabe
 * escrevê-la bem, não decidi-la.
 *
 * Módulo PURO: a tela é `"use client"` e precisa dos rótulos.
 */

import { STATUS_LABEL, TIPO_LABEL, type Empreendimento } from "@/lib/types";
import { resumoDeTipologias } from "@/lib/social/carrossel";

// ---------------------------------------------------------------------------
// Objetivo — o que a peça existe para fazer
// ---------------------------------------------------------------------------

export type ChaveObjetivo =
  | "lancamento"
  | "decorado"
  | "ultimas_unidades"
  | "pronto_para_morar"
  | "investimento"
  | "vida_no_bairro";

export type Objetivo = {
  chave: ChaveObjetivo;
  rotulo: string;
  ajuda: string;
  /** O que a imagem mostra. É a decisão de produto, não do modelo. */
  assuntoHeroi: string;
  /** Luz e hora do dia que o mercado usa para este objetivo. */
  luz: string;
  /** As chamadas permitidas — a IA escolhe entre elas, nunca inventa. */
  ctas: string[];
  /**
   * Qual foto real do imóvel serve de referência para ESTE assunto, escolhida
   * pelo `alt` (as 265 fotos de produção foram descritas por visão em 08/2026,
   * o mesmo truque de `lazerFotos.ts`). `senao` diz o que fazer quando nenhuma
   * casa: "capa" para assunto de interior (a capa costuma ser um living),
   * "nenhuma" para exterior — um living como referência de fachada é pior que
   * referência nenhuma, e foi exatamente o que a primeira medição fez.
   */
  fotoDeReferencia: { alt: RegExp; senao: "capa" | "nenhuma" } | null;
};

export const OBJETIVOS: Objetivo[] = [
  {
    chave: "lancamento",
    rotulo: "Lançamento",
    ajuda: "Apresentar o empreendimento. O prédio é o protagonista.",
    assuntoHeroi:
      "a fachada do empreendimento vista da calçada em leve contra-plongée, " +
      "paisagismo do térreo tratado, entrada iluminada, prédio inteiro no quadro",
    luz: "entardecer (golden hour), céu com gradiente quente, luzes internas acesas",
    ctas: ["Conheça o lançamento", "Quero saber mais", "Agende uma visita"],
    fotoDeReferencia: { alt: /fachada|perspectiva|exterior|pr[ée]dio|torre|edif[ií]cio|a[ée]rea|implanta/i, senao: "nenhuma" },
  },
  {
    chave: "decorado",
    rotulo: "Visite o decorado",
    ajuda: "Chamar para conhecer o apartamento pronto. O living é o protagonista.",
    assuntoHeroi:
      "o living integrado do apartamento decorado, sofá e mesa de jantar no " +
      "quadro, varanda ao fundo com a porta aberta, ambiente pronto para receber",
    luz: "luz de manhã entrando pela varanda, suave e clara, sem sombra dura",
    ctas: ["Visite o decorado", "Agende sua visita", "Conheça de perto"],
    fotoDeReferencia: { alt: /living|sala|estar|jantar|varanda|decorado|cozinha|integrad/i, senao: "capa" },
  },
  {
    chave: "ultimas_unidades",
    rotulo: "Últimas unidades",
    ajuda: "Urgência sem gritar. O produto pronto, com a sensação de fim de oferta.",
    assuntoHeroi:
      "a varanda de uma unidade com vista aberta, cadeiras e uma planta, o " +
      "horizonte da região ao fundo — o que quem chegou por último ainda leva",
    luz: "fim de tarde, luz lateral quente, céu limpo",
    ctas: ["Garanta a sua", "Últimas unidades", "Fale comigo agora"],
    fotoDeReferencia: { alt: /varanda|terra[çc]o|vista|sacada|living/i, senao: "capa" },
  },
  {
    chave: "pronto_para_morar",
    rotulo: "Pronto para morar",
    ajuda: "A mudança é para já. Portaria, entrada, chaves na mão.",
    assuntoHeroi:
      "a entrada do condomínio pronto: portaria com guarita, paisagismo " +
      "maduro, calçada limpa, um carro chegando no acesso",
    luz: "manhã clara de dia útil, sol alto e limpo, sem dramatização",
    ctas: ["Mude-se agora", "Agende sua visita", "Fale comigo"],
    fotoDeReferencia: { alt: /fachada|portaria|entrada|acesso|guarita|exterior/i, senao: "nenhuma" },
  },
  {
    chave: "investimento",
    rotulo: "Investimento",
    ajuda: "Para quem compra pensando em rentabilidade. Região e solidez.",
    assuntoHeroi:
      "o skyline da região com o empreendimento em destaque no primeiro " +
      "plano, vias arborizadas, sensação de bairro consolidado e valorizado",
    luz: "hora azul (logo após o pôr do sol), luzes da cidade acesas, céu profundo",
    ctas: ["Conheça a oportunidade", "Fale com um especialista", "Quero saber mais"],
    fotoDeReferencia: { alt: /fachada|perspectiva|a[ée]rea|skyline|exterior|torre/i, senao: "nenhuma" },
  },
  {
    chave: "vida_no_bairro",
    rotulo: "Vida no bairro",
    ajuda: "Vender o estilo de vida: lazer, convivência, o dia a dia no lugar.",
    assuntoHeroi:
      "a área de lazer do condomínio em uso discreto: piscina ou espaço de " +
      "convivência, vegetação, sensação de fim de semana em casa",
    luz: "tarde de sol, sombra de árvore, água refletindo o céu",
    ctas: ["Viva assim", "Conheça o condomínio", "Agende uma visita"],
    fotoDeReferencia: { alt: /piscina|lazer|academia|gourmet|playground|pet|sal[ãa]o|churrasq|quadra|spa|rooftop/i, senao: "nenhuma" },
  },
];

// ---------------------------------------------------------------------------
// Canal — onde a peça vai ser vista
// ---------------------------------------------------------------------------

export type ChaveCanal = "story" | "feed" | "anuncio" | "whatsapp";

export type Canal = {
  chave: ChaveCanal;
  rotulo: string;
  ajuda: string;
  /** O que a API gera. Só existem três tamanhos. */
  geracao: { largura: 1024 | 1536; altura: 1024 | 1536 };
  /** O que sai pronto para publicar. */
  arte: { largura: number; altura: number };
  /**
   * Zona morta: a interface do app cobre estas faixas. Texto ali some.
   * Medido em pixels da ARTE final.
   */
  zonaMorta: { topo: number; base: number };
  /** Onde a composição precisa deixar respiro para a copy. */
  respiro: string;
  /** Regra de contraste/escala específica do canal. */
  legibilidade: string;
};

export const CANAIS: Canal[] = [
  {
    chave: "story",
    rotulo: "Story",
    ajuda: "Instagram e WhatsApp status, 9:16. Some em 24h — pode ser mais direto.",
    geracao: { largura: 1024, altura: 1536 },
    arte: { largura: 1080, altura: 1920 },
    // 250px em cima (nome do perfil, barra de progresso) e 340 embaixo
    // (caixa de resposta, botões). É a régua publicada pela própria Meta.
    zonaMorta: { topo: 250, base: 340 },
    respiro:
      "assunto principal no terço central da imagem; parte inferior mais " +
      "limpa e escura, onde vai o texto",
    legibilidade: "contraste alto; será visto por dois segundos",
  },
  {
    chave: "feed",
    rotulo: "Feed",
    ajuda: "Post de Instagram e Facebook, 4:5. Fica no perfil — é vitrine permanente.",
    geracao: { largura: 1024, altura: 1536 },
    arte: { largura: 1080, altura: 1350 },
    zonaMorta: { topo: 0, base: 0 },
    respiro:
      "assunto centrado, com margem de respiro nas bordas; terço inferior " +
      "com menos detalhe para receber o texto",
    legibilidade: "acabamento de revista; será visto com calma",
  },
  {
    chave: "anuncio",
    rotulo: "Anúncio",
    ajuda: "Meta Ads (feed 1:1). Um foco só — é a peça que compete com tudo.",
    geracao: { largura: 1024, altura: 1024 },
    arte: { largura: 1080, altura: 1080 },
    zonaMorta: { topo: 0, base: 0 },
    respiro:
      "UM único assunto, sem elementos secundários; composição limpa com " +
      "área de respiro na base",
    legibilidade:
      "pouco texto sobre a imagem — anúncio com texto demais perde alcance; " +
      "a mensagem vai no título do anúncio",
  },
  {
    chave: "whatsapp",
    rotulo: "WhatsApp",
    ajuda: "Para disparo de campanha e envio direto. Vai ser visto pequeno e comprimido.",
    geracao: { largura: 1024, altura: 1024 },
    arte: { largura: 1080, altura: 1080 },
    zonaMorta: { topo: 0, base: 0 },
    respiro: "assunto grande e centrado, sem detalhe miúdo; base limpa para o texto",
    legibilidade:
      "contraste alto e formas grandes: o WhatsApp comprime a imagem e a " +
      "prévia na conversa tem poucos centímetros",
  },
];

// ---------------------------------------------------------------------------
// Público — para quem a peça fala
// ---------------------------------------------------------------------------

export type ChavePublico = "familia" | "investidor" | "casal_jovem" | "alto_padrao";

export type Publico = {
  chave: ChavePublico;
  rotulo: string;
  ajuda: string;
  /** Clima visual: paleta, materiais, elementos de cena. */
  clima: string;
  /** Itens de lazer que, quando existem no cadastro, merecem entrar em cena. */
  lazerPreferido: RegExp;
  /** Tom da copy. */
  tom: string;
};

export const PUBLICOS: Publico[] = [
  {
    chave: "familia",
    rotulo: "Família",
    ajuda: "Espaço, segurança, área para as crianças.",
    clima:
      "luz quente e acolhedora, verde de jardim, texturas de madeira clara, " +
      "sensação de espaço amplo e seguro",
    lazerPreferido: /playground|brinquedoteca|kids|infantil|pet|churrasqueira|quadra|piscina/i,
    tom: "acolhedor e direto, fala de espaço e tranquilidade",
  },
  {
    chave: "investidor",
    rotulo: "Investidor",
    ajuda: "Localização, solidez, liquidez.",
    clima:
      "linhas limpas, tons neutros e azul profundo, materiais sóbrios, " +
      "sensação de bairro consolidado",
    lazerPreferido: /coworking|business|lavanderia|bicicletário|academia/i,
    tom: "objetivo e seguro, sem adjetivo emocional",
  },
  {
    chave: "casal_jovem",
    rotulo: "Casal jovem",
    ajuda: "Primeiro imóvel, praticidade, estilo.",
    clima:
      "contemporâneo e leve, cores claras com um toque de cor, varanda com " +
      "plantas, fim de tarde",
    lazerPreferido: /academia|coworking|lounge|gourmet|pet|piscina|bicicletário/i,
    tom: "leve e próximo, fala de começar uma vida nova",
  },
  {
    chave: "alto_padrao",
    rotulo: "Alto padrão",
    ajuda: "Exclusividade, acabamento, privacidade.",
    clima:
      "materiais nobres (pedra, madeira escura, metal escovado), sombra suave, " +
      "minimalismo, muito respiro no quadro",
    lazerPreferido: /spa|sauna|piscina aquecida|adega|wine|lounge|rooftop|concierge/i,
    tom: "sóbrio e contido, menos é mais",
  },
];

// ---------------------------------------------------------------------------
// As regras fixas — valem para toda peça, sempre
// ---------------------------------------------------------------------------

/**
 * Regras de criativo imobiliário que não dependem de objetivo nem canal.
 * Entram no prompt de imagem por código, e a tela mostra ao corretor quais
 * foram aplicadas — é assim que ele aprende o que faz uma peça funcionar.
 */
export const REGRAS_FIXAS: readonly string[] = [
  "Uma mensagem por peça: um assunto-herói, sem elementos secundários competindo.",
  "Fotorrealismo de arquitetura: lente entre 24 e 35mm, sem distorção nas bordas, câmera na altura dos olhos.",
  "Sem pessoas com rosto reconhecível — direito de imagem e envelhecimento da peça.",
  "Sem texto, placa, letreiro, logotipo ou selo de preço dentro da cena.",
  "Nada fora da ficha: nenhuma característica ou vista que o cadastro não tenha.",
];

/** Texto obrigatório no rodapé de toda arte gerada. */
export const RESSALVA = "Imagem gerada por IA, meramente ilustrativa.";

// ---------------------------------------------------------------------------
// O briefing — junta tudo em uma cena decidida
// ---------------------------------------------------------------------------

export type EntradaDoBriefing = {
  imovel: Empreendimento | null;
  objetivo: ChaveObjetivo;
  canal: ChaveCanal;
  publico: ChavePublico;
  /** O que o corretor quis acrescentar. Opcional. */
  observacoes?: string;
};

export type Briefing = {
  objetivo: Objetivo;
  canal: Canal;
  publico: Publico;
  /** A cena, em português, pronta para virar prompt de imagem. */
  cena: string;
  /** O que a copy pode usar como fato. Só o que está na ficha. */
  fatos: {
    nome: string | null;
    estagio: string | null;
    tipo: string | null;
    bairro: string | null;
    cidade: string | null;
    construtora: string | null;
    tipologias: string | null;
    lazer: string[];
    entregaPrevista: string | null;
    tagline: string | null;
  };
  /** As regras que entraram, para a tela mostrar. */
  regrasAplicadas: string[];
  /** URL da foto real do imóvel a usar como referência, quando fizer sentido. */
  fotoDeReferencia: string | null;
};

export function objetivoPor(chave: string | null | undefined): Objetivo {
  return OBJETIVOS.find((o) => o.chave === chave) ?? OBJETIVOS[0];
}
export function canalPor(chave: string | null | undefined): Canal {
  return CANAIS.find((c) => c.chave === chave) ?? CANAIS[1];
}
export function publicoPor(chave: string | null | undefined): Publico {
  return PUBLICOS.find((p) => p.chave === chave) ?? PUBLICOS[0];
}

/**
 * Do lazer cadastrado, os itens que interessam a este público. Até três: mais
 * que isso vira lista, e cena com lista vira desfile — a lição do catálogo.
 */
export function lazerParaCena(lazer: string[], publico: Publico): string[] {
  const preferidos = lazer.filter((l) => publico.lazerPreferido.test(l));
  const resto = lazer.filter((l) => !publico.lazerPreferido.test(l));
  return [...preferidos, ...resto].slice(0, 3);
}

export function montarBriefing(entrada: EntradaDoBriefing): Briefing {
  const objetivo = objetivoPor(entrada.objetivo);
  const canal = canalPor(entrada.canal);
  const publico = publicoPor(entrada.publico);
  const imovel = entrada.imovel;

  const lazer = imovel ? lazerParaCena(imovel.lazer, publico) : [];
  const regras: string[] = [];
  const partes: string[] = [];

  // 1. O assunto — decidido pelo objetivo, nunca pelo modelo.
  partes.push(`Cena: ${objetivo.assuntoHeroi}.`);
  regras.push(`Assunto-herói de "${objetivo.rotulo}": ${resumoCurto(objetivo.assuntoHeroi)}.`);

  // 2. O imóvel real, com rótulo humano — nunca o enum.
  if (imovel) {
    const estagio = STATUS_LABEL[imovel.status];
    const tipo = TIPO_LABEL[imovel.tipo] ?? imovel.tipo;
    partes.push(
      `Trata-se de ${tipo.toLowerCase()} em ${imovel.bairro}, ${imovel.cidade}, ` +
        `estágio "${estagio}".`,
    );
    if (imovel.status !== "pronto_para_morar") {
      partes.push(
        "Como a obra não está entregue, a imagem é uma perspectiva ilustrativa: " +
          "acabamento coerente com o padrão da construtora, sem detalhes que " +
          "prometam algo específico.",
      );
      regras.push(`Obra em "${estagio}": a peça é perspectiva ilustrativa e leva a ressalva.`);
    }
    if (lazer.length > 0) {
      partes.push(`Lazer que existe neste condomínio e pode aparecer: ${lazer.join(", ")}.`);
      regras.push(`Só o lazer cadastrado pode aparecer: ${lazer.join(", ")}.`);
    } else {
      partes.push("Não há lazer cadastrado: não mostre piscina, academia ou área comum.");
      regras.push("Sem lazer cadastrado: nenhuma área comum entra em cena.");
    }
  }

  // 3. Luz e clima — objetivo decide a hora, público decide o clima.
  partes.push(`Luz: ${objetivo.luz}.`);
  partes.push(`Clima visual para ${publico.rotulo.toLowerCase()}: ${publico.clima}.`);
  regras.push(`Luz de "${objetivo.rotulo}": ${objetivo.luz}.`);
  regras.push(`Clima para ${publico.rotulo.toLowerCase()}: ${resumoCurto(publico.clima)}.`);

  // 4. Composição — o canal decide onde fica o respiro.
  partes.push(`Composição para ${canal.rotulo}: ${canal.respiro}. ${canal.legibilidade}.`);
  regras.push(`Composição de ${canal.rotulo}: ${canal.respiro}.`);

  // 5. O que o corretor acrescentou.
  const obs = entrada.observacoes?.trim();
  if (obs) partes.push(`Pedido adicional do corretor: ${obs}.`);

  // 6. As fixas.
  partes.push(
    "Regras: fotorrealismo de arquitetura, lente 24-35mm sem distorção, câmera " +
      "na altura dos olhos, um assunto só, sem pessoas com rosto reconhecível.",
  );
  regras.push(...REGRAS_FIXAS);

  const fotoDeReferencia = imovel ? fotoParaObjetivo(imovel, objetivo) : null;

  return {
    objetivo,
    canal,
    publico,
    cena: partes.join(" "),
    fatos: imovel
      ? {
          nome: imovel.nome,
          estagio: STATUS_LABEL[imovel.status],
          tipo: TIPO_LABEL[imovel.tipo] ?? imovel.tipo,
          bairro: imovel.bairro,
          cidade: imovel.cidade,
          construtora: imovel.construtora,
          tipologias: resumoDeTipologias(imovel) || null,
          lazer,
          entregaPrevista: imovel.entregaPrevista,
          tagline: imovel.tagline?.trim() || null,
        }
      : {
          nome: null,
          estagio: null,
          tipo: null,
          bairro: null,
          cidade: null,
          construtora: null,
          tipologias: null,
          lazer: [],
          entregaPrevista: null,
          tagline: null,
        },
    regrasAplicadas: regras,
    fotoDeReferencia,
  };
}

/**
 * A foto real que serve de referência para o assunto do objetivo.
 *
 * Procura pelo `alt` nas fotos do imóvel (capa primeiro). Sem casamento, a
 * política é do objetivo: interior aceita a capa; exterior fica sem
 * referência, porque partir de um living para desenhar uma fachada dá ao
 * modelo uma pista falsa — medido na primeira arte, que partiu de
 * `living-03.jpg` para uma peça de lançamento.
 */
export function fotoParaObjetivo(imovel: Empreendimento, objetivo: Objetivo): string | null {
  const regra = objetivo.fotoDeReferencia;
  if (!regra) return null;
  const candidatas = [imovel.capa, ...imovel.galeria].filter((m): m is NonNullable<typeof m> => Boolean(m?.url));
  const casada = candidatas.find((m) => regra.alt.test(m.alt || ""));
  if (casada) return casada.url;
  return regra.senao === "capa" ? (candidatas[0]?.url ?? null) : null;
}

/** Primeira oração, para a lista de regras não virar parágrafo. */
function resumoCurto(texto: string): string {
  const primeira = texto.split(/[,;]/)[0].trim();
  return primeira.length > 70 ? `${primeira.slice(0, 67).trimEnd()}…` : primeira;
}

// ---------------------------------------------------------------------------
// A copy — validação determinística do que a IA escreve
// ---------------------------------------------------------------------------

export type Copy = { titulo: string; apoio: string; cta: string };

export const LIMITE_TITULO = 38;
export const LIMITE_APOIO = 72;

/**
 * O que NÃO pode estar escrito numa peça pública. Cada regex é uma regra de
 * publicidade imobiliária que o corretor não tem obrigação de saber:
 *
 * - valor e condição de pagamento: a tabela muda e a peça fica no ar;
 * - promessa de valorização ou renda: propaganda enganosa por lei (CDC) e
 *   vedada pelo CONAR — "garantido", "rentabilidade de X%";
 * - prazo de entrega: só entra se estiver cadastrado, e aí vem da ficha, não
 *   da cabeça do modelo;
 * - superlativo absoluto sem prova ("o melhor", "o único").
 */
const PROIBIDO_NA_COPY: Array<{ regex: RegExp; motivo: string }> = [
  { regex: /R\$|\d[\d.]*\s*(mil|k)\b|parcel|entrada de|financ|\bjuros\b|desconto/i, motivo: "valor ou condição de pagamento" },
  { regex: /garant|rentab|valoriza|retorno de|\d+\s*%/i, motivo: "promessa de valorização ou renda" },
  { regex: /entrega (em|para|prevista)|\bem \d{4}\b|\bmeses\b/i, motivo: "prazo de entrega" },
  { regex: /\bo melhor\b|\ba melhor\b|\bo único\b|\ba única\b|\bnúmero 1\b|\bimperd[ií]vel\b/i, motivo: "superlativo sem prova" },
];

export function problemasDaCopy(copy: Copy): string[] {
  const problemas: string[] = [];
  const campos: Array<[string, string, number]> = [
    ["título", copy.titulo, LIMITE_TITULO],
    ["apoio", copy.apoio, LIMITE_APOIO],
  ];
  for (const [nome, texto, limite] of campos) {
    if (!texto.trim()) {
      if (nome === "título") problemas.push("título vazio");
      continue;
    }
    if (texto.length > limite) problemas.push(`${nome} com mais de ${limite} caracteres`);
    for (const { regex, motivo } of PROIBIDO_NA_COPY) {
      if (regex.test(texto)) problemas.push(`${nome} traz ${motivo}`);
    }
  }
  if (!copy.cta.trim()) problemas.push("chamada vazia");
  return problemas;
}

/**
 * A copy de reserva, montada só da ficha. É o que sai quando a IA não
 * responde — e é o piso de qualidade: nunca inventa, sempre cabe.
 */
export function copyDeReserva(briefing: Briefing): Copy {
  const { fatos, objetivo } = briefing;
  const titulo = fatos.nome ?? objetivo.rotulo;
  const apoioPartes = [fatos.bairro && fatos.cidade ? `${fatos.bairro}, ${fatos.cidade}` : null, fatos.estagio]
    .filter(Boolean);
  return {
    titulo: titulo.length > LIMITE_TITULO ? `${titulo.slice(0, LIMITE_TITULO - 1).trimEnd()}…` : titulo,
    apoio: apoioPartes.join(" · ").slice(0, LIMITE_APOIO),
    cta: objetivo.ctas[0],
  };
}
