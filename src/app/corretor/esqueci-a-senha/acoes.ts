"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { enviarLinkDeAcesso } from "@/lib/auth/emailsDeAcesso";
import { gerarLinkDeAcesso } from "@/lib/auth/links";
import { ehEmailDeAcesso } from "@/lib/corretores/credenciaisIniciais";
import { site } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * "Esqueci a senha": pede o link de recuperação por e-mail.
 *
 * É PÚBLICA, e por isso não revela nada. A resposta é sempre a mesma tela
 * ("Se houver uma conta com este e-mail, enviamos um link."), exista ou não
 * a conta, seja ou não o endereço de acesso antigo (`@nexthome.com`, domínio
 * de terceiro, que não recebe link), e saia ou não o e-mail. Uma resposta
 * diferente para "não existe" transformaria a tela num jeito de descobrir
 * quem tem login na plataforma, e em qual grupo.
 *
 * O trabalho de verdade (gerar o link, achar o nome do grupo, mandar o
 * e-mail) roda em `after`, depois da resposta: senão a conta que existe
 * demoraria o tempo de um envio a mais, e o relógio contaria o que o texto
 * esconde.
 */
export async function pedirLinkDeSenha(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (email.includes("@") && !ehEmailDeAcesso(email)) {
    after(() => mandarLinkDeRecuperacao(email));
  }

  redirect("/corretor/esqueci-a-senha?enviado=1");
}

async function mandarLinkDeRecuperacao(email: string): Promise<void> {
  // Sem conta, o Auth recusa (`user_not_found`) e nada é enviado.
  const link = await gerarLinkDeAcesso("recovery", email, "/corretor/definir-senha");
  if (!link.ok) return;

  const nomeDoGrupo = await nomeDoGrupoDoUsuario(link.userId);
  const desfecho = await enviarLinkDeAcesso("recovery", email, nomeDoGrupo, link.url);
  if (!desfecho.enviado) {
    console.warn(`[esqueci-a-senha] link de recuperação não enviado: ${desfecho.motivo}`);
  }
}

/**
 * O nome do grupo de quem pediu, para o e-mail dizer de qual painel é a
 * senha. O id vem do Auth (o usuário dono do e-mail), não do navegador.
 * Conta sem ficha de corretor (o administrador da plataforma) recebe o nome
 * da instalação.
 */
async function nomeDoGrupoDoUsuario(userId: string): Promise<string> {
  try {
    const servico = createServiceClient();
    const { data: ficha } = await servico
      .from("corretores")
      .select("grupo_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!ficha?.grupo_id) return site.nome;

    const { data: grupo } = await servico.from("grupos").select("nome").eq("id", ficha.grupo_id).maybeSingle();
    return grupo?.nome || site.nome;
  } catch (e) {
    console.error(`[esqueci-a-senha] não leu o grupo: ${e instanceof Error ? e.message : String(e)}`);
    return site.nome;
  }
}
