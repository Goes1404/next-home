import { normalizar } from "./normalizarFala";

/**
 * "Acho que você mandou errado": DÚVIDA, não pedido para parar (08/10/2026).
 *
 * Medido na lista do Ramos: o cliente respondeu à primeira mensagem com
 * "Bom dia.. acho que você mandou errado". A regex de recusa não casa (ele
 * não disse "número errado"), o filtro largo mandou a frase para a IA por
 * causa de "errado", e a instrução da IA dizia que "número errado" é pedido
 * para parar: ela decidiu `parada` com 0,90 de confiança. A assistente se
 * despediu ("Não enviarei mais mensagens...") e o lead virou "não contatar",
 * em quem só tinha uma dúvida e que o corretor assumiu oito segundos depois.
 *
 * Dúvida sobre o CONTATO (quem escreve, por quê, se era para ele) vem antes
 * de qualquer conversa, e a resposta certa é dizer quem escreve e por quê, e
 * oferecer parar. Quem decide se para é ele, na fala seguinte, e aí o
 * detector de recusa já entende: "não" depois de "quer continuar
 * recebendo?" vai à IA com essa pergunta como contexto.
 *
 * Duas famílias, com réguas diferentes:
 *
 * - PERGUNTA DE QUEM: "quem é?", "quem fala?", "é pra mim?", "de onde você
 *   tirou meu número?", "não te conheço". É sobre o contato em qualquer
 *   ponto da conversa.
 * - SUSPEITA DE ENGANO: "mandou errado", "foi engano". Só conta no COMEÇO
 *   (ele falou no máximo uma vez antes) e sem complemento de conteúdo logo
 *   depois. No meio do atendimento, "você mandou errado, essa não é a planta
 *   do Vitra" fala da FOTO, e explicar quem escreve seria responder outra
 *   coisa.
 *
 * O que continua sendo recusa, e nem chega aqui: a AFIRMAÇÃO de que o número
 * é de outra pessoa ("número errado", "pessoa errada", "não sou eu",
 * "não conheço vocês"), que a regex de `recusaDoCliente.ts` decide antes.
 */

const PERGUNTA_DE_QUEM: readonly RegExp[] = [
  // "quem é?", "quem são vocês?": a fala inteira é a pergunta. Com mais
  // palavras depois ("quem é a construtora?") é pergunta sobre o imóvel.
  /^(oi|ola|bom dia|boa tarde|boa noite)?[\s,.!]*quem (e|eh|seria|sao)( (voce|vc|vcs|voces|tu|ce|o senhor|a senhora))?[\s?!.]*$/,
  /\bquem (e|eh|seria|sao) (voce|vc|vcs|voces|tu|ce)\b/,
  /\bquem (fala|ta falando|esta falando|e que ta falando|e que esta falando|me mandou|mandou isso|mandou essa mensagem|me escreveu|me chamou)\b/,
  /\bde onde( (voce|vc|vcs|voces|ce|tu))? (tirou|tiraram|pegou|pegaram|conseguiu|conseguiram|arrumou|arrumaram|achou|acharam) (o )?(meu|esse) (numero|contato|telefone|zap|whats|whatsapp)\b/,
  /\b(como|onde)( (voce|vc|vcs|voces|ce|tu))? (conseguiu|conseguiram|pegou|pegaram|achou|acharam|arrumou|arrumaram|tirou|tiraram) (o )?(meu|esse) (numero|contato|telefone|zap|whats|whatsapp)\b/,
  /\bquem (te|lhe|vos) (deu|passou|forneceu) (o )?(meu|esse) (numero|contato|telefone|zap|whats|whatsapp)\b/,
  // "é pra mim?" só no começo ou falando da mensagem: "esse apartamento é
  // pra mim" é entusiasmo, não dúvida.
  /^(isso |isso aqui |essa mensagem |a mensagem |essa msg |a msg )?(e|eh|era|seria) (pra|para) mim\b/,
  /\b(mensagem|msg|isso) (e|eh|era|seria) (pra|para) mim\b/,
  /^(e|eh|era) comigo\b/,
  /\bnao (te|lhe) conheco\b/,
  /\bnao conheco (voce|vc|o senhor|a senhora)\b/,
];

