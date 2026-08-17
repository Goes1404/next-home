"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { souGestor } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import { ETAPAS_FUNIL, type EtapaFunil } from "@/lib/types";
import { normalizarWhatsapp } from "@/lib/whatsapp";

export type EstadoLogin = { erro?: string } | undefined;
export type EstadoForm = { erro?: string; ok?: string } | undefined;
/** Resultado das ações do funil — sucesso é a ausência de `erro`. */
export type ResultadoAcao = { erro?: string };

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
    return { erro: "Não foi possível salvar agora. Tente novamente." };
  }
  if (!data || data.length === 0) {
    return {
      erro: "Sem permissão para editar este cadastro. Fale com quem administra o site.",
    };
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

/**
 * Move um lead de etapa no funil.
 *
 * O `.select("id")` no fim segue a mesma regra do `salvarPerfil`, e aqui ela
 * é ainda mais necessária: a tela usa `useOptimistic`, então o cartão já
 * pulou de coluna antes de o servidor responder. Sem conferir as linhas
 * afetadas, um lead de outro corretor pareceria ter se movido — e só um
 * recarregamento revelaria que nada aconteceu.
 */
export async function moverEtapa(leadId: string, etapa: string): Promise<ResultadoAcao> {
  const { supabase } = await exigirSessao();

  // `etapa` chega tipada como `string`, e não como `EtapaFunil`, de
  // propósito: Server Action é um endpoint HTTP: o argumento vem pela rede e
  // o tipo do TypeScript some na compilação. A lista fechada é a validação
  // real — o `check` da migration é a segunda linha de defesa, não a
  // primeira.
  if (!ETAPAS_FUNIL.includes(etapa as EtapaFunil)) {
    return { erro: "Etapa desconhecida." };
  }

  const { data, error } = await supabase
    .from("leads")
    .update({ etapa, etapa_alterada_em: new Date().toISOString() })
    .eq("id", leadId)
    .select("id");

  if (error) {
    return { erro: "Não foi possível mover agora. Tente novamente." };
  }
  if (!data || data.length === 0) {
    return { erro: "Este lead não é seu — recarregue a página." };
  }

  revalidatePath("/corretor/funil");
  revalidatePath("/corretor/leads");
  revalidatePath("/corretor");
  return {};
}

/**
 * Passa um lead para outro corretor. Só gestor.
 *
 * A checagem de papel aqui é conveniência: quem decide de verdade é o
 * `with check` da policy (0007), que exige que um corretor comum termine
 * dono do lead — ou seja, ele não consegue nem doar nem roubar. A mensagem
 * abaixo existe para o gestor entender o que houve, não para barrar ninguém.
 */
export async function atribuirLead(
  leadId: string,
  corretorId: string,
): Promise<ResultadoAcao> {
  const { supabase } = await exigirSessao();

  if (!(await souGestor())) {
    return { erro: "Só quem é gestor pode redistribuir leads." };
  }

  const { data, error } = await supabase
    .from("leads")
    .update({ corretor_id: corretorId, origem_atribuicao: "manual" })
    .eq("id", leadId)
    .select("id");

  if (error) {
    return { erro: "Não foi possível atribuir agora. Tente novamente." };
  }
  if (!data || data.length === 0) {
    return { erro: "Sem permissão para atribuir este lead." };
  }

  revalidatePath("/corretor/equipe");
  revalidatePath("/corretor/funil");
  revalidatePath("/corretor/leads");
  return {};
}
