"use server";

import { redirect } from "next/navigation";
import { DESTINO_SEM_LINK, sessaoAbertaPorLink } from "@/lib/auth/sessaoPorLink";
import { erroDaSenha } from "@/lib/auth/politicaDeSenha";
import { registrarSenhaTrocada } from "@/lib/auth/validadeDaSenhaNoServidor";
import { createClient } from "@/lib/supabase/server";

export type EstadoDefinirSenha = { erro?: string } | undefined;


/**
 * Define a senha de quem chegou pelo link do convite ou da recuperação.
 *
 * Não pede a senha atual, ao contrário de `trocarSenha`: quem foi convidado
 * nunca teve uma, e quem esqueceu não sabe qual é. O que autoriza é a sessão
 * que o botão de `/auth/continuar` abriu a partir do link — e o link só funciona uma
 * vez.
 *
 * Só essa sessão: o claim `amr` precisa dizer que ela nasceu de um link há
 * menos de 15 minutos (`sessaoAbertaPorLink`). Qualquer outra (login com
 * senha, link aberto ontem, sessão roubada) vai para `/corretor/senha`, que
 * pede a senha atual. `getClaims`, e não `getUser`, porque o `amr` está no
 * JWT; a gravação da senha confere a sessão no Auth de qualquer jeito.
 *
 * Zera `deve_trocar_senha`: a senha agora é escolhida pela pessoa, então o
 * login deixa de mandá-la para a troca obrigatória.
 */
export async function definirSenha(
  _estado: EstadoDefinirSenha,
  formData: FormData,
): Promise<EstadoDefinirSenha> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  if (!userId) redirect("/corretor/entrar");
  if (!sessaoAbertaPorLink(data?.claims)) redirect(DESTINO_SEM_LINK);

  const nova = String(formData.get("nova") ?? "");
  const confirmacao = String(formData.get("confirmacao") ?? "");

  // A régua da Astro (29/10/2026): maiúscula, minúscula, número, símbolo, 8+.
  const fraca = erroDaSenha(nova);
  if (fraca) return { erro: fraca };
  if (nova !== confirmacao) {
    return { erro: "A confirmação não confere com a senha." };
  }

  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) return { erro: fraseDoErroDaSenha((error as { code?: string }).code) };

  const { error: erroDaFicha } = await supabase
    .from("corretores")
    .update({ deve_trocar_senha: false })
    .eq("user_id", userId);
  if (erroDaFicha) {
    // A senha já foi gravada: a pessoa entra com ela. O pior caso é o login
    // pedir a troca uma vez, com a senha que ela acabou de escolher.
    console.error(`[definir-senha] não zerou deve_trocar_senha: ${erroDaFicha.message}`);
  }

  // Começam os 90 dias desta senha; a sessão é renovada para o JWT trazer a
  // data nova (ver `trocarSenha`).
  // A troca obrigatória do administrador sem ficha mora no `app_metadata`
  // (`administradoresAcoes.ts`): a senha escolhida pelo link também a desliga.
  const { data: depois } = await supabase.auth.getUser();
  const meta = { ...((depois.user?.app_metadata as Record<string, unknown> | undefined) ?? {}) };
  if (meta.deve_trocar_senha === true) meta.deve_trocar_senha = false;
  await registrarSenhaTrocada(userId, meta);
  await supabase.auth.refreshSession();

  redirect("/corretor");
}

/**
 * O Auth recusa a senha por dois motivos que a pessoa resolve na hora, sem
 * link novo: senha fraca demais e senha igual à atual. Mandar pedir outro
 * link nesses casos gastaria um link (e a paciência) à toa. Só o resto —
 * sessão que venceu no meio, falha do Auth — leva ao "Esqueci a senha".
 */
function fraseDoErroDaSenha(codigo: string | undefined): string {
  if (codigo === "weak_password") {
    return "Essa senha é fácil de adivinhar. Escolha outra, mais longa, misturando letras e números.";
  }
  if (codigo === "same_password") {
    return "Essa já é a sua senha atual. Escolha uma diferente.";
  }
  return "Não foi possível salvar a senha agora. Tente de novo; se o link tiver vencido, peça outro em \"Esqueci a senha\".";
}