const SUSPEITA_DE_ENGANO: readonly RegExp[] = [
  /\b(mandou|mandaram|enviou|enviaram)( isso| essa mensagem| a mensagem| essa msg| a msg)? (errado|errada|por engano)\b/,
  /\b(mensagem|msg) errada\b/,
  /\bengano\b/,
];

/** "não foi engano" confirma que NÃO houve engano: quer conversar. */
const NEGA_O_ENGANO = /\bnao (foi|e|eh) (nenhum )?engano\b/;

/**
 * Complemento que transforma "mandou errado" em queixa de CONTEÚDO: a foto,
 * a planta, o link, o endereço estão errados, não o destinatário.
 */
const COMPLEMENTO_DE_CONTEUDO =
  /\b(foto|fotos|imagem|imagens|planta|plantas|link|video|pdf|arquivo|documento|endereco|localizacao|valor|preco|horario|data|dia|imovel|apartamento|ape|casa|unidade|tabela|material|book|apresentacao|nome)\b/;

/** Quantos caracteres depois da suspeita contam como "o complemento". */
const JANELA_DO_COMPLEMENTO = 40;

/** Até quantas falas anteriores dele a conversa ainda está no COMEÇO. */
export const FALAS_DO_COMECO = 1;

function primeiroCasamento(t: string, padroes: readonly RegExp[]): RegExpMatchArray | null {
  for (const p of padroes) {
    const m = t.match(p);
    if (m) return m;
  }
  return null;
}

/**
 * A dúvida dele sobre o contato, ou null. Devolve o trecho que decidiu, na
 * forma normalizada, para a telemetria.
 */
export function duvidaSobreOContato(
  texto: string,
  contexto: {
    /** Quantas vezes ele falou ANTES desta mensagem, nesta conversa. */
    falasAnterioresDoCliente: number;
  },
): string | null {
  const t = normalizar(texto).trim();
  if (!t || t.startsWith("[mensagem")) return null;

  const deQuem = primeiroCasamento(t, PERGUNTA_DE_QUEM);
  if (deQuem) return deQuem[0].trim();

  if (contexto.falasAnterioresDoCliente > FALAS_DO_COMECO) return null;
  if (NEGA_O_ENGANO.test(t)) return null;
  const suspeita = primeiroCasamento(t, SUSPEITA_DE_ENGANO);
  if (!suspeita) return null;
  const inicio = (suspeita.index ?? 0) + suspeita[0].length;
  if (COMPLEMENTO_DE_CONTEUDO.test(t.slice(inicio, inicio + JANELA_DO_COMPLEMENTO))) return null;
  return suspeita[0].trim();
}

/**
 * O texto normalizado SEM as frases de dúvida, para o filtro que decide o
 * que vai à IA de recusa (`temSinalNegativo`).
 *
 * Tira as duas famílias sem olhar o contexto, e de propósito: o que sobra é
 * o que decide. "acho que você mandou errado" fica sem sinal nenhum e não
 * vai à IA (que a lia como pedido para parar); "acho que mandou errado, pode
 * tirar meu número" ainda tem "tirar" e vai, e aí a IA decide pela parte que
 * importa.
 */
export function semADuvidaDeEngano(texto: string): string {
  let t = normalizar(texto);
  for (const p of [...PERGUNTA_DE_QUEM, ...SUSPEITA_DE_ENGANO]) {
    const global = new RegExp(p.source, p.flags.includes("g") ? p.flags : `${p.flags}g`);
    t = t.replace(global, " ");
  }
  return t.replace(/\s{2,}/g, " ").trim();
}

/**
 * A última fala nossa ofereceu PARAR ("quer continuar recebendo novidades
 * por aqui?"), que é como a jogada de esclarecer termina no começo da
 * conversa.
 *
 * É o contexto que transforma um "não" seco em pedido para parar
 * (`detectarRecusa`). Sem ele, o "não" só seria entendido se a IA de recusa
 * respondesse; caindo a IA, ele recebia pergunta de funil — "em qual região
 * você procura?" para quem acabou de dizer que não quer receber nada.
 */
const OFERTA_DE_PARAR =
  /\b(continuar|seguir) recebendo\b|\bnao (te )?(mando|envio|mandarei|enviarei) mais (nada|mensag)|\bprefere que eu (pare|nao (te )?mande)\b/;

export function ofereceuParar(ultimaFalaNossa: string): boolean {
  return OFERTA_DE_PARAR.test(normalizar(ultimaFalaNossa));
}
