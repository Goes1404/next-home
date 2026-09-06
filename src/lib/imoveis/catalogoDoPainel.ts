import "server-only";

import { createClient } from "@/lib/supabase/server";
import { SELECT_EMPREENDIMENTO } from "@/lib/queries";
import { mapEmpreendimento, type LinhaEmpreendimento } from "@/lib/supabase/mappers";
import type { Empreendimento } from "@/lib/types";

/**
 * O catálogo COMO O CORRETOR o vê — rascunhos inclusive.
 *
 * `getEmpreendimentos()` (queries.ts) é a leitura da VITRINE: cliente
 * anônimo, só `publicado = true`. O painel precisa do outro recorte, senão
 * o imóvel recém-criado — que nasce despublicado de propósito — desaparece
 * no instante em que é criado, e o corretor não tem como voltar a ele.
 *
 * Duas diferenças que importam:
 *
 * - **Cliente de SESSÃO**, não o público. É a policy da 0081 que autoriza
 *   ler o não publicado, e ela só reconhece quem está logado.
 * - **Sem `getCorretorAtivo()`**. Aquilo troca o corretor exibido pelo dono
 *   do link de indicação — regra da vitrine, que no painel só confundiria
 *   quem está editando.
 *
 * Sem teto de linhas, e isso é deliberado: são 27 imóveis, a tela já
 * carrega mídias e tipologias de todos, e é a mesma consulta que a versão
 * pública fazia. Se o catálogo crescer uma ordem de grandeza, esta é a
 * consulta a paginar — a exceção está declarada em `escalaDoPainel.test.ts`.
 */
export async function getEmpreendimentosDoPainel(): Promise<Empreendimento[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("empreendimentos")
    .select(SELECT_EMPREENDIMENTO)
    .order("ordem");

  if (error) {
    console.error("[catálogo do painel] falha ao ler:", error.message);
    return [];
  }

  return (data as unknown as LinhaEmpreendimento[]).map(mapEmpreendimento);
}

/**
 * UM imóvel, como o painel o vê — rascunho inclusive.
 *
 * A leitura pública (`getEmpreendimentoBySlug`) filtra `publicado = true`,
 * então ela devolve null justamente para o cadastro que o corretor acabou
 * de criar. Quem autoriza ler o não publicado é a policy da 0081.
 */
export async function getEmpreendimentoDoPainel(slug: string): Promise<Empreendimento | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("empreendimentos")
    .select(SELECT_EMPREENDIMENTO)
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  return mapEmpreendimento(data as unknown as LinhaEmpreendimento);
}
