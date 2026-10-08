/**
 * Cada mensagem da lista sai escrita de um jeito diferente, e isso é
 * CONFERIDO antes do envio (08/10/2026).
 *
 * Medido nas listas frias da semana em que o WhatsApp restringiu a conta da
 * Bruna por "mensagens automáticas ou em massa": 65 das 114 mensagens dela
 * saíram idênticas (o teste A/B suspendia a reescrita), e quando a IA
 * reescrevia, os textos convergiam para o mesmo molde. A mediana ficou em
 * 0,95 de semelhança com uma mensagem anterior do mesmo número, e um mesmo
 * texto saiu 8 vezes. Pedir variação no prompt não basta: instrução de prompt
 * é probabilística, e a conferência abaixo é determinística.
 *
 * Módulo PURO: o disparador, a prévia da tela e os testes usam a mesma régua.
 * Três partes:
 * 1. a SEMELHANÇA entre dois textos, sem contar o que repete de propósito
 *    (o nome do imóvel, o bairro, o link, o nome da pessoa);
 * 2. a CONFERÊNCIA da reescrita: os fatos do original continuam lá, nada foi
 *    inventado (número, link, valor) e não sobrou frase de robô;
 * 3. o PEDIDO à IA, com um estilo sorteado e as mensagens recentes do número,
 *    que ela não pode imitar.
 */
import { momentoEmSaoPaulo } from "./antiBan";
import { contemValor } from "./semValores";
import type { ContextoTemplate } from "./listaDeTransmissao";

// ---------------------------------------------------------------- semelhança

/**
 * A partir daqui duas mensagens contam como a mesma.
 *
 * Calibrado em 08/10/2026 sobre o texto real da lista do Dom Parque. Trinta
 * variações boas escritas à mão ficaram com mediana de 0,27 entre si e a mais
 * parecida em 0,62. Cópias com duas ou três palavras trocadas ("acabou de
 * sair" por "acabou de surgir") ficaram entre 0,79 e 0,96. O limite fica no
 * meio, com folga dos dois lados.
 */
export const LIMITE_DE_SEMELHANCA = 0.7;

/** A comparação usa as mensagens dos últimos 30 dias do número, até 300. */
export const DIAS_DE_COMPARACAO = 30;
export const TEXTOS_DE_COMPARACAO = 300;

