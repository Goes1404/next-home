/**
 * Quebra de mensagens (chunking) do agente de WhatsApp.
 *
 * Uma resposta inteira mandada de uma vez lê como bilhete, não como
 * conversa — e é o oposto do que se pede de uma assistente que precisa
 * soar humana. A regra do negócio: resposta longa vira duas médias;
 * resposta média vira duas pequenas; resposta já pequena não quebra.
 *
 * ATÉ AGOSTO/2026 ESSA PROMESSA ERA FALSA. O corte acontecia UMA VEZ só, e
 * uma resposta de 1100 caracteres virava dois balões de 549 — ambos ainda
 * "longos" pela própria régua deste arquivo. Em produção, 14 das 39
 * respostas do bot passaram de 400 caracteres e a maior tinha 1953: o
 * cliente recebia parede de texto, exatamente o que o chunking existia
 * para evitar.
 *
 * Hoje o corte se repete até cada balão CABER na faixa prometida, com um
 * teto de balões para uma resposta gigante não virar metralhadora. Esse
 * teto é rede de segurança, não solução: o certo é a IA não escrever
 * tanto, e é o que o prompt agora exige.
 *
 * A própria IA pode marcar o ponto de corte no texto que gera (com "---"
 * ou parágrafo duplo). Isso tem prioridade sobre o corte automático por
 * tamanho: quem escreveu o texto sabe melhor que uma régua de caracteres
 * onde a ideia realmente termina — mas cada pedaço marcado ainda passa
 * pela régua, senão um parágrafo duplo no meio de um texto gigante
 * devolveria dois blocos enormes e a regra morreria do mesmo jeito.
 */

/*
 * A régua veio da medição, não do achismo: 93 mensagens de uma corretora
 * real desta casa têm média de 47 caracteres, e só UMA passou de 200.
 * Os limites antigos (200/400) chamavam de "pequena" uma mensagem 4x maior
 * que a média dela — e de "média" uma que ela nunca mandou na vida.
 */
const LIMITE_PEQUENA = 120;
const LIMITE_MEDIA = 240;

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

  /*
   * Segundo nível: fronteira de oração. Sem ele, uma frase sem ponto final
   * caía direto no "qualquer espaço" e o cliente recebia dois balões assim:
   *
   *   "O Bosque AlphaGran é uma casa em condomínio fechado, pronta para"
   *   "morar, ideal para quem busca conforto e segurança"
   *
   * Cortar no meio de "pronta para morar" não parece humano digitando
   * rápido: parece software quebrado. Vírgula, ponto e vírgula, dois
   * pontos e travessão são onde uma pessoa de fato daria enter.
   */
  if (melhorCorte === -1) {
    const fimDeOracao = /[,;:]\s+|\s+—\s+/g;
    while ((m = fimDeOracao.exec(texto))) {
      const posicao = m.index + m[0].length;
      const distancia = Math.abs(posicao - alvo);
      if (distancia < melhorDistancia) {
        melhorDistancia = distancia;
        melhorCorte = posicao;
      }
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
 * Teto de balões por resposta. Cinco já é muita notificação seguida no
 * celular de alguém; passar disso é a IA metralhando, não conversando.
 */
const MAXIMO_BALOES = 5;

/**
 * Quebra um pedaço até que cada parte caiba no tamanho alvo.
 *
 * `alvo` é o teto de caracteres aceitável para o pedaço: `LIMITE_MEDIA`
 * para uma resposta longa (longa → médias) e `LIMITE_PEQUENA` para uma
 * média (média → pequenas).
 */
function quebrarAte(texto: string, alvo: number, restante: number): string[] {
  if (texto.length <= alvo || restante <= 1) return [texto];

  const [a, b] = dividirAoMeio(texto);
  // Corte que não separou nada (texto sem espaço útil): parar aqui evita
  // laço infinito e um balão vazio.
  if (!a || !b) return [texto];

  // A metade da esquerda pode precisar de mais um corte; a da direita
  // recebe o que sobrar do teto.
  const esquerda = quebrarAte(a, alvo, restante - 1);
  const direita = quebrarAte(b, alvo, restante - esquerda.length);
  return [...esquerda, ...direita];
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

  // Mesmo respeitando o corte que a IA marcou, cada pedaço passa pela
  // régua: um parágrafo duplo no meio de um texto gigante devolveria dois
  // blocos enormes, e a promessa de tamanho morreria igual.
  const pedacos = marcado.length > 1 ? marcado : [texto];

  const baloes: string[] = [];
  for (const pedaco of pedacos) {
    const tamanho = classificarTamanho(pedaco);
    if (tamanho === "pequena") {
      baloes.push(pedaco);
      continue;
    }
    // Longa vira médias; média vira pequenas — um degrau, como pedido.
    const alvo = tamanho === "longa" ? LIMITE_MEDIA : LIMITE_PEQUENA;
    baloes.push(...quebrarAte(pedaco, alvo, MAXIMO_BALOES - baloes.length));
    if (baloes.length >= MAXIMO_BALOES) break;
  }

  return baloes.filter(Boolean).slice(0, MAXIMO_BALOES);
}
