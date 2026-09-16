import "server-only";

import { algumProvedorLeImagem, chamarLlmJson } from "@/lib/whatsapp/llm";
import {
  conferir,
  instrucaoDaGramatica,
  instrucaoDeEdicao,
  instrucaoDeEdicaoComVisao,
  PISO_DE_EDICAO,
  PISO_DE_PROMPT,
  type ChaveSecao,
} from "./gramatica";
import { instrucaoDoOficio, type Dominio } from "./oficio";

/**
 * O tradutor: pega o que o corretor escreveu e devolve um pedido de imagem
 * decente, EM PORTUGUÊS.
 *
 * ## Por que ele é o produto, e não um detalhe
 *
 * O ChatGPT gera imagem com o MESMO modelo que usamos (`gpt-image-2`). A
 * diferença de resultado não é o modelo — é que ele reescreve o pedido antes
 * de mandar para o gerador. Nós mandávamos cru, e foi assim que a palavra
 * `Torre.` virou uma imagem paga em 09/09/2026.
 *
 * ## Por que português, e por que é ESTE texto que vai
 *
 * A versão anterior devolvia `promptEn` (o que era enviado) e `explicacaoPt`
 * (uma paráfrase que o corretor lia): ele aprovava no escuro. O comentário da
 * tela já dizia "esconder do corretor seria tirar dele a chance de corrigir" —
 * e entregava o texto em inglês, dentro de um `<p>` onde não se digita. Dar a
 * chance de corrigir num idioma que ele não escreve, num elemento onde não se
 * escreve, é o mesmo que não dar.
 *
 * Aqui não há duas versões. O que ele lê é o que o provedor recebe.
 *
 * ## Falha é degradação DECLARADA
 *
 * Sem motor, com timeout ou com JSON torto, o texto do corretor segue — e
 * `daIa: false` obriga a tela a dizer isso. O comportamento antigo era mandar
 * o texto cru com etiqueta de melhorado, que é exatamente como `Torre.`
 * passou. Falhar fechado aqui também seria errado: trocaria uma imagem pior
 * por imagem nenhuma.
 */

/** Teto curto: isto acontece com a pessoa olhando para a tela. */
const ORCAMENTO_MS = 12_000;

/**
 * Com foto, o modelo ainda precisa BAIXAR e olhar as imagens antes de
 * escrever — por isso o teto sobe. Não sobe mais que isso porque quem está
 * esperando é uma pessoa: passar de 20s numa tela de chat é indistinguível
 * de travamento, e a degradação (texto cru do corretor) é pior que esperar.
 */
const ORCAMENTO_COM_FOTO_MS = 20_000;

/**
 * Teto de fotos que viajam na chamada.
 *
 * O mesmo 4 do composer, da action e da rota de gerar — o número tem de
 * bater nos quatro, senão o tradutor enxerga um conjunto e o gerador recebe
 * outro, e o prompt passa a falar de "a 4ª foto" que nunca chegou lá.
 */
const MAX_FOTOS_NA_CHAMADA = 4;

/**
 * Abaixo disto o modelo não melhorou nada.
 *
 * Substituir o que o corretor escreveu por duas palavras é pior que não ter
 * tentado — e é diferente do `PISO_DE_PROMPT`, que mede se o texto FINAL serve
 * para gerar. Este mede se a resposta do motor serve para substituir.
 */
const MINIMO_ACEITAVEL = 60;

/**
 * O mesmo mínimo, quando há foto — e por que ele desce junto com o piso.
 *
 * Com `MINIMO_ACEITAVEL` fixo em 60 abria uma ZONA MORTA entre 40 e 59: uma
 * instrução de edição legítima ("Deixe a 1ª foto com o enquadramento e a luz
 * da 2ª foto.", 55 caracteres) era jogada fora, o texto cru do corretor voltava
 * no lugar dela e a tela dizia "não consegui melhorar seu pedido" — sobre uma
 * reescrita que tinha ficado boa. Achado escrevendo o teste, não em produção.
 */
const MINIMO_DE_EDICAO = PISO_DE_EDICAO;

/** Prompt gigante dilui o assunto, que é justamente o que viemos consertar. */
const TETO = 1400;

export type EntradaDoTradutor = {
  /** O que o corretor escreveu agora. */
  pedido: string;
  /** Fatos do catálogo, de `fatosDoImovel`. Lista vazia é normal e esperado. */
  fatos: string[];
  /**
   * O que o corretor respondeu aos chips do engenheiro, em pares.
   *
   * Vai como PAR e não como texto solto porque "Pôr do sol" sozinho não diz a
   * que pergunta responde — e o motor precisa saber que aquilo é a hora do dia
   * e não a cor de um móvel. Lista vazia é o caso comum (ele foi direto).
   */
  respostas?: { pergunta: string; escolha: string }[];
  /** O prompt aprovado da rodada anterior, quando isto é um ajuste. */
  promptAnterior?: string | null;
  /**
   * QUANTAS fotos o corretor anexou. Zero é criação; uma ou mais é edição.
   *
   * É um número e não um booleano porque a instrução precisa nomear as fotos
   * pela POSIÇÃO — "a 1ª", "a 2ª" — que é a única forma de "deixe a primeira
   * parecida com a segunda" chegar íntegro ao gerador, o único que as vê.
   */
  fotosDeReferencia?: number;
  /**
   * As URLs públicas das fotos, na MESMA ordem em que o corretor as anexou.
   *
   * Quando existem e há provedor com visão, elas viajam na chamada e o
   * modelo OLHA para elas. Quando não — sem chave do motor, ou chamador que
   * não as tem —, o caminho cego continua inteiro e testado: é a degradação,
   * não um erro.
   */
  urlsDeReferencia?: string[];
  /**
   * Sobre o que é o pedido. `"livre"` é o padrão conservador.
   *
   * O Estúdio deixou de assumir que todo pedido é de imóvel, e o ofício
   * segue a mesma régua: mandar "verticais do prédio aprumadas" para um
   * retrato de cachorro instrui sobre um assunto que não está ali — o mesmo
   * defeito que `conferir` teve de desfazer.
   */
  dominio?: Dominio;
};

