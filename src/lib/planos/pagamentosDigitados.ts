// O que o administrador da plataforma digita na cobrança (fase 2C).
//
// Módulo PURO: a action valida aqui e o formulário usa as mesmas regras e
// frases. Cada função devolve o valor já no formato do banco, ou a frase que
// a tela mostra (diz o que fazer, não o que o banco recusou).

import { diaEmSP } from "@/lib/crm/resumoDoDia";

type Lido<T> = { ok: true; valor: T } | { ok: false; erro: string };

/** O maior valor aceito (um dígito a mais não vira mensalidade de milhões). */
export const VALOR_MAXIMO_DIGITAVEL = 1_000_000;

/**
 * Dinheiro em reais, do jeito brasileiro: "250", "250,50", "1.250,00". Aceita
 * "R$" na frente. Recusa ponto decimal ("250.50") e sinal, para a tela dizer
 * o que fazer em vez de gravar 25050.
 */
export function lerValorDigitado(texto: string): Lido<number> {
  const limpo = texto.trim().replace(/^R\$\s*/i, "");
  if (limpo === "") return { ok: false, erro: "Digite o valor em reais (por exemplo, 250 ou 250,50)." };
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d{1,2})?$/.test(limpo)) {
    return { ok: false, erro: "Digite o valor em reais, com vírgula nos centavos (por exemplo, 250 ou 1.250,50)." };
  }
  const valor = Number(limpo.replace(/\./g, "").replace(",", "."));
  if (valor > VALOR_MAXIMO_DIGITAVEL) {
    return { ok: false, erro: `O valor passa de ${VALOR_MAXIMO_DIGITAVEL.toLocaleString("pt-BR")}. Confira os dígitos.` };
  }
  return { ok: true, valor };
}

/** A mensalidade combinada: em branco = não definida (`null`). */
export function lerMensalidadeDigitada(texto: string): Lido<number | null> {
  if (texto.trim() === "") return { ok: true, valor: null };
  return lerValorDigitado(texto);
}

/** O dia do vencimento: inteiro de 1 a 28. */
export function lerDiaDoVencimentoDigitado(texto: string): Lido<number> {
  const limpo = texto.trim();
  if (!/^\d{1,2}$/.test(limpo) || Number(limpo) < 1 || Number(limpo) > 28) {
    return { ok: false, erro: "O dia do vencimento vai de 1 a 28 (todo mês tem esses dias)." };
  }
  return { ok: true, valor: Number(limpo) };
}

/** O mês a que o pagamento se refere, como o campo de mês entrega (`AAAA-MM`) → `AAAA-MM-01`. */
export function lerCompetenciaDigitada(texto: string): Lido<string> {
  const m = /^(\d{4})-(\d{2})$/.exec(texto.trim());
  if (!m || Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[1]) < 2020 || Number(m[1]) > 2100) {
    return { ok: false, erro: "Escolha o mês a que o pagamento se refere." };
  }
  return { ok: true, valor: `${m[1]}-${m[2]}-01` };
}

/** O dia em que o pagamento caiu (`AAAA-MM-DD`): data que existe e que não é futura. */
export function lerDataDoPagamento(texto: string, hoje: Date = new Date()): Lido<string> {
  const limpo = texto.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(limpo);
  const existe =
    m !== null && new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toISOString().slice(0, 10) === limpo;
  if (!existe || Number(m[1]) < 2020) return { ok: false, erro: "Escolha a data em que o pagamento caiu." };
  if (limpo > diaEmSP(hoje)) return { ok: false, erro: "A data do pagamento não pode ser no futuro." };
  return { ok: true, valor: limpo };
}

/** Observação livre, aparada; em branco = nenhuma. */
export function lerObservacaoDigitada(texto: string): Lido<string | null> {
  const limpo = texto.trim();
  if (limpo.length > 300) return { ok: false, erro: "A observação passa de 300 letras. Resuma." };
  return { ok: true, valor: limpo === "" ? null : limpo };
}
