"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { revalidarCatalogo } from "@/lib/catalogo/revalidar";
import { andarDaUnidade, lerIdentificacoes, type StatusUnidade } from "@/lib/imoveis/unidades";

type Resultado = { ok?: string; erro?: string };

function revalidar(slug: string) {
  revalidatePath(`/corretor/imoveis/${slug}`);
  revalidatePath(`/empreendimentos/${slug}`);
  revalidarCatalogo();
}

/** Cadastra em lote. A que já existe (mesma identificação) é ignorada. */
export async function adicionarUnidades(params: {
  empreendimentoId: string;
  slug: string;
  tipologiaId: string | null;
  texto: string;
}): Promise<Resultado> {
  if (!(await getCorretorLogado())) return { erro: "Sessão expirada." };
  const ids = lerIdentificacoes(params.texto);
  if (ids === null) return { erro: "Lote grande demais — cadastre até 200 unidades por vez." };
  if (ids.length === 0) return { erro: "Escreva as unidades: 101, 102 ou 101 a 110." };

  const supabase = await createClient();
  let dormitorios: number | null = null;
  let area: number | null = null;
  if (params.tipologiaId) {
    const { data: planta } = await supabase
      .from("tipologias")
      .select("dormitorios, area_privativa")
      .eq("id", params.tipologiaId)
      .eq("empreendimento_id", params.empreendimentoId)
      .maybeSingle();
    if (!planta) return { erro: "Planta não encontrada neste imóvel." };
    dormitorios = planta.dormitorios;
    area = planta.area_privativa != null ? Number(planta.area_privativa) : null;
  }

  const { error, count } = await supabase.from("unidades").upsert(
    ids.map((identificacao) => ({
      empreendimento_id: params.empreendimentoId,
      tipologia_id: params.tipologiaId,
      identificacao,
      andar: andarDaUnidade(identificacao),
      dormitorios,
      area_m2: area,
    })),
    { onConflict: "empreendimento_id,identificacao", ignoreDuplicates: true, count: "exact" },
  );
  if (error) return { erro: "Não foi possível cadastrar as unidades agora." };
  revalidar(params.slug);
  const novas = count ?? ids.length;
  return { ok: novas === 1 ? "1 unidade cadastrada." : `${novas} unidades cadastradas.` };
}

export async function mudarStatusDaUnidade(params: {
  id: string;
  slug: string;
  status: StatusUnidade;
}): Promise<Resultado> {
  if (!(await getCorretorLogado())) return { erro: "Sessão expirada." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .update({ status: params.status, atualizado_em: new Date().toISOString() })
    .eq("id", params.id)
    .select("id");
  if (error || !data?.length) return { erro: "Não foi possível mudar o status." };
  revalidar(params.slug);
  return { ok: "Status atualizado." };
}

export async function excluirUnidade(params: { id: string; slug: string }): Promise<Resultado> {
  if (!(await getCorretorLogado())) return { erro: "Sessão expirada." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("unidades").delete().eq("id", params.id).select("id");
  if (error || !data?.length) return { erro: "Não foi possível excluir a unidade." };
  revalidar(params.slug);
  return { ok: "Unidade excluída." };
}
