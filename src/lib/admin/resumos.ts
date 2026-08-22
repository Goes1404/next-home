import type { Lead } from "@/lib/types";

/**
 * Agregações puras da administração.
 *
 * Ficam fora dos componentes de propósito: são as contas que o gestor usa
 * para decidir quem recebe o próximo lead, e conta errada aqui vira decisão
 * errada lá. Sem rede e sem banco, então dá para testar de verdade.
 */

/** Linha do resumo: um corretor e como estão os leads dele. */
export type LinhaResumo = {
  id: string;
  nome: string;
  emPausa: boolean;
  total: number;
  novos: number;
  fechados: number;
  porRoleta: number;
};

export function montarResumo(
  leads: Lead[],
  equipe: { id: string; nome: string; emPausa: boolean }[],
): LinhaResumo[] {
  // Parte da EQUIPE, não dos leads: quem ainda não recebeu nada precisa
  // aparecer com zero. Um corretor invisível na tabela é justamente o que a
  // roleta deveria evitar, e a única forma de notar é vê-lo zerado.
  return equipe
    .map((corretor) => {
      const meus = leads.filter((lead) => lead.corretor?.id === corretor.id);
      return {
        id: corretor.id,
        nome: corretor.nome,
        emPausa: corretor.emPausa,
        total: meus.length,
        novos: meus.filter((lead) => lead.etapa === "novo").length,
        fechados: meus.filter((lead) => lead.etapa === "fechado").length,
        porRoleta: meus.filter((lead) => lead.origemAtribuicao === "roleta").length,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** Quantos leads em cada etapa — a foto do funil da imobiliária inteira. */
export function contarPorEtapa(leads: Lead[]): Record<string, number> {
  const contagem: Record<string, number> = {};
  for (const lead of leads) contagem[lead.etapa] = (contagem[lead.etapa] ?? 0) + 1;
  return contagem;
}

/**
 * Taxa de conversão de leads que chegaram ao fim do funil.
 *
 * O denominador exclui quem ainda está em jogo: dividir fechados pelo total
 * inclui leads que chegaram ontem e ainda nem foram atendidos, e o número
 * desce sozinho toda vez que a captação vai BEM — o oposto do que a métrica
 * deveria dizer.
 */
export function taxaConversao(leads: Lead[]): number | null {
  const concluidos = leads.filter((l) => l.etapa === "fechado" || l.etapa === "perdido").length;
  if (concluidos === 0) return null;
  const fechados = leads.filter((l) => l.etapa === "fechado").length;
  return Math.round((fechados / concluidos) * 100);
}

/** Leads parados há N dias ou mais — o que o gestor precisa cutucar. */
export function paradosHa(leads: Lead[], dias: number, agora: Date = new Date()): Lead[] {
  const limite = agora.getTime() - dias * 86_400_000;
  return leads.filter(
    (l) =>
      l.etapa !== "fechado" &&
      l.etapa !== "perdido" &&
      new Date(l.etapaAlteradaEm).getTime() <= limite,
  );
}
