"use server";

import { revalidatePath } from "next/cache";
import { revalidarCorretores } from "@/lib/catalogo/revalidar";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { ehUuid } from "@/lib/plataforma/dadosDoGrupo";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * A equipe de QUALQUER grupo pela plataforma (pedido do dono, 29/10/2026):
 * desativar, reativar e trocar o papel (gestor ↔ corretor) de um acesso. A
 * senha tem a própria ação (`redefinirSenhaDoAcesso`, em `acoes.ts`).
 *
 * É o mesmo gesto do gestor em `corretor/(painel)/admin/acoes.ts`
 * (`alternarAtivoCorretor`, `alterarPapelCorretor`), com duas diferenças:
 *
 * - Quem decide é `exigirAdminDaPlataformaNaAcao()`, e a escrita vai pela
 *   chave de serviço: o operador não é gestor do grupo, então nem a RLS nem
 *   `definir_papel_corretor` (que confere `eh_gestor()` pela sessão) o
 *   deixariam agir. Toda leitura e toda escrita filtram o `grupo_id` da
 *   página: um id de corretor de outro grupo não é achado.
 * - O último gestor ativo é conferido AQUI, antes do banco, para a tela dizer
 *   o que fazer. O gatilho `garantir_gestor_remanescente` (0192) recusa do
 *   mesmo jeito, também pela chave de serviço — é a rede de baixo.
 *
 * Desativar é `ativo = false`, nunca DELETE. O efeito vem do banco:
 * `corretor_atual()`, `grupo_atual()` e `eh_gestor()` filtram `ativo` (0181),
 * então o login deixa de enxergar o grupo na próxima requisição, e a roleta
 * (`distribuir_lead`) já não o sorteia. Os leads da carteira NÃO mudam de mão:
 * a plataforma não lê lead (§4), só conta, e a divisão da carteira é do
 * gestor do grupo (Contas → saída do corretor). A contagem volta para a tela
 * avisar.
 */

export type ResultadoDaEquipe =
  | { ok: true; mensagem: string; leadsNaCarteira?: number }
  | { ok: false; erro: string };

const ERRO_GENERICO = "Não foi possível concluir agora. Tente de novo.";
const SEM_GESTOR =
  "A imobiliária ficaria sem nenhum administrador (gestor) ativo. Promova outro acesso a administrador (ou reative um) antes.";

type Servico = ReturnType<typeof createServiceClient>;
type Ficha = { id: string; nome: string; papel: string; ativo: boolean };

async function lerFicha(servico: Servico, grupoId: string, corretorId: string) {
  return servico
    .from("corretores")
    .select("id, nome, papel, ativo")
    .eq("id", corretorId)
    .eq("grupo_id", grupoId)
    .maybeSingle();
}

/** Outros gestores ATIVOS do grupo, sem contar a ficha alvo. `null` = não deu para contar. */
async function outrosGestoresAtivos(servico: Servico, grupoId: string, corretorId: string): Promise<number | null> {
  const { count, error } = await servico
    .from("corretores")
    .select("id", { count: "exact", head: true })
    .eq("grupo_id", grupoId)
    .eq("papel", "gestor")
    .eq("ativo", true)
    .neq("id", corretorId);
  if (error) {
    console.error(`[plataforma] gestores do grupo ${grupoId} não contados: ${error.message}`);
    return null;
  }
  return count ?? 0;
}

/** O gatilho da 0192 recusou: a mesma frase da conferência de cima. */
function traduzirErro(mensagem: string): string {
  return mensagem.includes("sem nenhum gestor ativo") ? SEM_GESTOR : ERRO_GENERICO;
}

async function registrar(
  servico: Servico,
  evento: { grupoId: string; operador: string; acao: string; alvo: string; detalhes: Record<string, string | number | boolean> },
): Promise<void> {
  const { error } = await servico.from("admin_eventos").insert({
    grupo_id: evento.grupoId,
    ator_id: null,
    ator_plataforma_user_id: evento.operador,
    acao: evento.acao,
    alvo_corretor_id: evento.alvo,
    detalhes: { origem: "plataforma", ...evento.detalhes },
  });
  if (error) console.error(`[plataforma] evento ${evento.acao} (${evento.alvo}) não gravado: ${error.message}`);
}

function atualizarTelas(grupoId: string): void {
  // O site e a página da equipe leem os corretores de um cache de dados.
  revalidarCorretores();
  revalidatePath(`/plataforma/grupos/${grupoId}`);
  revalidatePath("/plataforma/acessos");
  revalidatePath("/plataforma");
  revalidatePath("/corretor/admin/contas");
}

