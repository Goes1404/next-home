import "server-only";

import { buscarSeguro } from "@/lib/imoveis/site/buscarSeguro";

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
  return { ok: true, texto: resposta.bytes.toString("utf8") };
}
