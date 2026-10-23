"use server";

import { redirect } from "next/navigation";
import { revalidarCorretores } from "@/lib/catalogo/revalidar";
import { cadastroEstaPendente } from "@/lib/corretores/cadastroPendente";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { normalizarWhatsapp } from "@/lib/whatsapp";

export type EstadoDoCadastro = { erro?: string } | undefined;

/** Completa somente a própria ficha provisória; o id nunca vem do navegador. */
export async function completarCadastro(
  _estado: EstadoDoCadastro,
  formData: FormData,
): Promise<EstadoDoCadastro> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) redirect("/corretor/entrar");

  const nome = String(formData.get("nome") ?? "").trim().replace(/\s+/g, " ");
  const creci = String(formData.get("creci") ?? "").trim().replace(/\s+/g, " ");
  const whatsapp = normalizarWhatsapp(String(formData.get("whatsapp") ?? ""));
  if (nome.length < 3 || nome.length > 120) return { erro: "Informe seu nome completo." };
  if (creci.length < 3 || creci.length > 120 || cadastroEstaPendente(creci)) {
    return { erro: "Informe um CRECI válido." };
  }
  if (!whatsapp) return { erro: "Informe um WhatsApp válido com DDD." };

  // `creci` não tem grant de edição para a pessoa. A chave de serviço só vem
  // depois da sessão verificada e fica presa ao `user_id` dela e ao marcador.
  const servico = createServiceClient();
  const { data: ficha, error } = await servico
    .from("corretores")
    .update({ nome, creci, whatsapp })
    .eq("user_id", userId)
    .like("creci", "PENDENTE-%")
    .select("id")
    .maybeSingle();

  if (error?.code === "23505") return { erro: "Esse CRECI já está em uso nesta imobiliária." };
  if (error || !ficha) return { erro: "Não foi possível concluir o cadastro agora. Tente novamente." };

  revalidarCorretores();
  redirect("/corretor");
}
