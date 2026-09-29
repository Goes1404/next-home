"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";

/**
 * Andamento da obra (0125). Cada atualização aparece no portal de quem
 * comprou naquele imóvel. A foto, quando há, vem da galeria do próprio
 * imóvel: é o que garante que ela abre (e que ninguém cola link de fora).
 */
export async function publicarAtualizacaoDaObra(entrada: {
  empreendimentoId: string;
  titulo: string;
  texto?: string;
  percentual?: number | null;
  fotoUrl?: string | null;
}): Promise<{ ok?: string; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  const titulo = entrada.titulo.trim();
  if (titulo.length < 2 || titulo.length > 140) return { erro: "Dê um título curto à atualização." };
  const texto = entrada.texto?.trim().slice(0, 2000) || null;
  const p = entrada.percentual;
  if (p != null && (!Number.isInteger(p) || p < 0 || p > 100)) return { erro: "O percentual vai de 0 a 100." };

  const supabase = await createClient();
  let fotoUrl: string | null = null;
  if (entrada.fotoUrl) {
    const { data: foto } = await supabase
      .from("midias")
      .select("url")
      .eq("empreendimento_id", entrada.empreendimentoId)
      .eq("url", entrada.fotoUrl)
      .maybeSingle();
    if (!foto) return { erro: "Escolha a foto entre as do próprio imóvel." };
    fotoUrl = foto.url;
  }

  const { error } = await supabase.from("obra_atualizacoes").insert({
    empreendimento_id: entrada.empreendimentoId,
    corretor_id: corretor.id,
    titulo,
    texto,
    percentual: p ?? null,
    foto_url: fotoUrl,
  });
  if (error) return { erro: "Não consegui publicar agora. Tente de novo." };
  revalidatePath("/corretor/imoveis");
  return { ok: "Publicado. Aparece no portal de quem comprou aqui." };
}

export async function excluirAtualizacaoDaObra(id: string): Promise<{ ok?: string; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre de novo." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("obra_atualizacoes").delete().eq("id", id).select("id");
  if (error || !data?.length) return { erro: "Só quem publicou (ou o gestor) apaga." };
  revalidatePath("/corretor/imoveis");
  return { ok: "Apagada." };
}
