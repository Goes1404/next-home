import { randomInt } from "node:crypto";
import { diaEmSaoPauloISO, ehClienteDePessoa, ipDaRequisicao, visitanteDoClique } from "@/lib/whatsapp/medicaoDoLink";

/**
 * A vitrine personalizada (29/10/2026, 0245): a seleção de imóveis que o
 * corretor monta para um lead, com link CURTO (`/v/<codigo>`) e a medição do
 * que o cliente abriu.
 *
 * Não é uma página nova: é a seleção (`/selecao/<token>`, 26/09) com código
 * curto e visualizações por imóvel. O token uuid continua sendo a
 * credencial; o código só leva até ele.
 *
 * Funções puras (as escritas moram em `visualizacoesDaVitrine.ts`).
 */

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export const TAMANHO_DO_CODIGO = 8;
const FORMATO_DO_CODIGO = /^[A-Za-z0-9]{8}$/;

/**
 * 8 caracteres sorteados de 56 (sem 0/O, 1/l/I, que se confundem quando o
 * cliente digita o link de um print): 56^8 ≈ 9,7×10^13 combinações.
 */
export function gerarCodigoDaVitrine(): string {
  let codigo = "";
  for (let i = 0; i < TAMANHO_DO_CODIGO; i++) codigo += ALFABETO[randomInt(ALFABETO.length)];
  return codigo;
}

export function codigoComFormato(codigo: string | null | undefined): codigo is string {
  return typeof codigo === "string" && FORMATO_DO_CODIGO.test(codigo);
}

export function caminhoDaVitrine(codigo: string): string {
  return `/v/${codigo}`;
}

/**
 * Quem abriu, sem guardar quem é: resumo de IP + navegador + DIA com o
 * segredo do servidor (`visitanteDoClique`, o mesmo da medição do link do
 * anúncio). O IP nunca sai daqui. Robô que se declara (a prévia do WhatsApp,
 * o rastreador) não conta: devolve `null` e a visualização não é gravada.
 */
export function visitanteDaVitrine(
  headers: Headers,
  segredo: string,
  agora: Date = new Date(),
): { conta: boolean; visitante: string | null; dia: string } {
  const userAgent = headers.get("user-agent")?.slice(0, 500) ?? null;
  const dia = diaEmSaoPauloISO(agora);
  if (!ehClienteDePessoa(userAgent)) return { conta: false, visitante: null, dia };
  const visitante = segredo ? visitanteDoClique({ ip: ipDaRequisicao(headers), userAgent, dia, segredo }) : null;
  return { conta: true, visitante, dia };
}

export type VisualizacaoLida = { empreendimento_id: string | null; criado_em: string };

export type ResumoDaVitrine = {
  /** A abertura mais recente da vitrine. */
  ultimaAbertura: string | null;
  aberturas: number;
  /** Os imóveis vistos, do mais visto ao menos; empate pelo mais recente. */
  vistos: { empreendimentoId: string; vezes: number; ultima: string }[];
};

/** O que a ficha do lead mostra: "abriu a vitrine há X · viu Y (2x)". */
export function resumirVisualizacoes(linhas: VisualizacaoLida[]): ResumoDaVitrine {
  let ultimaAbertura: string | null = null;
  let aberturas = 0;
  const porImovel = new Map<string, { vezes: number; ultima: string }>();
  for (const l of linhas) {
    if (!l.empreendimento_id) {
      aberturas++;
      if (!ultimaAbertura || l.criado_em > ultimaAbertura) ultimaAbertura = l.criado_em;
      continue;
    }
    const atual = porImovel.get(l.empreendimento_id) ?? { vezes: 0, ultima: l.criado_em };
    atual.vezes++;
    if (l.criado_em > atual.ultima) atual.ultima = l.criado_em;
    porImovel.set(l.empreendimento_id, atual);
  }
  const vistos = [...porImovel.entries()]
    .map(([empreendimentoId, v]) => ({ empreendimentoId, ...v }))
    .sort((a, b) => b.vezes - a.vezes || (a.ultima < b.ultima ? 1 : -1));
  return { ultimaAbertura, aberturas, vistos };
}

/** "há 5 min", "há 3 h", "há 2 dias" — a régua da ficha, sem data por extenso. */
export function haQuanto(iso: string, agora: Date = new Date()): string {
  const minutos = Math.floor((agora.getTime() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(minutos) || minutos < 1) return "agora";
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
}
