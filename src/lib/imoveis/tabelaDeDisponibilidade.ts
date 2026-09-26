import type { StatusUnidade } from "@/lib/imoveis/unidades";

/**
 * Tabela de disponibilidade da construtora → status das unidades (0121).
 *
 * A construtora manda o espelho de vendas como planilha ou PDF gerado de
 * planilha: uma linha por unidade, com a identificação na primeira coluna e,
 * em algum lugar, a situação ("vendida", "reservada", "disponível") ou só o
 * preço (quem lista preço está à venda). Sem IA pelo mesmo motivo da tabela
 * de preços: o texto está dentro do arquivo, e status adivinhado vira "resta
 * uma unidade" dito ao cliente.
 *
 * A régua é conservadora: linha sem situação E sem preço é ignorada — um
 * cabeçalho, um rodapé, um total. Melhor ignorar uma unidade de verdade (o
 * corretor vê na contagem de ignoradas) do que marcar vendida a que não é.
 */

export type LinhaDeDisponibilidade = { identificacao: string; status: StatusUnidade };

const ID = /^(?:(?:apto?|apartamento|unid(?:ade)?|casa|lote|sala)\.?\s*)?([a-z]{0,3}[\s./-]?\d{2,4}[a-z]?)$/i;
const PRECO = /r\$\s*\d|\d{1,3}(?:\.\d{3}){1,2}(?:,\d{2})?\b/i;

function normalizarSemAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function situacao(linha: string): StatusUnidade | null {
  const t = normalizarSemAcento(linha);
  if (/\bvendid[oa]s?\b|\bvenda efetuada\b|\bquitad/.test(t)) return "vendida";
  if (/\breservad[oa]s?\b|\bbloquead[oa]\b|\bem negociacao\b/.test(t)) return "reservada";
  if (/\bdisponive(?:l|is)\b|\blivre\b|\ba venda\b/.test(t)) return "disponivel";
  return null;
}

/** "A-101", "a 101" e "A101" são a mesma unidade. */
export function chaveDaUnidade(id: string): string {
  return normalizarSemAcento(id).replace(/[\s./-]+/g, "");
}

function celulas(linha: string): string[] {
  const sep = linha.includes("\t") ? "\t" : linha.includes(";") ? ";" : linha.includes("|") ? "|" : null;
  const partes = sep ? linha.split(sep) : linha.split(/\s{2,}/);
  return partes.map((c) => c.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
}

export function lerTabelaDeDisponibilidade(texto: string): {
  linhas: LinhaDeDisponibilidade[];
  ignoradas: number;
} {
  const porChave = new Map<string, LinhaDeDisponibilidade>();
  let ignoradas = 0;
  for (const bruta of texto.split(/\r?\n/)) {
    const linha = bruta.trim();
    if (!linha) continue;
    const primeira = celulas(linha)[0] ?? "";
    const m = primeira.match(ID) ?? linha.match(/^(\d{2,4}[a-z]?)\b/i);
    const status = situacao(linha) ?? (PRECO.test(linha) ? "disponivel" : null);
    if (!m || !status) {
      ignoradas++;
      continue;
    }
    const identificacao = m[1].trim().toUpperCase();
    // A última linha de uma unidade repetida vence: é a mais recente do espelho.
    porChave.set(chaveDaUnidade(identificacao), { identificacao, status });
  }
  return { linhas: [...porChave.values()], ignoradas };
}
