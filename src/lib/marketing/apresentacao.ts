import type { AtribuicaoMarketing } from "./atribuicao";

export function rotuloOrigem(origem: string | null, atribuicao: AtribuicaoMarketing): string {
  const fonte = atribuicao.utm_source?.trim();
  const meio = atribuicao.utm_medium?.trim();
  if (fonte && meio) return `${fonte} / ${meio}`;
  if (fonte) return fonte;
  return origem?.trim() || "Origem não identificada";
}

export function identificadorClique(atribuicao: AtribuicaoMarketing): string | null {
  if (atribuicao.gclid) return `Google · ${atribuicao.gclid}`;
  if (atribuicao.gbraid) return `Google · ${atribuicao.gbraid}`;
  if (atribuicao.wbraid) return `Google · ${atribuicao.wbraid}`;
  if (atribuicao.fbclid) return `Meta · ${atribuicao.fbclid}`;
  if (atribuicao.ttclid) return `TikTok · ${atribuicao.ttclid}`;
  return null;
}