/** Uma mensagem que o número já mandou (ou que já está pronta para sair). */
export type TextoAnterior = {
  /** O item da fila, quando veio dela: a mensagem não se compara consigo. */
  id?: string;
  texto: string;
  /** O nome de quem recebeu, para sair da conta como o nome do candidato. */
  nomes?: readonly string[];
};

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** O texto em palavras comparáveis: sem acento, caixa, pontuação, link nem marcador. */
export function palavrasDoTexto(texto: string): string[] {
  return semAcento((texto ?? "").toLowerCase())
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\{[a-z_]+\}/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function semSequencia(palavras: string[], alvo: string[]): string[] {
  if (alvo.length === 0) return palavras;
  const saida: string[] = [];
  for (let i = 0; i < palavras.length; ) {
    let casa = i + alvo.length <= palavras.length;
    for (let k = 0; casa && k < alvo.length; k++) {
      if (palavras[i + k] !== alvo[k]) casa = false;
    }
    if (casa) {
      i += alvo.length;
      continue;
    }
    saida.push(palavras[i]);
    i++;
  }
  return saida;
}

/**
 * As palavras do texto, sem os trechos que repetem de propósito.
 *
 * Nome do imóvel, bairro e o nome da pessoa aparecem em toda mensagem da
 * lista, e é certo que apareçam. Contá-los faria duas variações boas parecerem
 * cópias; tirá-los deixa na conta só o que a reescrita pode mudar.
 */
export function palavrasSemOsFatos(texto: string, fatos: readonly string[]): string[] {
  let palavras = palavrasDoTexto(texto);
  const alvos = fatos
    .map((f) => palavrasDoTexto(f))
    .filter((a) => a.length > 0)
    .sort((a, b) => b.length - a.length);
  for (const alvo of alvos) palavras = semSequencia(palavras, alvo);
  return palavras;
}

function trincas(p: string[]): Set<string> {
  if (p.length < 3) return new Set(p.length ? [p.join(" ")] : []);
  const s = new Set<string>();
  for (let i = 0; i + 2 < p.length; i++) s.add(`${p[i]} ${p[i + 1]} ${p[i + 2]}`);
  return s;
}

function maiorSubsequenciaComum(a: string[], b: string[]): number {
  let anterior = new Array<number>(b.length + 1).fill(0);
  for (const x of a) {
    const atual = new Array<number>(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      atual[j] = x === b[j - 1] ? anterior[j - 1] + 1 : Math.max(anterior[j], atual[j - 1]);
    }
    anterior = atual;
  }
  return anterior[b.length];
}

/**
 * Semelhança entre duas listas de palavras, de 0 a 1.
 *
 * É a maior de duas medidas. Trincas de palavras pegam frases inteiras
 * repetidas. A subsequência comum (as palavras na mesma ordem, com outras no
 * meio) pega o molde com sinônimos, que as trincas sozinhas deixavam passar:
 * as reescritas antigas da IA trocavam uma palavra a cada três e ficavam entre
 * 0,25 e 0,40 nas trincas, embora fossem o mesmo texto para quem lê.
 */
export function semelhancaDePalavras(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return a.length === b.length ? 1 : 0;
  const ta = trincas(a);
  const tb = trincas(b);
  let comuns = 0;
  for (const t of ta) if (tb.has(t)) comuns++;
  const uniao = ta.size + tb.size - comuns;
  const jaccard = uniao > 0 ? comuns / uniao : 0;
  const subsequencia = maiorSubsequenciaComum(a, b) / ((a.length + b.length) / 2);
  return Math.max(jaccard, subsequencia);
}

/** A semelhança entre dois textos, sem contar os fatos e os nomes de cada um. */
export function semelhancaEntreTextos(
  a: { texto: string; nomes?: readonly string[] },
  b: { texto: string; nomes?: readonly string[] },
  fatos: readonly string[] = [],
): number {
  return semelhancaDePalavras(
    palavrasSemOsFatos(a.texto, [...fatos, ...(a.nomes ?? [])]),
    palavrasSemOsFatos(b.texto, [...fatos, ...(b.nomes ?? [])]),
  );
}

export type Comparacao = {
  /** A maior semelhança encontrada (0 quando não há com o que comparar). */
  semelhanca: number;
  /** O índice, em `anteriores`, da mensagem mais parecida, ou -1. */
  indice: number;
};

/** A mensagem anterior mais parecida com este texto. */
export function maiorSemelhanca(
  texto: string,
  nomes: readonly string[],
  anteriores: readonly TextoAnterior[],
  fatos: readonly string[] = [],
): Comparacao {
  const candidato = palavrasSemOsFatos(texto, [...fatos, ...nomes]);
  let melhor: Comparacao = { semelhanca: 0, indice: -1 };
  anteriores.forEach((a, indice) => {
    const s = semelhancaDePalavras(candidato, palavrasSemOsFatos(a.texto, [...fatos, ...(a.nomes ?? [])]));
    if (s > melhor.semelhanca) melhor = { semelhanca: s, indice };
  });
  return melhor;
}

/** A semelhança como a tela mostra: "62%". */
export function emPorcentagem(semelhanca: number): string {
  return `${Math.round(Math.max(0, Math.min(1, semelhanca)) * 100)}%`;
}

// --------------------------------------------------------------------- fatos

/**
 * Os trechos que precisam continuar escritos igual, a partir do cadastro da
 * lista, do corretor e da casa. Os que o texto não cita são filtrados depois
 * (`fatosQueOTextoCita`), na hora de conferir.
 */
export function fatosDaLista(p: {
  contexto?: ContextoTemplate | null;
  imovelNome?: string | null;
  corretorNome?: string | null;
  nomeDaCasa?: string | null;
}): string[] {
  const ctx = p.contexto ?? {};
  // Nomes de corretor seguem "Casa - Pessoa" ("Cristal - Bruna"): cada parte
  // com cara de nome é um fato próprio.
  const doCorretor = (p.corretorNome ?? "")
    .split(/\s+/)
    .filter((t) => /^\p{L}{3,}$/u.test(t));
  const todos = [
    ctx.imovel,
    p.imovelNome,
    ctx.bairro,
    ctx.cidade,
    ctx.dormitorios,
    ctx.a_partir_de,
    ctx.corretor,
    p.nomeDaCasa,
    ...doCorretor,
  ];
  return [...new Set(todos.map((t) => t?.trim()).filter((t): t is string => Boolean(t)))];
}

/** Os fatos que este texto cita (sem acento nem caixa, palavra inteira). */
export function fatosQueOTextoCita(texto: string, fatos: readonly string[]): string[] {
  const corpo = ` ${palavrasDoTexto(texto).join(" ")} `;
  return [...new Set(fatos.map((f) => f.trim()).filter(Boolean))].filter((f) => {
    const p = palavrasDoTexto(f).join(" ");
    return p.length > 0 && corpo.includes(` ${p} `);
  });
}

function contemTrecho(texto: string, trecho: string): boolean {
  return fatosQueOTextoCita(texto, [trecho]).length > 0;
}

const URL_NO_TEXTO = /https?:\/\/[^\s)]+/g;

