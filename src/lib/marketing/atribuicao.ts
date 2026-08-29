export const CHAVES_ATRIBUICAO = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "gclid",
  "gbraid",
  "wbraid",
  "fbclid",
  "ttclid",
] as const;

export type AtribuicaoMarketing = Partial<Record<(typeof CHAVES_ATRIBUICAO)[number], string>>;

const LIMITE_VALOR = 500;

/** Lê somente identificadores conhecidos; parâmetros arbitrários nunca vão ao CRM. */
export function lerAtribuicao(search: string): AtribuicaoMarketing {
  const params = new URLSearchParams(search);
  const atribuicao: AtribuicaoMarketing = {};

  for (const chave of CHAVES_ATRIBUICAO) {
    const valor = params.get(chave)?.trim();
    if (valor) atribuicao[chave] = valor.slice(0, LIMITE_VALOR);
  }

  return atribuicao;
}
