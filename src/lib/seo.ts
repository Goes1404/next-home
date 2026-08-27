/**
 * Régua de título e descrição para o Google.
 *
 * ## Por que isto existe
 *
 * O Google corta o título por volta de 60 caracteres e a descrição por volta
 * de 155 — o que passa disso não é ignorado, é EXIBIDO CORTADO, com "…" no
 * meio da frase. Medido em 27/08/2026, as nove páginas públicas deste site
 * estouravam as duas réguas: a home tinha 101 caracteres de título e 224 de
 * descrição, ou seja, 41 e 64 caracteres jogados fora justamente onde o
 * usuário decide se clica.
 *
 * O detalhe que mais engana é o SUFIXO: o `template` do layout raiz
 * acrescenta " · Next Home" a todo título de página. São 12 caracteres que
 * não aparecem em lugar nenhum do arquivo da página — quem escreve um
 * título de 55 achando que cabe, publica 67.
 */

/** Onde o Google corta o título, contando o sufixo da marca. */
export const LIMITE_TITULO = 60;

/** O sufixo que o `template` do layout raiz acrescenta: " · Next Home". */
export const SUFIXO_MARCA = 12;

/** Quanto sobra para o título ESCRITO na página. */
export const LIMITE_TITULO_PAGINA = LIMITE_TITULO - SUFIXO_MARCA;

/** Onde o Google corta a descrição. */
export const LIMITE_DESCRICAO = 155;

/**
 * Corta no último espaço antes do limite, sem cortar palavra ao meio.
 *
 * Rede de segurança para texto que vem do BANCO (tagline de empreendimento,
 * nome de corretor): ali o tamanho não está sob controle de quem escreve o
 * código. Texto fixo deve caber por si — se esta função precisar agir num
 * literal do repositório, o literal é que está errado.
 *
 * Sem reticências: a marca "…" que o Google desenha no corte é dele, e
 * somar a nossa gastaria três caracteres do que ainda cabia.
 */
export function limitar(texto: string, limite: number): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  if (limpo.length <= limite) return limpo;

  const corte = limpo.slice(0, limite);
  const ultimoEspaco = corte.lastIndexOf(" ");
  // Palavra única maior que o limite: corta seco, é o menos ruim.
  const naPalavra = ultimoEspaco > limite * 0.6 ? corte.slice(0, ultimoEspaco) : corte;

  // Tira espaço e pontuação de ligação que sobraram no fim ("Terra Alta —").
  // Em laço porque o corte pode deixar as duas coisas: " — ".
  let fim = naPalavra;
  let anterior;
  do {
    anterior = fim;
    fim = fim.trim().replace(/[,;:—–-]$/, "");
  } while (fim !== anterior);

  return fim;
}

export const tituloDePagina = (t: string) => limitar(t, LIMITE_TITULO_PAGINA);
export const descricaoDePagina = (d: string) => limitar(d, LIMITE_DESCRICAO);