export type PromptTraduzido = {
  /** Em português. É exatamente o que o provedor recebe. */
  prompt: string;
  /** `false` quando o motor não respondeu e o texto voltou como veio. */
  daIa: boolean;
  /**
   * O modelo OLHOU para as fotos ao escrever isto?
   *
   * A tela precisa distinguir os dois casos: "escrevi vendo suas fotos" e
   * "escrevi sem poder vê-las" produzem textos de confiança diferente, e
   * esconder a diferença é o mesmo pecado do `daIa` — aprovar no escuro.
   */
  viuAsFotos: boolean;
  /** Seções da gramática que o texto final não cobriu. */
  naoCobriu: ChaveSecao[];
  /** Curto demais para gerar sem confirmação explícita. */
  abaixoDoPiso: boolean;
};

function montarPromptDoMotor(e: EntradaDoTradutor, verFotos: boolean): string {
  const blocos: string[] = [
    "Você reescreve pedidos de imagem para uma imobiliária brasileira.",
    "",
    `O corretor escreveu: "${e.pedido.trim()}"`,
  ];

  if (e.promptAnterior?.trim()) {
    blocos.push(
      "",
      "Este é o pedido que já estava aprovado:",
      e.promptAnterior.trim(),
      "",
      "MUDE APENAS o que o corretor pediu agora e repita todo o resto como está.",
      "Edição repetida muda detalhe que ninguém pediu — restate o que fica.",
    );
  }

  const respostas = (e.respostas ?? []).filter((r) => r.escolha.trim());
  if (respostas.length > 0) {
    blocos.push(
      "",
      "O corretor já respondeu isto — respeite, não contrarie:",
      ...respostas.map((r) => `- ${r.pergunta.trim()} ${r.escolha.trim()}`),
    );
  }

  if (e.fatos.length > 0) {
    blocos.push(
      "",
      "Fatos verdadeiros deste imóvel (use o que ajudar; não invente o resto):",
      ...e.fatos.map((f) => `- ${f}`),
    );
  }

  const fotos = e.fotosDeReferencia ?? 0;
  const regime = fotos > 0 ? "edicao" : "criacao";

  blocos.push(
    "",
    fotos === 0
      ? instrucaoDaGramatica()
      : verFotos
        ? instrucaoDeEdicaoComVisao(fotos)
        : instrucaoDeEdicao(fotos),
    "",
    instrucaoDoOficio(regime, e.dominio ?? "livre"),
    "",
    "O que NUNCA entra:",
    "- Metragem, número de dormitórios, andar, preço ou condição de pagamento que",
    "  não estejam nos fatos acima. Imagem com número vira promessa ao cliente.",
    "- Pessoas com rosto reconhecível.",
    "- Nome, placa, letreiro ou logotipo que o corretor não tenha escrito.",
    "",
    'Responda apenas com JSON: {"prompt": "o pedido reescrito em português"}',
  );

  return blocos.join("\n");
}

function textoDoJson(json: unknown, fotos: number): string | null {
  if (!json || typeof json !== "object") return null;
  const bruto = (json as { prompt?: unknown }).prompt;
  if (typeof bruto !== "string") return null;
  const texto = bruto.trim().replace(/\s+/g, " ");
  if (texto.length < (fotos > 0 ? MINIMO_DE_EDICAO : MINIMO_ACEITAVEL)) return null;
  return texto.slice(0, TETO);
}

function fechar(
  prompt: string,
  daIa: boolean,
  fotos: number,
  viuAsFotos: boolean,
): PromptTraduzido {
  const modo = fotos > 0 ? "edicao" : "criacao";
  return {
    prompt,
    daIa,
    viuAsFotos,
    naoCobriu: conferir(prompt, modo),
    abaixoDoPiso: prompt.trim().length < (modo === "edicao" ? PISO_DE_EDICAO : PISO_DE_PROMPT),
  };
}

export async function traduzirPedido(entrada: EntradaDoTradutor): Promise<PromptTraduzido> {
  const original = entrada.pedido.trim();
  const fotos = entrada.fotosDeReferencia ?? 0;

  /*
   * A decisão de OLHAR é tomada antes de escrever uma linha do prompt.
   *
   * Prometer "você está vendo as fotos" a um provedor de texto é exatamente
   * a instrução impossível que fez este módulo inventar uma sala de estar.
   * Três condições, e as três precisam valer: há fotos anexadas, temos as
   * URLs delas, e existe provedor configurado que lê imagem.
   */
  const urls = (entrada.urlsDeReferencia ?? []).filter(Boolean).slice(0, MAX_FOTOS_NA_CHAMADA);
  const verFotos = fotos > 0 && urls.length > 0 && algumProvedorLeImagem();

  // Sem pedido não há o que traduzir, e uma chamada aqui seria gasto puro.
  if (!original) return fechar("", false, fotos, false);

  const r = await chamarLlmJson(montarPromptDoMotor(entrada, verFotos), {
    temperature: 0.7,
    orcamentoMs: verFotos ? ORCAMENTO_COM_FOTO_MS : ORCAMENTO_MS,
    imagens: verFotos ? urls : undefined,
  });

  if (!r.ok) return fechar(original, false, fotos, false);

  const texto = textoDoJson(r.json, fotos);
  return texto
    ? fechar(texto, true, fotos, verFotos)
    : fechar(original, false, fotos, false);
}
