"use server";

import { revalidatePath } from "next/cache";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

type Resultado = { ok?: string; erro?: string };

const limpo = (v: FormDataEntryValue | null, max: number) => {
  const t = String(v ?? "").trim().slice(0, max);
  return t || null;
};

/** Cadastra um corretor parceiro (0125). O link sai com token próprio. */
export async function cadastrarParceiro(form: FormData): Promise<Resultado> {
  const guarda = await exigirGestorNaAcao();
  if ("erro" in guarda) return { erro: guarda.erro };
  const nome = limpo(form.get("nome"), 120);
  if (!nome || nome.length < 2) return { erro: "Informe o nome do parceiro." };
  const supabase = await createClient();
  const { error } = await supabase.from("parceiros").insert({
    nome,
    imobiliaria: limpo(form.get("imobiliaria"), 120),
    creci: limpo(form.get("creci"), 30),
    telefone: limpo(form.get("telefone"), 30),
    email: limpo(form.get("email"), 160),
  });
  if (error) return { erro: "Não consegui cadastrar agora." };
  revalidatePath("/corretor/admin/parceiros");
  return { ok: "Parceiro cadastrado. Copie o link e mande para ele." };
}

export async function alternarParceiro(id: string, ativo: boolean): Promise<Resultado> {
  const guarda = await exigirGestorNaAcao();
  if ("erro" in guarda) return { erro: guarda.erro };
  const supabase = await createClient();
  const { data, error } = await supabase.from("parceiros").update({ ativo }).eq("id", id).select("id");
  if (error || !data?.length) return { erro: "Não consegui atualizar." };
  revalidatePath("/corretor/admin/parceiros");
  return { ok: ativo ? "Acesso reativado." : "Acesso suspenso: o link para de abrir na hora." };
}

/**
 * Troca o link (o antigo para de funcionar). O token não tem grant de
 * update para o painel: a troca passa pelo servidor, depois da guarda.
 */
export async function trocarLinkDoParceiro(id: string): Promise<Resultado> {
  const guarda = await exigirGestorNaAcao();
  if ("erro" in guarda) return { erro: guarda.erro };
  const { data, error } = await createServiceClient()
    .from("parceiros")
    .update({ token: crypto.randomUUID() })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) return { erro: "Não consegui trocar o link." };
  revalidatePath("/corretor/admin/parceiros");
  return { ok: "Link trocado. Mande o novo ao parceiro." };
}