/** Desativa (`ativo = false`) ou reativa um acesso do grupo. */
export async function alternarAtivoDoAcesso(
  grupoId: string,
  corretorId: string,
  ativo: boolean,
): Promise<ResultadoDaEquipe> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId) || !ehUuid(corretorId)) return { ok: false, erro: "Acesso não encontrado." };
  if (typeof ativo !== "boolean") return { ok: false, erro: ERRO_GENERICO };

  const servico = createServiceClient();
  const { data: ficha, error: erroFicha } = await lerFicha(servico, grupoId, corretorId);
  if (erroFicha) {
    console.error(`[plataforma] ficha ${corretorId} não lida: ${erroFicha.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!ficha) return { ok: false, erro: "Acesso não encontrado." };
  const alvo = { ...(ficha as Ficha) };
  if (alvo.ativo === ativo) {
    return { ok: false, erro: ativo ? `${alvo.nome} já está ativo.` : `${alvo.nome} já está desativado.` };
  }

  if (!ativo && alvo.papel === "gestor") {
    const outros = await outrosGestoresAtivos(servico, grupoId, corretorId);
    if (outros === null) return { ok: false, erro: ERRO_GENERICO };
    if (outros === 0) return { ok: false, erro: SEM_GESTOR };
  }

  const { data, error } = await servico
    .from("corretores")
    .update({ ativo })
    .eq("id", corretorId)
    .eq("grupo_id", grupoId)
    .select("id");
  if (error) {
    console.error(`[plataforma] ativo do acesso ${corretorId} não gravado: ${error.message}`);
    return { ok: false, erro: traduzirErro(error.message) };
  }
  if (!data || data.length === 0) return { ok: false, erro: "Acesso não encontrado." };

  await registrar(servico, {
    grupoId,
    operador: guarda.userId,
    acao: ativo ? "corretor_reativado" : "corretor_desativado",
    alvo: corretorId,
    detalhes: {},
  });
  atualizarTelas(grupoId);

  if (ativo) return { ok: true, mensagem: `${alvo.nome} foi reativado e volta à roleta de leads.` };

  // Só a contagem (head: true): a plataforma não lê lead (§4). Falhar aqui
  // não desfaz nada; a tela só não mostra o número.
  const { count, error: erroDaContagem } = await servico
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("grupo_id", grupoId)
    .eq("corretor_id", corretorId);
  if (erroDaContagem) console.error(`[plataforma] carteira de ${corretorId} não contada: ${erroDaContagem.message}`);
  return {
    ok: true,
    mensagem: `${alvo.nome} foi desativado: perde o acesso ao painel e sai da roleta de leads.`,
    ...(erroDaContagem ? {} : { leadsNaCarteira: count ?? 0 }),
  };
}

/** Promove a gestor ou volta a corretor um acesso do grupo. */
export async function alterarPapelDoAcesso(
  grupoId: string,
  corretorId: string,
  papel: "gestor" | "corretor",
): Promise<ResultadoDaEquipe> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };
  if (!ehUuid(grupoId) || !ehUuid(corretorId)) return { ok: false, erro: "Acesso não encontrado." };
  if (papel !== "gestor" && papel !== "corretor") return { ok: false, erro: "Papel inválido." };

  const servico = createServiceClient();
  const { data: ficha, error: erroFicha } = await lerFicha(servico, grupoId, corretorId);
  if (erroFicha) {
    console.error(`[plataforma] ficha ${corretorId} não lida: ${erroFicha.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!ficha) return { ok: false, erro: "Acesso não encontrado." };
  const alvo = { ...(ficha as Ficha) };
  if (alvo.papel === papel) {
    return { ok: false, erro: papel === "gestor" ? `${alvo.nome} já é administrador.` : `${alvo.nome} já é corretor.` };
  }

  // Gestor DESATIVADO que vira corretor não tira gestor ativo de ninguém,
  // mas o gatilho da 0192 olha só o papel antigo: a conta é a mesma dele.
  if (alvo.papel === "gestor") {
    const outros = await outrosGestoresAtivos(servico, grupoId, corretorId);
    if (outros === null) return { ok: false, erro: ERRO_GENERICO };
    if (outros === 0) return { ok: false, erro: SEM_GESTOR };
  }

  const { data, error } = await servico
    .from("corretores")
    .update({ papel })
    .eq("id", corretorId)
    .eq("grupo_id", grupoId)
    .select("id");
  if (error) {
    console.error(`[plataforma] papel do acesso ${corretorId} não gravado: ${error.message}`);
    return { ok: false, erro: traduzirErro(error.message) };
  }
  if (!data || data.length === 0) return { ok: false, erro: "Acesso não encontrado." };

  // Mesmo `detalhes.papel` que `definir_papel_corretor` grava (0192), mais o de antes.
  await registrar(servico, {
    grupoId,
    operador: guarda.userId,
    acao: "papel_alterado",
    alvo: corretorId,
    detalhes: { papel, antes: alvo.papel },
  });
  atualizarTelas(grupoId);
  return {
    ok: true,
    mensagem: papel === "gestor" ? `${alvo.nome} agora administra a imobiliária.` : `${alvo.nome} voltou a ser corretor.`,
  };
}
