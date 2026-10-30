import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { perfilDoLead } from "@/lib/crm/compatibilidade";
import { leadsQueCombinam, temPressaDeMudar, type Match } from "@/lib/crm/matchDeImoveis";
import { getParametrosCredito } from "@/lib/credito/parametros";
import type { Empreendimento } from "@/lib/types";

export type LeadQueCombina = {
  id: string;
  nome: string;
  telefone: string | null;
  etapa: string;
  match: Match;
};

/**
 * A carteira DO CORRETOR DA SESSÃO cruzada com um imóvel (26/09/2026; com a
 * pontuação do match em 29/10/2026). Só os leads dele — o gestor também vê
 * só os próprios aqui: a carteira de cada um é de cada um, e a tela da equipe
 * é outra. Só quem a campanha aceita: sem `fechado`, arquivado ou quem pediu
 * para não ser procurado.
 *
 * Usada pelo cartão do editor do imóvel (`LeadsQueCombinam`) e pela página
 * inteira `/corretor/imoveis/<slug>/leads-que-combinam`, para as duas
 * contarem igual.
 */
export async function lerLeadsQueCombinam(imovel: Empreendimento): Promise<LeadQueCombina[] | null> {
  const corretor = await getCorretorLogado();
  if (!corretor || !imovel.id) return null;

  const supabase = await createClient();
  const [{ data }, { data: dossies }, credito] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "id, nome, telefone, etapa, regiao_interesse, dormitorios_min, orcamento_max, orcamento_min, renda_mensal, empreendimento_id, imovel_interesse_id",
      )
      .eq("corretor_id", corretor.id)
      .is("arquivado_em", null)
      .is("nao_contatar_em", null)
      .neq("etapa", "fechado")
      .limit(1000),
    // RLS recorta pelos leads que o corretor enxerga.
    supabase
      .from("lead_observacoes_ia")
      .select("lead_id, orcamento_max, orcamento_min, urgencia_mudanca")
      .limit(2000),
    getParametrosCredito(corretor.grupoId),
  ]);
  const dossiePorLead = new Map((dossies ?? []).map((d) => [d.lead_id, d]));
  const numero = (v: number | string | null | undefined) => (v != null && Number(v) > 0 ? Number(v) : null);

  return leadsQueCombinam(
    {
      id: imovel.id,
      cidade: imovel.cidade,
      bairro: imovel.bairro,
      precoAPartir: imovel.precoAPartir,
      dormitorios: imovel.tipologias.map((t) => t.dormitorios),
      status: imovel.status,
    },
    data ?? [],
    (l) => {
      const dossie = dossiePorLead.get(l.id);
      return {
        ...perfilDoLead(l, dossie, credito),
        orcamentoMin: numero(l.orcamento_min) ?? numero(dossie?.orcamento_min),
        temPressa: temPressaDeMudar(dossie?.urgencia_mudanca),
        pediu: [l.imovel_interesse_id, l.empreendimento_id].filter((x): x is string => Boolean(x)),
      };
    },
  ).map((l) => ({ id: l.id, nome: l.nome, telefone: l.telefone, etapa: l.etapa, match: l.match }));
}
