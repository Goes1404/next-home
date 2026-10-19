import "server-only";

import { buscarSeguro } from "@/lib/imoveis/site/buscarSeguro";
import { lerLinhasDelimitadas, temNumeroCortado } from "./importacao";
import { lerPlanilhaXlsx, type AbaDaPlanilha } from "./xlsxLeitura";

/**
 * Link do Google Planilhas colado na caixa de importação.
 *
 * Colar o LINK é o jeito natural de quem trabalha no Google Planilhas, e
 * antes ele caía na leitura de lista solta: um endereço sem telefone, que a
 * tela respondia com "nenhum contato encontrado". Aqui o link vira a
 * exportação CSV da aba citada (`gid`), que já tem leitor.
 *
 * Só funciona com a planilha compartilhada como "qualquer pessoa com o
 * link": a privada redireciona para o login do Google, que chega como
 * página HTML, e a mensagem diz o que fazer.
 */

export type LinkDePlanilha = { id: string; gid: string | null };

const RE_LINK = /https?:\/\/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/([A-Za-z0-9_-]{20,})[^\s]*/;

/** O texto é só o link (com espaço em volta)? Lista com um link no meio continua sendo lista. */
export function linkDoGooglePlanilhas(texto: string): LinkDePlanilha | null {
  const limpo = texto.trim();
  const m = limpo.match(RE_LINK);
  if (!m || m[0].length !== limpo.length) return null;
  const gid = m[0].match(/[#?&]gid=(\d+)/)?.[1] ?? null;
  return { id: m[1], gid };
}

export function urlDeExportacaoCsv(link: LinkDePlanilha): string {
  const gid = link.gid ? `&gid=${link.gid}` : "";
  return `https://docs.google.com/spreadsheets/d/${link.id}/export?format=csv${gid}`;
}

/**
 * A planilha inteira em .xlsx. A exportação CSV leva o que a planilha MOSTRA,
 * e o Google mostra todo número de 12 dígitos ou mais (todo celular com 55)
 * como "5.51198E+12", sem os últimos dígitos. O .xlsx guarda o valor cru. Ele
 * traz todas as abas, e por isso a aba certa sai de `abaQueBateComOCsv`.
 */
export function urlDeExportacaoXlsx(link: LinkDePlanilha): string {
  return `https://docs.google.com/spreadsheets/d/${link.id}/export?format=xlsx`;
}

/** Compara só texto: nome e e-mail saem iguais nos dois formatos; número, data e moeda não. */
function ehTextoComparavel(celula: string): boolean {
  return (celula.match(/\p{L}/gu)?.length ?? 0) >= 2 && !/\d/.test(celula);
}

function semEspacoSobrando(celula: string | undefined): string {
  return (celula ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Qual aba do .xlsx é a do CSV. O link aponta a aba pelo `gid`, e o .xlsx não
 * diz o `gid` de nenhuma: a aba certa é a que tem o mesmo texto nas mesmas
 * posições. Sem uma vencedora clara, nenhuma: o texto fica como o CSV veio, e
 * a importação marca as linhas cortadas.
 */
export function abaQueBateComOCsv(abas: AbaDaPlanilha[], csv: string[][]): AbaDaPlanilha | null {
  const notas = abas.map((aba) => {
    let comparadas = 0;
    let iguais = 0;
    for (let i = 0; i < Math.min(csv.length, aba.linhas.length, 200); i += 1) {
      csv[i].forEach((celula, j) => {
        if (!ehTextoComparavel(celula)) return;
        comparadas += 1;
        if (semEspacoSobrando(celula) === semEspacoSobrando(aba.linhas[i][j])) iguais += 1;
      });
    }
    return { aba, nota: comparadas === 0 ? 0 : iguais / comparadas };
  });
  const [melhor, segunda] = notas.slice().sort((a, b) => b.nota - a.nota);
  if (!melhor || melhor.nota < 0.8) return null;
  if (segunda && segunda.nota > melhor.nota - 0.3) return null;
  return melhor.aba;
}

/** A aba do .xlsx como texto tabulado, do mesmo jeito que `extrairDeXlsx` a lê. */
function abaComoTexto(aba: AbaDaPlanilha): string {
  return aba.linhas.map((linha) => linha.map((celula) => celula.replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");
}

/**
 * O CSV veio com telefone cortado: a mesma aba, lida do .xlsx, com o número
 * inteiro. Qualquer falha devolve `null`, e quem chamou segue com o CSV.
 */
async function textoComNumerosInteiros(link: LinkDePlanilha, csv: string): Promise<string | null> {
  const resposta = await buscarSeguro(urlDeExportacaoXlsx(link), {
    tetoBytes: 5 * 1024 * 1024,
    prazoMs: 15_000,
    aceitar: (tipo) => tipo.startsWith("application/vnd.openxmlformats-officedocument.spreadsheetml"),
  });
  if (!resposta.ok) {
    console.warn("[google planilhas] .xlsx indisponível:", resposta.motivo);
    return null;
  }
  const leitura = lerPlanilhaXlsx(resposta.bytes);
  if (!leitura.ok) return null;
  const aba = abaQueBateComOCsv(leitura.abas, lerLinhasDelimitadas(csv));
  if (!aba) return null;
  const texto = abaComoTexto(aba);
  return temNumeroCortado(texto) ? null : texto;
}

export async function baixarPlanilhaDoGoogle(
  link: LinkDePlanilha,
): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  const resposta = await buscarSeguro(urlDeExportacaoCsv(link), {
    tetoBytes: 5 * 1024 * 1024,
    prazoMs: 15_000,
    aceitar: (tipo) => tipo.startsWith("text/csv") || tipo.startsWith("text/plain"),
  });
  if (!resposta.ok) {
    return {
      ok: false,
      erro:
        resposta.motivo === "tipo_errado" || resposta.motivo === "bloqueado" || resposta.motivo === "nao_encontrado"
          ? "Não consegui abrir a planilha pelo link. No Google Planilhas, clique em Compartilhar → Acesso geral → \"Qualquer pessoa com o link\" e cole o link de novo. Outra saída: Arquivo → Fazer download → .xlsx e envie o arquivo."
          : `Não consegui baixar a planilha agora (${resposta.mensagem}). Tente de novo ou envie o arquivo .xlsx.`,
    };
  }
  const texto = resposta.bytes.toString("utf8");
  if (!temNumeroCortado(texto)) return { ok: true, texto };
  return { ok: true, texto: (await textoComNumerosInteiros(link, texto)) ?? texto };
}