function linksDe(texto: string): string[] {
  return [...texto.matchAll(URL_NO_TEXTO)].map((m) => m[0].replace(/[.,!?;:]+$/, ""));
}

function numerosDe(texto: string): string[] {
  const semLinks = texto.replace(URL_NO_TEXTO, " ").replace(/\{[a-z_]+\}/gi, " ");
  return [...semLinks.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => m[0].replace(/[.,]/g, ""));
}

function marcadoresDe(texto: string): string {
  return (texto.match(/\{[a-z_]+\}/gi) ?? []).map((m) => m.toLowerCase()).sort().join(" ");
}

function emojisEm(texto: string): number {
  return (texto.match(/\p{Extended_Pictographic}/gu) ?? []).length;
}

/**
 * Jeito de escrever que denuncia mensagem automática, e que só vale quando o
 * próprio corretor o usou. Saíram das reescritas reais da IA ("Prezado
 * Matheus, espero que esteja bem", "surgiu uma oportunidade exclusiva").
 */
const FRASES_DE_ROBO: RegExp[] = [
  /\bprezad[oa]s?\b/i,
  /\bestimad[oa]s?\b/i,
  /\bcar[oa]s?\s+client/i,
  /\bespero\s+que\s+(voc[eê]\s+)?(esteja|est[aá])\s+bem\b/i,
  /\bgostar[ií](a|amos)\s+de\s+(informar|comunicar|apresentar|compartilhar)\b/i,
  /\bvenho\s+(por\s+meio|atrav[eé]s)\s+des[ts]a\b/i,
  /\batenciosamente\b/i,
  /\bn[aã]o\s+perca\s+(essa|esta)\s+(oportunidade|chance)\b/i,
  /\boportunidade\s+(única|unica|imperd[ií]vel|exclusiva)\b/i,
  /\b(condi[cç](ão|ao|ões|oes)|pre[cç]os?)\s+especia(l|is)\b/i,
  /\bcontato\s+sem\s+nome\b/i,
  /\bwhatsapp\s*\d/i,
];

/**
 * O que está errado na reescrita, em português curto (vai para a próxima
 * tentativa da IA e para o registro), ou null quando ela serve.
 */
