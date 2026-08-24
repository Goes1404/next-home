import "server-only";

import { createClient } from "@/lib/supabase/server";
import { montarResumo, type LinhaResumo } from "@/lib/admin/resumos";
import type { EtapaFunil, Lead } from "@/lib/types";

/**
 * Os números da equipe, lidos de uma query MAGRA (roadmap F5).
 *
 * As telas do gestor agregavam a partir de `getLeadsDoFunil()` — a mesma
 * consulta que alimenta o quadro, com joins de corretor e empreendimento.
 * Isso tinha dois problemas somados: trafegava a carteira inteira só para
 * contar, e, depois que o quadro ganhou teto (`TETO_DO_QUADRO`), passaria a
 * CONTAR ERRADO em silêncio — com 1.000 leads o painel mostraria 300 e
 * ninguém desconfiaria de um número plausível.
 *
 * Aqui a consulta pede só as cinco colunas que as contas usam, sem join
 * nenhum: ~40 bytes por lead em vez de ~400. Dez mil leads continuam
 * cabendo. Quando um dia não couberem, isto vira uma RPC de agregação no
 * Postgres — e o lugar de mexer é este arquivo, não as telas.
 */

type LinhaMagra = {
  id: string;
  etapa: EtapaFunil;
  etapa_alterada_em: string;
  origem_atribuicao: string | null;
  corretor_id: string | null;
};

export type AgregadoDaEquipe = {
  /** Total de leads visíveis para a sessão (o gestor vê a imobiliária toda). */
  total: number;
  porEtapa: Record<EtapaFunil, number>;
  porCorretor: LinhaResumo[];
  semDono: number;
  /** Ativos (nem fechados nem perdidos) sem movimento há 15+ dias. */
  parados15d: number;
  /** Fechados ÷ concluídos; `null` quando ninguém chegou ao fim ainda. */
  conversao: number | null;
};

export async function getAgregadoDaEquipe(
  equipe: { id: string; nome: string; emPausa: boolean }[],
  agora: Date = new Date(),
): Promise<AgregadoDaEquipe> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("id, etapa, etapa_alterada_em, origem_atribuicao, corretor_id");

  if (error) throw new Error(`Falha ao carregar os números da equipe: ${error.message}`);

  const linhas = (data ?? []) as LinhaMagra[];

  const porEtapa = {} as Record<EtapaFunil, number>;
  let semDono = 0;
  let parados15d = 0;
  let fechados = 0;
  let concluidos = 0;

  const limiteParado = agora.getTime() - 15 * 86_400_000;

  for (const linha of linhas) {
    porEtapa[linha.etapa] = (porEtapa[linha.etapa] ?? 0) + 1;
    if (!linha.corretor_id) semDono += 1;

    const encerrado = linha.etapa === "fechado" || linha.etapa === "perdido";
    if (encerrado) {
      concluidos += 1;
      if (linha.etapa === "fechado") fechados += 1;
    } else if (new Date(linha.etapa_alterada_em).getTime() <= limiteParado) {
      parados15d += 1;
    }
  }

  /*
   * `montarResumo` é a conta que decide quem recebe o próximo lead, e ela é
   * testada. Reaproveitá-la aqui evita duas verdades sobre "carga por
   * corretor" — o preço é montar objetos com a forma de `Lead` só nos campos
   * que ela lê, o que o cast abaixo declara explicitamente.
   */
  const paraResumo = linhas.map(
    (l) =>
      ({
        etapa: l.etapa,
        origemAtribuicao: l.origem_atribuicao,
        corretor: l.corretor_id ? { id: l.corretor_id, nome: "" } : null,
      }) as unknown as Lead,
  );

  return {
    total: linhas.length,
    porEtapa,
    porCorretor: montarResumo(paraResumo, equipe),
    semDono,
    parados15d,
    conversao: concluidos === 0 ? null : Math.round((fechados / concluidos) * 100),
  };
}
