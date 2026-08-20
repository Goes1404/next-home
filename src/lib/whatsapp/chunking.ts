/**
 * Quebra de mensagens (chunking) do agente de WhatsApp.
 *
 * Uma resposta inteira mandada de uma vez lê como bilhete, não como
 * conversa — e é o oposto do que se pede de uma assistente que precisa
 * soar humana. A regra pedida pelo negócio é de um nível só: resposta
 * longa vira duas mensagens médias; resposta média vira duas pequenas;
 * resposta já pequena (do tamanho normal de um balão de WhatsApp) não
 * quebra. Não é recursivo — isso evitaria uma longa virar quatro ou oito
 * balões, que cansaria mais do que ajudaria.
 *
 * A própria IA pode marcar o ponto de corte no texto que gera (com "---"
 * ou parágrafo duplo). Isso tem prioridade sobre o corte automático por
 * tamanho: quem escreveu o texto sabe melhor que uma régua de caracteres
 * onde a ideia realmente termina.
 */

const LIMITE_PEQUENA = 200;
const LIMITE_MEDIA = 400;

export type TamanhoMensagem = "pequena" | "media" | "longa";

export function classificarTamanho(texto: string): TamanhoMensagem {
  const tamanho = texto.trim().length;
  if (tamanho <= LIMITE_PEQUENA) return "pequena";
  if (tamanho <= LIMITE_MEDIA) return "media";
  return "longa";
}

/**
 * Corta o texto em dois, o mais perto possível do meio, preferindo o fim de
 * uma frase — e só na falta de pontuação por perto, um espaço — para nunca
 * partir uma palavra ou deixar uma frase pela metade num balão.
 */
function dividirAoMeio(texto: string): [string, string] {
  const alvo = texto.length / 2;
  const fimDeFrase = /[.!?]+\s+/g;

  let melhorCorte = -1;
  let melhorDistancia = Infinity;
  let m: RegExpExecArray | null;

  while ((m = fimDeFrase.exec(texto))) {
    const posicao = m.index + m[0].length;
    const distancia = Math.abs(posicao - alvo);
    if (distancia < melhorDistancia) {
      melhorDistancia = distancia;
      melhorCorte = posicao;
    }
  }

  if (melhorCorte === -1) {
    const espacoDepois = texto.indexOf(" ", Math.floor(alvo));
    const espacoAntes = texto.lastIndexOf(" ", Math.ceil(alvo));

    if (espacoDepois === -1 && espacoAntes === -1) {
      melhorCorte = Math.round(alvo);
    } else if (espacoDepois === -1) {
      melhorCorte = espacoAntes;
    } else if (espacoAntes === -1) {
      melhorCorte = espacoDepois;
    } else {
      melhorCorte = alvo - espacoAntes <= espacoDepois - alvo ? espacoAntes : espacoDepois;
    }
  }

  const primeira = texto.slice(0, melhorCorte).trim();
  const segunda = texto.slice(melhorCorte).trim();
  return [primeira, segunda];
}

/**
 * Divide a resposta do agente nas mensagens que de fato serão enviadas.
 *
 * Nunca devolve pedaço vazio: uma segunda metade em branco (texto curto
 * demais para um corte útil) é descartada em vez de virar um balão vazio.
 */
export function dividirEmMensagens(textoOriginal: string): string[] {
  const texto = textoOriginal.trim();
  if (!texto) return [];

  const marcado = texto
    .split(/\n?-{3,}\n?|\n{2,}/)
    .map((parte) => parte.trim())
    .filter(Boolean);

  if (marcado.length > 1) return marcado;

  if (classificarTamanho(texto) === "pequena") return [texto];

  return dividirAoMeio(texto).filter(Boolean);
}
