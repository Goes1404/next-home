import "server-only";

import { cache } from "react";
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
// `cache()` (30/10/2026): Impulsionamentos lê o catálogo na página E em
// `DoCliqueAConversa`, na mesma requisição — a consulta mais cara do painel
// (115–200 ms no pg_stat_statements) saía duas vezes. Vale só dentro da
// requisição; entre requisições nada é lembrado (a leitura é pela sessão).
export const getEmpreendimentosDoPainel = cache(async function getEmpreendimentosDoPainel(): Promise<Empreendimento[]> {
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
});

/**
 * UM imóvel, como o painel o vê — rascunho inclusive.
 *
 * A leitura pública (`getEmpreendimentoBySlug`) filtra `publicado = true`,
 * então ela devolve null justamente para o cadastro que o corretor acabou
 * de criar. Quem autoriza ler o não publicado é a policy da 0081.
 */
export const getEmpreendimentoDoPainel = cache(async function getEmpreendimentoDoPainel(slug: string): Promise<Empreendimento | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("empreendimentos")
    .select(SELECT_EMPREENDIMENTO)
    .eq("slug", slug)
    .maybeSingle();

  if (error || !data) return null;
  return mapEmpreendimento(data as unknown as LinhaEmpreendimento);
});

/** O resumo de um imóvel que a oficina de Marketing usa — nada além disto. */
export type ImovelResumido = {
  slug: string;
  nome: string;
  bairro: string;
  cidade: string;
  publicado: boolean;
};

/**
 * O catálogo RESUMIDO, para telas que só contam e listam nomes (30/10/2026).
 *
 * Marketing lia `SELECT_EMPREENDIMENTO` inteiro — tipologias, todas as
 * mídias com o `blur_data_url`, lazer e TODAS as unidades de cada imóvel —
 * para usar slug, nome, bairro, cidade e `publicado`. É a consulta de 115–200
 * ms do pg_stat_statements; esta lê cinco colunas de uma tabela só.
 *
 * Mesmo recorte de `getEmpreendimentosDoPainel` (cliente de SESSÃO, rascunho
 * incluído, mesma ordem), só que estreito. Falha devolve lista vazia, como lá.
 */
export const getCatalogoResumidoDoPainel = cache(async function getCatalogoResumidoDoPainel(): Promise<ImovelResumido[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("empreendimentos")
    .select("slug, nome, bairro, cidade, publicado")
    .order("ordem");

  if (error) {
    console.error("[catálogo do painel] falha ao ler o resumo:", error.message);
    return [];
  }
  return (data ?? []) as ImovelResumido[];
});
