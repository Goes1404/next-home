"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { ehUuid } from "@/lib/plataforma/dadosDoGrupo";
import { ehEnderecoSoDoPainel } from "@/lib/enderecosDoPainel";
import { revalidarSitePublico } from "@/lib/sites/revalidar";
import { dominioDaPlataforma, ehEnderecoDaNextHome } from "@/lib/sites/hostsDaPlataforma";
import { TAG_ENDERECOS } from "@/lib/sites/tags";
import { lerHostDigitado, type TipoDeEndereco } from "@/lib/sites/siteEditavel";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Os endereços do site de um grupo, na plataforma (0201 + "Meu site", 0209).
 *
 * Só o administrador da plataforma liga ou tira um endereço: o domínio
 * também precisa estar em Vercel → Settings → Domains, e é a plataforma que
 * cuida disso. A chave de serviço nunca decide QUEM pode
 * (`exigirAdminDaPlataformaNaAcao` vem sempre primeiro); `enderecos_do_site`
 * não tem grant para o logado. A Next Home (grupo 1) tem os endereços no
 * código (`ENDERECOS_DA_NEXT_HOME`) e não se mexe aqui.
 */

export type ResultadoDoEndereco = { ok: true } | { ok: false; erro: string };

type Servico = ReturnType<typeof createServiceClient>;

const ERRO_GENERICO = "Não foi possível salvar agora. Tente de novo.";

async function registrarEvento(
  servico: Servico,
  grupoId: string,
  userId: string,
  acao: "endereco_do_site_ligado" | "endereco_do_site_removido",
  detalhes: Record<string, string | boolean | null>,
) {
  const { error } = await servico.from("admin_eventos").insert({
    grupo_id: grupoId,
    acao,
    ator_id: null,
    ator_plataforma_user_id: userId,
    alvo_corretor_id: null,
    detalhes: { origem: "plataforma", ...detalhes },
  });
  if (error) console.error(`[plataforma] evento ${acao} (${grupoId}) não gravado: ${error.message}`);
}

function atualizarTelas(grupoId: string) {
  revalidatePath(`/plataforma/grupos/${grupoId}`);
  revalidateTag(TAG_ENDERECOS, "max");
  revalidarSitePublico();
}

/** Liga um endereço ao site do grupo. O primeiro endereço do grupo já nasce como principal. */
export async function ligarEnderecoDoSite(
  grupoId: string,
  pedido: { host: string; tipo: TipoDeEndereco; principal: boolean },
): Promise<ResultadoDoEndereco> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId)) return { ok: false, erro: "Grupo não encontrado." };
  if (grupoId === GRUPO_NEXT_HOME_ID) return { ok: false, erro: "Os endereços da Next Home ficam no código; não se mudam aqui." };
  if (pedido.tipo !== "proprio" && pedido.tipo !== "gratuito") return { ok: false, erro: "Tipo de endereço inválido." };

  const lido = lerHostDigitado(pedido.host);
  if (!lido.ok) return { ok: false, erro: lido.erro };
  const host = lido.host;
  const dominio = dominioDaPlataforma();
  if (ehEnderecoDaNextHome(host) || ehEnderecoSoDoPainel(host) || (dominio && (host === dominio || host.endsWith(`.${dominio}`)))) {
    return { ok: false, erro: "Este endereço é da plataforma e não pode ser ligado a um grupo." };
  }

  const servico = createServiceClient();
  const { data: grupo, error: erroDoGrupo } = await servico.from("grupos").select("id").eq("id", grupoId).maybeSingle();
  if (erroDoGrupo) {
    console.error(`[plataforma] grupo ${grupoId} não lido para ligar endereço: ${erroDoGrupo.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!grupo) return { ok: false, erro: "Grupo não encontrado." };

  const { data: existentes, error: erroDaLista } = await servico
    .from("enderecos_do_site")
    .select("host, principal")
    .eq("grupo_id", grupoId);
  if (erroDaLista) {
    console.error(`[plataforma] endereços do grupo ${grupoId} não lidos: ${erroDaLista.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  const principalAtual = (existentes ?? []).find((e) => e.principal)?.host ?? null;
  const principal = pedido.principal || (existentes ?? []).length === 0;

  // Um principal por grupo (índice único da 0201): quem vai ser o novo principal
  // tira a marca do antigo antes, e a devolve se a inclusão falhar.
  if (principal && principalAtual) {
    const { error } = await servico.from("enderecos_do_site").update({ principal: false }).eq("host", principalAtual).eq("grupo_id", grupoId);
    if (error) {
      console.error(`[plataforma] principal ${principalAtual} não solto: ${error.message}`);
      return { ok: false, erro: ERRO_GENERICO };
    }
  }

  const { error } = await servico.from("enderecos_do_site").insert({ host, grupo_id: grupoId, tipo: pedido.tipo, principal });
  if (error) {
    if (principal && principalAtual) {
      await servico.from("enderecos_do_site").update({ principal: true }).eq("host", principalAtual).eq("grupo_id", grupoId);
    }
    if (error.code === "23505") return { ok: false, erro: "Este endereço já está ligado a um grupo. Cada endereço serve um site só." };
    console.error(`[plataforma] endereço ${host} do grupo ${grupoId} não gravado: ${error.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }

  await registrarEvento(servico, grupoId, guarda.userId, "endereco_do_site_ligado", { host, tipo: pedido.tipo, principal });
  atualizarTelas(grupoId);
  return { ok: true };
}

/** Tira um endereço. O endereço tem de ser do grupo informado. */
export async function removerEnderecoDoSite(grupoId: string, hostDigitado: string): Promise<ResultadoDoEndereco> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId)) return { ok: false, erro: "Grupo não encontrado." };
  if (grupoId === GRUPO_NEXT_HOME_ID) return { ok: false, erro: "Os endereços da Next Home ficam no código; não se mudam aqui." };
  const lido = lerHostDigitado(hostDigitado);
  if (!lido.ok) return { ok: false, erro: "Endereço não encontrado." };

  const servico = createServiceClient();
  const { data, error } = await servico
    .from("enderecos_do_site")
    .delete()
    .eq("host", lido.host)
    .eq("grupo_id", grupoId)
    .select("host, tipo, principal");
  if (error) {
    console.error(`[plataforma] endereço ${lido.host} do grupo ${grupoId} não removido: ${error.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!data || data.length === 0) return { ok: false, erro: "Endereço não encontrado neste grupo." };

  await registrarEvento(servico, grupoId, guarda.userId, "endereco_do_site_removido", {
    host: data[0].host,
    tipo: data[0].tipo,
    principal: data[0].principal,
  });
  atualizarTelas(grupoId);
  return { ok: true };
}
