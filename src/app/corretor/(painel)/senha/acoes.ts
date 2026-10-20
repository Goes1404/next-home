"use server";

import { redirect } from "next/navigation";
import { pedirLinkDeSenhaDaConta } from "@/lib/auth/pedidoDeLinkDeSenha";
import { createClient } from "@/lib/supabase/server";

/**
 * "Sair e receber novo link": a saída de quem foi convidado, abriu o link,
 * passou dos 15 minutos sem criar a senha e caiu em `/corretor/senha`, que
 * pede a senha atual que ele nunca teve.
 *
 * Manda o link de senha para o e-mail DA CONTA (o do Auth da própria
 * sessão, nunca um digitado), com o mesmo limite do "Esqueci a senha", e só
 * então fecha a sessão. Se o link não saiu, a sessão fica e a tela diz por
 * quê: sair sem link deixaria a pessoa sem nenhum caminho de volta.
 *
 * Aqui não há o que esconder: quem pede é o dono da conta, já logado.
 */
export async function sairEReceberNovoLink(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const usuario = data?.user;
  if (!usuario) redirect("/corretor/entrar");
  if (!usuario.email) redirect("/corretor/senha?link=vencido&pedido=falhou");

  const desfecho = await pedirLinkDeSenhaDaConta(usuario.id, usuario.email);
  if (desfecho === "limite") redirect("/corretor/senha?link=vencido&pedido=espera");
  if (desfecho !== "enviado") redirect("/corretor/senha?link=vencido&pedido=falhou");

  await supabase.auth.signOut();
  redirect("/corretor/esqueci-a-senha?enviado=conta");
}
