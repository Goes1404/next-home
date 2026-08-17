import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/public";
import type { Corretor } from "@/lib/types";

/** Grava pelo `proxy.ts` a partir de `?corretor=<slug>` na URL. */
export const COOKIE_CORRETOR_ATIVO = "corretor_ativo";

export type CorretorAtivo = Corretor & { id: string };

/**
 * Corretor "dono" do link que o visitante usou pra chegar no site. Quando
 * presente, sobrepõe o corretor cadastrado em cada empreendimento — é assim
 * que um corretor nunca perde um lead pra outro só porque o cliente navegou
 * até um produto que não é "dele" no cadastro.
 *
 * Falha aberta: cookie ausente, slug inválido ou sem correspondência →
 * `null`, e a página cai no comportamento padrão (corretor do
 * empreendimento, ou a linha geral da imobiliária).
 */
export async function getCorretorAtivo(): Promise<CorretorAtivo | null> {
  const cookieStore = await cookies();
  const slug = cookieStore.get(COOKIE_CORRETOR_ATIVO)?.value;
  if (!slug) return null;

  const supabase = createClient();
  const { data } = await supabase
    .from("corretores")
    .select("id, nome, creci, whatsapp, foto_url")
    .eq("slug", slug)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id,
    nome: data.nome,
    creci: data.creci,
    whatsapp: data.whatsapp,
    fotoUrl: data.foto_url,
  };
}
