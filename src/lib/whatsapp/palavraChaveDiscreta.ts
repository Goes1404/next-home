/**
 * A palavra-chave tem que ser DISCRETA (regra N8 do plano de ativação,
 * 03/10/2026).
 *
 * Ela é digitada pelo corretor no chat com o cliente, então o cliente lê a
 * mensagem. E o casamento é por trecho da mensagem (`contemPalavraChave`):
 * uma palavra comum de conversa liga a IA na primeira vez que o corretor a
 * usar por acaso — e, desde a 0146, também CADASTRA aquele número como lead.
 * Numa linha que é o WhatsApp pessoal dele, "ok" como palavra-chave
 * transformaria qualquer amigo em cliente.
 *
 * Módulo puro: a tela de configuração e a action de salvar usam a mesma
 * régua, para a tela nunca aceitar o que o servidor recusa.
 */

/** Tamanho mínimo de uma palavra-chave com letras ou números. */
export const MINIMO_PALAVRA_DISCRETA = 6;

/**
 * Palavras e expressões de conversa do dia a dia. Uma palavra-chave feita
 * SÓ delas é recusada ("ok", "bom dia", "ok obrigado"); uma frase que as usa
 * junto de algo raro passa ("vou te passar os detalhes..").
 */
export const PALAVRAS_COMUNS_DE_CONVERSA = [
  "ok", "okay", "oi", "ola", "opa", "e ai", "eai",
  "obrigado", "obrigada", "obg", "brigado", "brigada", "valeu", "vlw",
  "perfeito", "combinado", "certo", "certinho", "beleza", "blz", "show", "top",
  "otimo", "otima", "legal", "massa", "claro", "entendi", "entendido",
  "sim", "nao", "talvez", "pode ser", "pode", "pois nao", "por favor", "pfv", "pf",
  "bom dia", "boa tarde", "boa noite", "tudo bem", "tudo bom", "tudo certo",
  "abraco", "abracos", "beijo", "beijos", "bjs", "tmj", "ate mais", "ate logo", "ate amanha",
  "aguardo", "aguarde", "um momento", "so um momento", "ja volto",
  "imovel", "apartamento", "casa", "visita", "valor", "preco",
  "vou", "te", "os", "as", "o", "a", "e", "de", "do", "da", "com", "para", "pra",
] as const;

/** Emojis que aparecem em conversa a toda hora: sozinhos, não servem de palavra-chave. */
export const EMOJIS_COMUNS = [
  "👍", "🙏", "😊", "🙂", "😉", "😂", "🤣", "❤", "❤️", "👏", "👌", "✅", "😁", "😀", "😃",
  "😄", "🥰", "😍", "😘", "🤝", "💪", "🔥", "👋", "😅", "🤗", "✌", "✌️", "🏠", "🏡",
] as const;

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Tem letra ou número? Sem nenhum, a palavra-chave é feita só de símbolos ou emojis. */
function temLetraOuNumero(texto: string): boolean {
  return /[\p{L}\p{N}]/u.test(texto);
}

/** É feita só de emojis/símbolos (e espaços)? */
export function ehSoSimbolos(texto: string): boolean {
  const limpo = texto.trim();
  return limpo.length > 0 && !temLetraOuNumero(limpo) && /\p{Extended_Pictographic}/u.test(limpo);
}

const COMUNS = new Set(PALAVRAS_COMUNS_DE_CONVERSA.map(normalizar));
const EMOJIS = new Set(EMOJIS_COMUNS.map((e) => e.trim()));

/**
 * O que há de errado com UMA palavra-chave, ou `null` se ela serve.
 * A mensagem fala com o corretor: diz o problema e o que fazer.
 */
export function problemaDaPalavraChave(chave: string): string | null {
  const limpo = chave.trim();
  if (!limpo) return null;

  if (ehSoSimbolos(limpo)) {
    return EMOJIS.has(limpo)
      ? `"${limpo}" é um emoji que se usa a toda hora. Escolha um que você nunca manda por acaso.`
      : null;
  }

  // Pontuação no fim conta: "detalhes.." é diferente de "detalhes".
  if ([...limpo].length < MINIMO_PALAVRA_DISCRETA) {
    return `"${limpo}" é curta demais. Use pelo menos ${MINIMO_PALAVRA_DISCRETA} caracteres, para não disparar por acaso.`;
  }

  const normal = normalizar(limpo);
  const palavras = normal.replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
  const tudoComum =
    COMUNS.has(normal.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()) ||
    (palavras.length > 0 && palavras.every((p) => COMUNS.has(p)));
  // Pontuação não salva uma expressão comum: "obrigado.." e "ok!!!" também
  // aparecem em conversa normal.
  if (tudoComum) {
    return `"${limpo}" é uma expressão comum de conversa. O cliente lê a mensagem, e ela ligaria a IA sem você querer. Use uma frase que você não diz por acaso.`;
  }

  return null;
}

/**
 * Os problemas de um campo inteiro (várias palavras separadas por vírgula).
 * `jaCadastradas`: as que já estavam salvas antes. Elas continuam valendo
 * mesmo fora da régua nova, para a regra não desligar de surpresa a palavra
 * que o corretor usa hoje — a tela avisa e pede a troca.
 */
export function problemasDasPalavrasChave(
  campo: string | null | undefined,
  jaCadastradas: string | null | undefined = null,
): string[] {
  const antigas = new Set(
    (jaCadastradas ?? "")
      .split(",")
      .map((p) => normalizar(p))
      .filter(Boolean),
  );
  return (campo ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !antigas.has(normalizar(p)))
    .map(problemaDaPalavraChave)
    .filter((p): p is string => p !== null);
}
