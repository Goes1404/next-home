"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type EstadoLogin = { erro?: string } | undefined;
export type EstadoForm = { erro?: string; ok?: string } | undefined;

/**
 * Server Action é uma requisição POST à rota, não uma navegação — o
 * `proxy.ts` protege a navegação, mas não substitui esta checagem. Toda ação
 * do painel começa por aqui. Ver o aviso sobre isso na documentação do Next
 * (01-app/02-guides/authentication.md).
 */
async function exigirSessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/corretor/entrar");
  return { supabase, user };
}

/**
 * A migration 0006 traz a coluna `bio` e a policy de edição juntas. Antes
 * dela, o update falha citando a coluna; depois dela, mas sem a policy, o
 * RLS não afeta linha nenhuma e também não dá erro. Os dois casos têm a
 * mesma causa e merecem a mesma explicação, em vez de um "tente novamente"
 * que manda o corretor repetir algo que nunca vai funcionar.
 */
const AVISO_MIGRACAO_PENDENTE =
  "Sem permissão para editar o cadastro: o ajuste no banco de dados ainda não foi aplicado. Fale com quem administra o site.";

/** Mantém só dígitos e garante o formato E.164 brasileiro que `wa.me` espera. */
function normalizarWhatsapp(bruto: string): string | null {
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length < 10) return null;
  // 10-11 dígitos = número local, sem código do país; 12-13 já vem com o 55.
  if (digitos.length <= 11) return `55${digitos}`;
  if (digitos.length <= 13 && digitos.startsWith("55")) return digitos;
  return null;
}

export async function entrar(_estado: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const email = String(formData.get("email") ?? "").trim();
  const senha = String(formData.get("senha") ?? "");

  if (!email || !senha) {
    return { erro: "Informe e-mail e senha." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });

  if (error) {
    return { erro: "E-mail ou senha inválidos." };
  }

  redirect("/corretor");
}

export async function sair(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/corretor/entrar");
}

/**
 * Salva os campos que o corretor pode editar de si mesmo.
 *
 * Só `nome`, `whatsapp` e `bio` são enviados — `creci`, `slug` e `user_id`
 * não estão no formulário e, mais importante, o banco recusaria de qualquer
 * forma: a migration 0006 dá `grant update` apenas nessas colunas. A
 * validação abaixo é conveniência para o usuário, não a barreira de
 * segurança.
 */
export async function salvarPerfil(
  _estado: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const { supabase, user } = await exigirSessao();

  const nome = String(formData.get("nome") ?? "").trim();
  const whatsappBruto = String(formData.get("whatsapp") ?? "");
  const bio = String(formData.get("bio") ?? "").trim();

  if (nome.length < 2 || nome.length > 120) {
    return { erro: "Informe seu nome completo." };
  }
  const whatsapp = normalizarWhatsapp(whatsappBruto);
  if (!whatsapp) {
    return { erro: "WhatsApp inválido. Use DDD + número, ex.: (11) 91234-5678." };
  }
  if (bio.length > 600) {
    return { erro: "A apresentação está muito longa (máximo 600 caracteres)." };
  }

  // `.select()` no fim é essencial, não enfeite: sem policy de UPDATE o RLS
  // não devolve erro — ele simplesmente não afeta linha nenhuma. Sem
  // conferir o que voltou, a tela diria "salvo" sem ter salvado nada.
  const { data, error } = await supabase
    .from("corretores")
    .update({ nome, whatsapp, bio: bio || null })
    .eq("user_id", user.id)
    .select("id");

  if (error) {
    return {
      erro: error.message.includes("bio")
        ? AVISO_MIGRACAO_PENDENTE
        : "Não foi possível salvar agora. Tente novamente.",
    };
  }
  if (!data || data.length === 0) {
    return { erro: AVISO_MIGRACAO_PENDENTE };
  }

  // A página pública do corretor e a vitrine da equipe leem esses campos.
  revalidatePath("/corretor/perfil");
  revalidatePath("/corretores");
  return { ok: "Perfil atualizado." };
}

/**
 * Troca a senha revalidando a atual antes.
 *
 * `auth.updateUser` sozinho aceitaria a troca só com a sessão válida — o que
 * deixaria qualquer sessão esquecida num computador emprestado trocar a senha
 * sem conhecer a antiga. O `signInWithPassword` abaixo fecha isso.
 */
export async function trocarSenha(
  _estado: EstadoForm,
  formData: FormData,
): Promise<EstadoForm> {
  const { supabase, user } = await exigirSessao();

  const atual = String(formData.get("atual") ?? "");
  const nova = String(formData.get("nova") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  if (nova.length < 8) {
    return { erro: "A nova senha precisa ter pelo menos 8 caracteres." };
  }
  if (nova !== confirmacao) {
    return { erro: "A confirmação não confere com a nova senha." };
  }
  if (nova === atual) {
    return { erro: "A nova senha precisa ser diferente da atual." };
  }
  if (!user.email) {
    return { erro: "Esta conta não tem e-mail cadastrado; fale com o administrador." };
  }

  const { error: erroAtual } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: atual,
  });
  if (erroAtual) {
    return { erro: "A senha atual está incorreta." };
  }

  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) {
    return { erro: "Não foi possível trocar a senha agora. Tente novamente." };
  }

  return { ok: "Senha alterada." };
}
