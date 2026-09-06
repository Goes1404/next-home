"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Excluir uma imagem criada.
 *
 * O recorte é da RLS: a policy de delete da 0090 só alcança linha cujo
 * `corretor_id` seja o do requisitante, então um id alheio simplesmente não
 * afeta linha nenhuma. O `.select("id")` existe para distinguir "apagou" de
 * "não era sua" — sem ele, os dois casos devolveriam sucesso.
 */
export async function excluirImagem(id: string): Promise<{ erro?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imagens_geradas")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) return { erro: "Não deu para excluir a imagem." };
  if (!data || data.length === 0) return { erro: "Esta imagem não é sua." };

  revalidatePath("/corretor/imoveis/criar-imagem");
  return {};
}
