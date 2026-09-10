import "server-only";

import { chamarLlmJson } from "@/lib/whatsapp/llm";
import { conferir, instrucaoDaGramatica, PISO_DE_PROMPT, type ChaveSecao } from "./gramatica";

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
 * Abaixo disto o modelo não melhorou nada.
 *
 * Substituir o que o corretor escreveu por duas palavras é pior que não ter
 * tentado — e é diferente do `PISO_DE_PROMPT`, que mede se o texto FINAL serve
 * para gerar. Este mede se a resposta do motor serve para substituir.
 */
const MINIMO_ACEITAVEL = 60;

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
  /** Há foto de referência? Muda a instrução: é edição, não criação. */
  temReferencia?: boolean;
};

export type PromptTraduzido = {
  /** Em português. É exatamente o que o provedor recebe. */
  prompt: string;
  /** `false` quando o motor não respondeu e o texto voltou como veio. */
  daIa: boolean;
  /** Seções da gramática que o texto final não cobriu. */
  naoCobriu: ChaveSecao[];
  /** Curto demais para gerar sem confirmação explícita. */
  abaixoDoPiso: boolean;
};

function montarPromptDoMotor(e: EntradaDoTradutor): string {
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

  if (e.temReferencia) {
    blocos.push(
      "",
      "Há uma FOTO de referência. Descreva a cena a partir dela: o que você",
      "escrever é o que deve MUDAR ou ser enfatizado, não uma cena nova.",
    );
  }

  blocos.push(
    "",
    instrucaoDaGramatica(),
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

function textoDoJson(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const bruto = (json as { prompt?: unknown }).prompt;
  if (typeof bruto !== "string") return null;
  const texto = bruto.trim().replace(/\s+/g, " ");
  if (texto.length < MINIMO_ACEITAVEL) return null;
  return texto.slice(0, TETO);
}

function fechar(prompt: string, daIa: boolean): PromptTraduzido {
  return {
    prompt,
    daIa,
    naoCobriu: conferir(prompt),
    abaixoDoPiso: prompt.trim().length < PISO_DE_PROMPT,
  };
}

export async function traduzirPedido(entrada: EntradaDoTradutor): Promise<PromptTraduzido> {
  const original = entrada.pedido.trim();
  // Sem pedido não há o que traduzir, e uma chamada aqui seria gasto puro.
  if (!original) return fechar("", false);

  const r = await chamarLlmJson(montarPromptDoMotor(entrada), {
    temperature: 0.7,
    orcamentoMs: ORCAMENTO_MS,
  });

  if (!r.ok) return fechar(original, false);

  const texto = textoDoJson(r.json);
  return texto ? fechar(texto, true) : fechar(original, false);
}
