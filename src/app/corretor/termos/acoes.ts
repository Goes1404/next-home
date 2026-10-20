"use server";

import { redirect } from "next/navigation";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import { caminhoDepoisDoAceite, VERSAO_DOS_TERMOS } from "@/lib/termos/termos";

/**
 * Grava o aceite da versão vigente dos termos (0198) e segue para o painel.
 *
 * Pela SESSÃO: a policy só deixa o corretor gravar o próprio aceite, e o
 * grant só deixa mandar quem e qual versão (o grupo e a data são do banco).
 * Aceitar de novo a mesma versão bate na chave única e é tratado como já
 * aceito, para um clique duplo não virar erro na tela.
 */
export async function aceitarTermos(_estado: { erro: string } | undefined): Promise<{ erro: string } | undefined> {
  const corretor = await getCorretorLogado();
  if (!corretor) redirect("/corretor/entrar");

  const supabase = await createClient();
  const { error } = await supabase
    .from("aceites_de_termos")
    .insert({ corretor_id: corretor.id, versao: VERSAO_DOS_TERMOS });

  if (error && error.code !== "23505") {
    console.error("[termos] não consegui gravar o aceite:", error.message);
    return { erro: "Não consegui registrar seu aceite agora. Tente de novo em alguns segundos." };
  }

  const { data: ficha } = await supabase
    .from("corretores")
    .select("deve_trocar_senha")
    .eq("id", corretor.id)
    .maybeSingle();

  redirect(caminhoDepoisDoAceite(Boolean(ficha?.deve_trocar_senha)));
}