export function problemaDaVariacao(p: {
  original: string;
  variacao: string;
  fatos: readonly string[];
  /** O nome que o original usa para a pessoa, quando usa. */
  nome: string | null;
}): string | null {
  const original = p.original.trim();
  const variacao = p.variacao.trim();
  if (variacao.length < 15) return "veio vazia";
  if (/\*\*|^#{1,6}\s/m.test(variacao)) return "veio com formatação de markdown";

  const teto = Math.max(Math.round(original.length * 1.5), original.length + 80);
  if (variacao.length > teto) {
    return `ficou longa demais (${variacao.length} caracteres para um original de ${original.length})`;
  }
  if (original.length > 80 && variacao.length < Math.round(original.length * 0.5)) {
    return "encurtou demais e perdeu parte do conteúdo";
  }

  for (const fato of fatosQueOTextoCita(original, p.fatos)) {
    if (!contemTrecho(variacao, fato)) return `faltou "${fato}" escrito igual`;
  }
  if (marcadoresDe(original) !== marcadoresDe(variacao)) {
    return marcadoresDe(original)
      ? `os marcadores mudaram (o original tem ${marcadoresDe(original)})`
      : "inventou um marcador entre chaves";
  }

  const linksDoOriginal = linksDe(original);
  const linksDaVariacao = linksDe(variacao);
  if (linksDoOriginal.some((l) => !linksDaVariacao.includes(l))) return "faltou o link";
  if (linksDaVariacao.some((l) => !linksDoOriginal.includes(l))) return "inventou um link";

  if (p.nome && contemTrecho(original, p.nome) && !contemTrecho(variacao, p.nome)) {
    return `não chamou a pessoa de "${p.nome}"`;
  }

  const numerosDoOriginal = new Set(numerosDe(original));
  const inventado = numerosDe(variacao).find((n) => !numerosDoOriginal.has(n));
  if (inventado) return `inventou o número ${inventado}`;
  if (!contemValor(original) && contemValor(variacao)) return "falou valor";

  for (const frase of FRASES_DE_ROBO) {
    const achou = variacao.match(frase);
    if (achou && !frase.test(original)) return `usou frase de mensagem automática ("${achou[0]}")`;
  }
  if (emojisEm(variacao) > emojisEm(original) + 1) return "pôs emoji demais";
  if (/\?/.test(original) && !/\?/.test(variacao)) return "tirou a pergunta";
  return null;
}

/** Troca os nomes de quem recebeu por [nome], para mostrar a mensagem à IA. */
export function mascararNomes(texto: string, nomes: readonly string[]): string {
  let saida = texto;
  const ordenados = [...new Set(nomes.map((n) => n.trim()).filter((n) => n.length >= 2))].sort(
    (a, b) => b.length - a.length,
  );
  for (const nome of ordenados) {
    const escapado = nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    saida = saida.replace(new RegExp(`(?<![\\p{L}])${escapado}(?![\\p{L}])`, "giu"), "[nome]");
  }
  return saida;
}

// ---------------------------------------------------------------- saudação

export type Saudacao = "bom dia" | "boa tarde" | "boa noite";

/** A saudação certa para a hora de São Paulo. */
export function saudacaoDoHorario(agora: Date): Saudacao {
  const { hora } = momentoEmSaoPaulo(agora);
  if (hora >= 5 && hora < 12) return "bom dia";
  if (hora >= 12 && hora < 18) return "boa tarde";
  return "boa noite";
}

function comMesmaCaixa(original: string, novo: string): string {
  if (original === original.toUpperCase() && /\p{L}/u.test(original)) return novo.toUpperCase();
  if (/^\p{Lu}/u.test(original)) return novo.charAt(0).toUpperCase() + novo.slice(1);
  return novo;
}

/**
 * "Bom dia" às 15h vira "Boa tarde", na hora do ENVIO.
 *
 * A lista anda devagar de propósito (35 a 75s entre mensagens, ao longo do
 * dia), então o "Bom dia" que o corretor escreveu de manhã sairia errado à
 * tarde. E a reescrita pode ficar pronta num dia e sair no outro, quando a
 * cota acaba no meio. A troca é feita no último instante antes do envio, com o
 * relógio de São Paulo, e acerta o artigo: "tenha um bom dia" vira "tenha uma
 * boa tarde".
 */
export function ajustarSaudacaoAoHorario(texto: string, agora: Date): string {
  const certa = saudacaoDoHorario(agora);
  const artigoCerto = certa === "bom dia" ? "um" : "uma";
  return texto
    .replace(
      /\b(um|uma)(\s+)(bom\s+dia|boa\s+tarde|boa\s+noite)\b/gi,
      (_t, artigo: string, espaco: string, saudacao: string) =>
        `${comMesmaCaixa(artigo, artigoCerto)}${espaco}${comMesmaCaixa(saudacao, certa)}`,
    )
    .replace(/\b(bom\s+dia|boa\s+tarde|boa\s+noite)\b/gi, (saudacao: string) => comMesmaCaixa(saudacao, certa));
}

// ------------------------------------------------------------- pedido à IA

type Diretriz = { texto: string; precisaDeNome?: boolean; mexeNaAbertura?: boolean };

/**
 * Jeitos de abrir e de organizar a mensagem. Um de cada é sorteado por
 * mensagem: a IA sozinha volta sempre ao mesmo molde (foi o que se mediu), e
 * a combinação muda o esqueleto do texto, não só as palavras.
 */
const ABERTURAS: Diretriz[] = [
  { texto: "abra com um cumprimento curto e o primeiro nome", precisaDeNome: true },
  { texto: "abra direto pelo assunto, sem cumprimento elaborado" },
  { texto: "abra perguntando, em poucas palavras, se está tudo bem" },
  { texto: 'abra com o primeiro nome seguido de vírgula, sem "oi"', precisaDeNome: true },
  { texto: 'abra com "oi" ou "olá" e deixe o nome para o meio da frase', precisaDeNome: true },
];

const CORPOS: Diretriz[] = [
  { texto: "use frases bem curtas, como quem digita no celular" },
  { texto: "troque as palavras principais por sinônimos naturais" },
  { texto: "junte as informações numa frase só antes da pergunta" },
  { texto: "mude a ordem das ideias, deixando a pergunta no final", mexeNaAbertura: true },
  { texto: "separe em dois parágrafos curtos, com uma linha em branco entre eles", mexeNaAbertura: true },
];

/**
 * O estilo desta mensagem, a partir de uma semente (o disparador sorteia; o
 * teste fixa). No teste A/B a abertura é o que está sendo medido: a IA só troca
 * as palavras, sem mexer no jeito de abrir.
 */
export function estiloDaVariacao(
  semente: number,
  op: { temNome: boolean; manterAbertura: boolean },
): string[] {
  const s = Math.abs(Math.floor(semente));
  const corpos = CORPOS.filter((c) => !op.manterAbertura || !c.mexeNaAbertura);
  const corpo = corpos[s % corpos.length].texto;
  if (op.manterAbertura) return [corpo];
  const aberturas = ABERTURAS.filter((a) => op.temNome || !a.precisaDeNome);
  const abertura = aberturas[Math.floor(s / corpos.length) % aberturas.length].texto;
  return [abertura, corpo];
}

export type PedidoDeVariacao = {
  original: string;
  nome: string | null;
  /** Os fatos que o original cita (`fatosQueOTextoCita`). */
  fatos: readonly string[];
  /** Mensagens recentes do número, já com os nomes mascarados. */
  recentes: readonly string[];
  estilo: readonly string[];
  manterAbertura: boolean;
  tentativaAnterior?: { problema: string; parecidaCom?: string | null } | null;
};

/** Quantas mensagens recentes vão no pedido como exemplo do que não repetir. */
export const RECENTES_NO_PEDIDO = 3;

export function promptDeVariacao(p: PedidoDeVariacao): string {
  const teto = Math.max(Math.round(p.original.length * 1.3), p.original.length + 40);
  const linhas: (string | null)[] = [
    "Você reescreve uma mensagem de WhatsApp que um corretor de imóveis vai mandar para uma pessoa da carteira dele.",
    "A mesma mensagem vai para muita gente, e o WhatsApp restringe o número que manda texto repetido. Cada versão precisa parecer digitada de novo pelo corretor: outras palavras e outra construção, mesma intenção.",
    "",
    "Mensagem original:",
    p.original,
    "",
    "Regras:",
    "- mantenha a intenção, as informações e o pedido final do original; não acrescente nada que não esteja nele (nada de preço, prazo, desconto, condição especial, urgência ou característica do imóvel);",
    p.fatos.length > 0
      ? `- escreva estes trechos exatamente assim: ${p.fatos.map((f) => `"${f}"`).join(", ")};`
      : null,
    /\{horarios\}/i.test(p.original)
      ? "- mantenha o marcador {horarios} exatamente assim (ele vira os horários livres na hora do envio);"
      : null,
    p.nome
      ? `- chame a pessoa de "${p.nome}", uma vez;`
      : '- não sabemos o nome desta pessoa: não cite nome nenhum, e nunca escreva "cliente", "prezado(a)" ou um nome inventado;',
    '- tom de WhatsApp entre pessoas: sem "Prezado", sem "espero que esteja bem", sem "gostaria de informar", sem markdown, no máximo um emoji;',
    `- até ${teto} caracteres;`,
    ...p.estilo.map((e) => `- ${e};`),
    p.manterAbertura
      ? "- esta mensagem faz parte de um teste entre duas aberturas: mantenha o mesmo jeito de abrir e o mesmo tipo de pergunta final do original, mudando só as palavras;"
      : null,
  ];

  const recentes = p.recentes.slice(0, RECENTES_NO_PEDIDO).filter((r) => r.trim());
  if (recentes.length > 0) {
    linhas.push(
      "",
      "Mensagens que este número já mandou. A sua precisa abrir, se organizar e terminar de um jeito diferente de todas:",
      ...recentes.map((r, i) => `${i + 1}. ${r.replace(/\s+/g, " ").trim()}`),
    );
  }
  if (p.tentativaAnterior) {
    linhas.push("", `A tentativa anterior foi recusada: ${p.tentativaAnterior.problema}.`);
    if (p.tentativaAnterior.parecidaCom) {
      linhas.push(`Ela ficou parecida demais com esta: ${p.tentativaAnterior.parecidaCom.replace(/\s+/g, " ").trim()}`);
    }
    linhas.push("Escreva de outro jeito.");
  }
  linhas.push("", 'Responda só JSON: {"mensagem": "o texto reescrito"}');
  return linhas.filter((l): l is string => l !== null).join("\n");
}

// ------------------------------------------------- quando não dá para sair

/** Item pendente que espera a IA voltar para não sair repetido. */
export const MOTIVO_TEXTO_SEM_IA =
  "Esperando a IA reescrever: sem ela, esta mensagem sairia igual a outra que o número já mandou.";

/** Item pendente cuja reescrita ainda não ficou diferente o bastante. */
export const MOTIVO_TEXTO_PARECIDO =
  "A IA ainda não conseguiu escrever esta mensagem diferente das anteriores. Ela tenta de novo no próximo ciclo.";

/** Depois de tantos ciclos sem texto próprio, a lista pausa sozinha. */
export const CICLOS_ATE_PAUSAR = 4;

export const MOTIVO_PAUSA_POR_TEXTO =
  "Pausada sozinha: a IA tentou várias vezes e não conseguiu escrever as próximas mensagens diferentes das que o número já mandou. Texto repetido em massa é o que o WhatsApp restringe. Deixe a mensagem mais longa ou mude a abertura antes de retomar.";
