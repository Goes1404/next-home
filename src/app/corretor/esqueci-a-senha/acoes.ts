"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { pedirLinkDeSenhaPorEmail } from "@/lib/auth/pedidoDeLinkDeSenha";

/**
 * "Esqueci a senha": pede o link de recuperação por e-mail.
 *
 * É PÚBLICA, e por isso não revela nada. A resposta é sempre a mesma tela
 * ("Se houver uma conta com este e-mail, enviamos um link."), exista ou não
 * a conta, seja ou não o endereço de acesso antigo (`@nexthome.com`, domínio
 * de terceiro, que não recebe link), saia ou não o e-mail, e esteja ou não o
 * e-mail acima do limite de pedidos. Uma resposta diferente para "não existe"
 * transformaria a tela num jeito de descobrir quem tem login na plataforma, e
 * em qual grupo.
 *
 * O trabalho de verdade (achar a ficha, conferir o limite, gerar o link,
 * mandar o e-mail) roda em `after`, depois da resposta: senão a conta que
 * existe demoraria o tempo de um envio a mais, e o relógio contaria o que o
 * texto esconde. O limite (1 pedido por minuto, 5 por hora, por e-mail) mora
 * em `pedidoDeLinkDeSenha.ts`.
 */
export async function pedirLinkDeSenha(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  if (email.includes("@")) {
    after(async () => {
      const desfecho = await pedirLinkDeSenhaPorEmail(email);
      if (desfecho === "limite") console.warn("[esqueci-a-senha] pedido acima do limite; nada enviado");
    });
  }

  redirect("/corretor/esqueci-a-senha?enviado=1");
}
