"use server";

import { revalidatePath } from "next/cache";
import { revalidarCorretores } from "@/lib/catalogo/revalidar";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import { validarChamadaDoLink } from "@/lib/previaDoLink";
import { revalidarSitePublico } from "@/lib/sites/revalidar";

/**
 * Texto da prévia do link do portfólio (0188). Grava só a própria linha: a
 * policy de update de `corretores` é do próprio corretor (0006) e o grant
 * cobre esta coluna. Vazio volta ao padrão ("Portfólio de produtos").
 *
 * A prévia lê `corretoresPublicos()`, que está em cache por etiqueta: sem
 * `revalidarCorretores()` o WhatsApp mostraria o texto antigo por até 1 h.
 */
export async function salvarChamadaDoLink(texto: string): Promise<{ ok?: string; erro?: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };

  const validado = validarChamadaDoLink(texto);
  if ("erro" in validado) return { erro: validado.erro };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("corretores")
    .update({ chamada_do_link: validado.valor })
    .eq("id", corretor.id)
    .select("id");
  // `.select()` porque, sem grant ou sem policy, o update afeta 0 linhas calado.
  if (error || !data || data.length === 0) return { erro: "Não foi possível salvar agora." };

  revalidarCorretores();
  revalidatePath("/corretor/perfil");
  revalidarSitePublico();
  return {
    ok: validado.valor ? "Texto da prévia salvo." : "A prévia voltou ao texto padrão.",
  };
}
