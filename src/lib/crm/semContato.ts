/** Depois disto sem contato nosso, lead de portal/anúncio vira aviso. */
export const MINUTOS_SEM_CONTATO = 30;

/** "há 45 min", "há 2h" — o tamanho do atraso é o que dá urgência. */
export function haQuantoTempo(minutos: number): string {
  if (minutos < 60) return `há ${Math.max(1, minutos)} min`;
  return `há ${Math.floor(minutos / 60)}h`;
}

export function textoDeLeadSemContato(p: { nome: string; origem: string; minutos: number; fichaUrl: string }): string {
  return (
    `⏱️ ${p.nome} pediu contato pelo ${p.origem} ${haQuantoTempo(p.minutos)} e ainda não recebeu mensagem nenhuma. ` +
    `Quem pede num portal costuma pedir em outros — vale falar agora.\n${p.fichaUrl}`
  );
}
