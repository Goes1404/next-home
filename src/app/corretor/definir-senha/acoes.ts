"use server";

import { redirect } from "next/navigation";
import { DESTINO_SEM_LINK, sessaoAbertaPorLink } from "@/lib/auth/sessaoPorLink";
import { createClient } from "@/lib/supabase/server";

export type EstadoDefinirSenha = { erro?: string } | undefined;

/** A mesma régua da troca de senha do painel (`trocarSenha`). */
const MINIMO_DA_SENHA = 8;

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

  if (nova.length < MINIMO_DA_SENHA) {
    return { erro: `A senha precisa ter pelo menos ${MINIMO_DA_SENHA} caracteres.` };
  }
  if (nova !== confirmacao) {
    return { erro: "A confirmação não confere com a senha." };
  }

  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) {
    return { erro: "Não foi possível salvar a senha agora. Tente de novo; se o link tiver vencido, peça outro em \"Esqueci a senha\"." };
  }

  const { error: erroDaFicha } = await supabase
    .from("corretores")
    .update({ deve_trocar_senha: false })
    .eq("user_id", userId);
  if (erroDaFicha) {
    // A senha já foi gravada: a pessoa entra com ela. O pior caso é o login
    // pedir a troca uma vez, com a senha que ela acabou de escolher.
    console.error(`[definir-senha] não zerou deve_trocar_senha: ${erroDaFicha.message}`);
  }

  redirect("/corretor");
}
