/**
 * Quando avisar "N leads seus combinam com o imóvel X" (29/10/2026). Puro.
 *
 * O aviso é bom uma vez; repetido a cada edição do imóvel (troca de foto,
 * de preço, de ordem) vira o ruído que ensina a ignorar notificação. Então:
 *
 * - primeiro aviso daquele imóvel para aquele corretor: avisa;
 * - depois, só se a contagem CRESCEU (lead novo passou a combinar, ou o
 *   preço mudou e entrou gente) E já passou a janela de 7 dias;
 * - e no máximo um aviso desses por corretor por hora, entre todos os
 *   imóveis (`ultimoDoCorretor`).
 */

export const JANELA_DE_REPETICAO_MS = 7 * 86_400_000;
export const INTERVALO_POR_CORRETOR_MS = 60 * 60_000;

export function deveAvisarMatch(p: {
  leadsAgora: number;
  anterior: { leads: number; avisado_em: string } | null;
  ultimoDoCorretor: string | null;
  agora: Date;
}): boolean {
  if (p.leadsAgora <= 0) return false;
  const t = p.agora.getTime();
  if (p.ultimoDoCorretor && t - new Date(p.ultimoDoCorretor).getTime() < INTERVALO_POR_CORRETOR_MS) return false;
  if (!p.anterior) return true;
  if (p.leadsAgora <= p.anterior.leads) return false;
  return t - new Date(p.anterior.avisado_em).getTime() >= JANELA_DE_REPETICAO_MS;
}

export function textoDoAvisoDeMatch(p: { imovel: string; leads: number; nomes: string[] }): { titulo: string; corpo: string } {
  const quem = p.nomes.slice(0, 2).join(" e ");
  const resto = p.leads > p.nomes.slice(0, 2).length ? ` e mais ${p.leads - Math.min(2, p.nomes.length)}` : "";
  return {
    titulo: p.leads === 1 ? `1 lead seu combina com ${p.imovel}` : `${p.leads} leads seus combinam com ${p.imovel}`,
    corpo: `${quem ? `${quem}${resto}` : "Veja quem"} — pelo que disseram que procuram. Toque para ver os motivos e mandar o imóvel.`,
  };
}
