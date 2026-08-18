import type { LinhaPlanilhaBruta } from "./types";
import { normalizarPrecoBRL } from "./moneyUtils";

/**
 * Detecta o caractere separador mais provável de uma linha tabular.
 */
function detectarSeparador(linha: string): string {
  if (linha.includes("\t")) return "\t";
  if (linha.includes(";")) return ";";
  if (linha.includes("|")) return "|";
  if (linha.includes(",")) return ",";
  return "\t";
}

/**
 * Lê texto colado do Excel/Google Sheets ou conteúdo de CSV e extrai as linhas com nome e preço.
 */
export function parsearTabelaTexto(conteudo: string): LinhaPlanilhaBruta[] {
  if (!conteudo || !conteudo.trim()) return [];

  const linhas = conteudo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (linhas.length === 0) return [];

  const resultados: LinhaPlanilhaBruta[] = [];

  for (const linha of linhas) {
    const sep = detectarSeparador(linha);
    const colunas = linha.split(sep).map((c) => c.trim().replace(/^["']|["']$/g, "")).filter(Boolean);

    if (colunas.length === 1) {
      // Se tiver só 1 coluna (ex: "Residencial Alphaville 1 - R$ 1.500.000"), tenta quebrar por hífen ou dois pontos
      const partes = colunas[0].split(/[-–—:]/);
      if (partes.length >= 2) {
        const nome = partes[0].trim();
        const precoStr = partes.slice(1).join(" ").trim();
        const precoNum = normalizarPrecoBRL(precoStr);
        if (nome && precoNum) {
          resultados.push({
            textoNome: nome,
            textoPreco: precoStr,
            precoNumerico: precoNum,
          });
          continue;
        }
      }
    }

    if (colunas.length >= 2) {
      // Procura qual coluna é o preço e qual é o nome
      let idxPreco = -1;
      let precoNumEncontrado: number | null = null;

      // Primeiro verifica de trás para frente (preço costuma ficar nas últimas colunas)
      for (let i = colunas.length - 1; i >= 0; i--) {
        const preco = normalizarPrecoBRL(colunas[i]);
        if (preco !== null && preco > 10000) { // Preço de imóvel realista
          idxPreco = i;
          precoNumEncontrado = preco;
          break;
        }
      }

      if (idxPreco !== -1 && precoNumEncontrado !== null) {
        // A coluna do nome é a primeira coluna não-vazia que não seja o preço
        let nome = "";
        for (let i = 0; i < colunas.length; i++) {
          if (i !== idxPreco && isNaN(Number(colunas[i])) && colunas[i].length > 1) {
            nome = colunas[i];
            break;
          }
        }

        if (!nome && colunas[0]) nome = colunas[0];

        // Ignora cabeçalhos
        const nomeLower = nome.toLowerCase();
        if (
          nomeLower.includes("empreendimento") ||
          nomeLower.includes("imóvel") ||
          nomeLower.includes("imovel") ||
          nomeLower.includes("produto")
        ) {
          continue;
        }

        resultados.push({
          textoNome: nome,
          textoPreco: colunas[idxPreco],
          precoNumerico: precoNumEncontrado,
        });
      }
    }
  }

  return resultados;
}
