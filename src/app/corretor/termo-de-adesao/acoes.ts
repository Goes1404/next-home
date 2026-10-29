"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";
import { hashDoIp, navegadorDoAceite, segredoDoAceite } from "@/lib/termos/aceiteDoTermoDeAdesao";
import { caminhoDepoisDoAceite } from "@/lib/termos/termos";
import { VERSAO_DO_TERMO_DE_ADESAO } from "@/lib/termos/termoDeAdesao";
import { ipDaRequisicao } from "@/lib/whatsapp/medicaoDoLink";

/**
 * Grava o aceite do termo de adesão pela conta (0247) e segue para o painel.
 *
 * Só o GESTOR aceita (é o contrato da conta). Pela chave de serviço, DEPOIS
 * da sessão: o grupo, o login, o nome e o e-mail saem da sessão, e o hash do
 * IP e o navegador saem dos cabeçalhos desta requisição — nada vem do
 * formulário (por isso não há grant de insert para o `authenticated`).
 *
 * Um aceite por grupo e versão: o segundo gestor (ou o clique duplo) bate na
 * chave única e é tratado como já aceito. O rastro vai também para
 * `admin_eventos` do grupo (`termo_de_adesao_aceito`).
 */
export async function aceitarTermoDeAdesao(
  _estado: { erro: string } | undefined,
): Promise<{ erro: string } | undefined> {
  const corretor = await getCorretorLogado();
  if (!corretor) redirect("/corretor/entrar");
  if (corretor.papel !== "gestor") {
    return { erro: "Quem aceita o termo é o gestor da conta. Você já pode usar o painel normalmente." };
  }

  const cabecalhos = await headers();
  const segredo = segredoDoAceite();
  const servico = createServiceClient();

  const { data: ficha } = await servico
    .from("corretores")
    .select("user_id, email, deve_trocar_senha")
    .eq("id", corretor.id)
    .eq("grupo_id", corretor.grupoId)
    .maybeSingle();
  if (!ficha?.user_id) {
    return { erro: "Não consegui confirmar seu acesso agora. Entre de novo e tente outra vez." };
  }

  const { error } = await servico.from("aceites_do_termo_de_adesao").insert({
    grupo_id: corretor.grupoId,
    corretor_id: corretor.id,
    user_id: ficha.user_id,
    versao: VERSAO_DO_TERMO_DE_ADESAO,
    nome_no_aceite: corretor.nome.slice(0, 200),
    email_no_aceite: ficha.email ? String(ficha.email).slice(0, 320) : null,
    ip_hash: hashDoIp(ipDaRequisicao(cabecalhos), segredo),
    user_agent: navegadorDoAceite(cabecalhos.get("user-agent")),
  });

  if (error && error.code !== "23505") {
    console.error("[termo de adesão] não consegui gravar o aceite:", error.message);
    return { erro: "Não consegui registrar o aceite agora. Tente de novo em alguns segundos." };
  }

  if (!error) {
    const { error: erroDoEvento } = await servico.from("admin_eventos").insert({
      grupo_id: corretor.grupoId,
      acao: "termo_de_adesao_aceito",
      ator_id: corretor.id,
      ator_plataforma_user_id: null,
      alvo_corretor_id: null,
      detalhes: { origem: "painel", versao: VERSAO_DO_TERMO_DE_ADESAO },
    });
    if (erroDoEvento) console.error(`[termo de adesão] evento do grupo ${corretor.grupoId} não gravado: ${erroDoEvento.message}`);
  }

  redirect(caminhoDepoisDoAceite(Boolean(ficha.deve_trocar_senha)));
}
