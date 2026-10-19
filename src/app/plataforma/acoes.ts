"use server";

import { revalidatePath } from "next/cache";
import { MENSAGEM_EMAIL_EM_USO } from "@/lib/corretores/acessoDaConta";
import { convidarCorretorDoGrupo } from "@/lib/corretores/convite";
import { normalizarParaEmail } from "@/lib/corretores/credenciaisIniciais";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import {
  validarDadosDoGrupo,
  validarNovoGrupo,
  type DadosDoGrupo,
  type DadosNovoGrupo,
} from "@/lib/plataforma/dadosDoGrupo";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Ações do painel da plataforma (fase 2A, desenho §11).
 *
 * Mesma regra de ouro de `corretor/(painel)/admin/acoes.ts`: a chave de
 * serviço nunca decide QUEM pode. Quem decide é
 * `exigirAdminDaPlataformaNaAcao()`, pela sessão; a chave só entra depois,
 * porque o operador age em grupos que a RLS dele não alcança (e o
 * `criar_grupo` só executa pela chave, 0186).
 *
 * Nada aqui lê conversa, ficha nem lead (§4): cadastro do grupo e do
 * primeiro acesso, e mais nada (`servicoComGrupo.test.ts`, `plataforma-admin`).
 */

type Servico = ReturnType<typeof createServiceClient>;

export type ResultadoNovoGrupo =
  | { ok: true; grupoId: string; email: string; enviado: boolean; url?: string }
  | { ok: false; erro: string };

/**
 * O e-mail já é de alguma ficha (de qualquer grupo)? A plataforma não chama
 * `email_de_acesso_livre` (0183), que é do gestor: a mesma pergunta vai pela
 * chave de serviço, e só a contagem volta. Conferir antes de criar o grupo
 * poupa criar e desfazer; o Auth ainda recusa e-mail com login no convite.
 */
async function emailEmFicha(servico: Servico, email: string): Promise<boolean> {
  const { count, error } = await servico
    .from("corretores")
    .select("id", { count: "exact", head: true })
    .eq("email", email);
  if (error) {
    // "Não sei" não vira "em uso": o Auth decide no convite.
    console.error("[plataforma] falha ao conferir o e-mail nas fichas:", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

/**
 * Primeiro slug de corretor livre a partir do nome, olhando TODOS os grupos
 * (o slug de corretor é global até a fase 3). É a regra de
 * `slug_de_corretor_livre` (0183), que exige gestor; o operador não é, então
 * a pergunta vai pela chave de serviço. Erro na conferência não vira
 * "livre": o slug sai com o sufixo de tempo.
 */
async function slugDeCorretorLivre(servico: Servico, nome: string): Promise<string> {
  const base = normalizarParaEmail(nome) || "corretor";
  for (let sufixo = 0; sufixo < 50; sufixo++) {
    const slug = sufixo === 0 ? base : `${base}-${sufixo + 1}`;
    const { count, error } = await servico
      .from("corretores")
      .select("id", { count: "exact", head: true })
      .eq("slug", slug);
    if (error) {
      console.error("[plataforma] falha ao conferir slug de corretor livre:", error.message);
      break;
    }
    if ((count ?? 0) === 0) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Desfaz um grupo recém-criado que não chegou ao fim (ficha ou convite
 * falharam). Nenhuma chave estrangeira para `grupos` apaga em cascata, então
 * a ordem é a das chaves: as linhas que `criar_grupo` gravou (evento, taxas,
 * fiscal) e a ficha, e só então o grupo — é isso que devolve o endereço.
 *
 * O login: o convite já apaga o usuário que criou quando o vínculo falha;
 * aqui só se apaga o que ficou VINCULADO a esta ficha. Um login de outra
 * ficha (o Auth reaproveita convite pendente) nunca é vinculado aqui, então
 * nunca é apagado.
 */
async function desfazerGrupo(servico: Servico, grupoId: string, corretorId: string | null): Promise<void> {
  if (corretorId) {
    const { data: ficha } = await servico
      .from("corretores")
      .select("user_id")
      .eq("id", corretorId)
      .eq("grupo_id", grupoId)
      .maybeSingle();
    if (ficha?.user_id) {
      const { error } = await servico.auth.admin.deleteUser(ficha.user_id);
      if (error) console.error(`[plataforma] login do grupo desfeito não apagado: ${error.message}`);
    }
  }

  const passos = [
    () => servico.from("admin_eventos").delete().eq("grupo_id", grupoId),
    () => servico.from("parametros_credito").delete().eq("grupo_id", grupoId),
    () => servico.from("fiscal_config").delete().eq("grupo_id", grupoId),
    () => servico.from("corretores").delete().eq("grupo_id", grupoId),
    () => servico.from("grupos").delete().eq("id", grupoId),
  ];
  for (const passo of passos) {
    const { error } = await passo();
    if (error) {
      // Parar aqui: apagar o grupo com linhas dele ainda vivas bateria na
      // chave estrangeira do mesmo jeito. O endereço fica preso, e o log diz qual.
      console.error(`[plataforma] grupo ${grupoId} não foi desfeito por inteiro: ${error.message}`);
      return;
    }
  }
}

function erroDoCriarGrupo(error: { message: string; code?: string }): string {
  if (error.code === "23505") return "Esse endereço já é de outro grupo. Escolha outro.";
  console.error("[plataforma] criar_grupo falhou:", error.message);
  return "Não foi possível criar o grupo agora. Tente de novo.";
}

/**
 * Cria o grupo e o primeiro acesso numa operação só: `criar_grupo` (grupo,
 * taxas, fiscal, evento), a ficha do primeiro corretor como GESTORA do grupo
 * — inclusive o independente, que é gestor do próprio grupo (§18) — e o
 * convite pelo mesmo caminho do gestor (`convidarCorretorDoGrupo`).
 *
 * Se a ficha ou o convite falham, o grupo é desfeito: um grupo sem ninguém
 * que entre nele não serve, e o endereço ficaria preso pela unicidade.
 */
export async function criarGrupoComPrimeiroAcesso(dados: DadosNovoGrupo): Promise<ResultadoNovoGrupo> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };

  const validacao = validarNovoGrupo(dados);
  if (!validacao.ok) return { ok: false, erro: validacao.erro };
  const d = validacao.dados;

  const servico = createServiceClient();
  if (await emailEmFicha(servico, d.primeiro.email)) return { ok: false, erro: MENSAGEM_EMAIL_EM_USO };

  const { data: grupoId, error: erroGrupo } = await servico.rpc("criar_grupo", {
    p_nome: d.nome,
    p_slug: d.slug,
    p_tipo: d.tipo,
    p_plano: d.plano,
    p_contato: d.contato,
    p_criado_por: guarda.userId,
  });
  if (erroGrupo || !grupoId) {
    return { ok: false, erro: erroDoCriarGrupo(erroGrupo ?? { message: "sem id" }) };
  }

  const slug = await slugDeCorretorLivre(servico, d.primeiro.nome);
  // Pela chave de serviço não há sessão para o gatilho tirar o grupo: ele vai explícito.
  const { data: ficha, error: erroFicha } = await servico
    .from("corretores")
    .insert({
      nome: d.primeiro.nome,
      creci: d.primeiro.creci,
      whatsapp: d.primeiro.whatsapp,
      slug,
      ativo: true,
      papel: "gestor",
      grupo_id: grupoId,
    })
    .select("id")
    .single();
  if (erroFicha || !ficha) {
    console.error("[plataforma] falha ao criar a ficha do primeiro acesso:", erroFicha?.message);
    await desfazerGrupo(servico, grupoId, null);
    return { ok: false, erro: "Não foi possível criar o primeiro acesso agora; o grupo foi desfeito. Tente de novo." };
  }

  const convite = await convidarCorretorDoGrupo({
    grupoId,
    corretorId: ficha.id,
    email: d.primeiro.email,
    ator: { plataformaUserId: guarda.userId },
    slug,
  });
  if (!convite.ok) {
    await desfazerGrupo(servico, grupoId, ficha.id);
    return { ok: false, erro: convite.erro };
  }

  revalidatePath("/plataforma");
  return {
    ok: true,
    grupoId,
    email: d.primeiro.email,
    enviado: convite.enviado,
    ...(convite.url ? { url: convite.url } : {}),
  };
}

export type ResultadoDadosDoGrupo = { ok: true } | { ok: false; erro: string };

/**
 * Contato de cobrança e dados institucionais do grupo. Plano, tipo e
 * endereço ficam de fora: o plano só muda no ciclo seguinte (§20), e nesta
 * fase é de leitura depois de criado.
 */
export async function editarDadosDoGrupo(grupoId: string, dados: DadosDoGrupo): Promise<ResultadoDadosDoGrupo> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };

  const validacao = validarDadosDoGrupo(dados);
  if (!validacao.ok) return { ok: false, erro: validacao.erro };

  const { data, error } = await createServiceClient()
    .from("grupos")
    .update(validacao.dados)
    .eq("id", grupoId)
    .select("id");
  if (error) {
    console.error(`[plataforma] dados do grupo ${grupoId} não gravados: ${error.message}`);
    return { ok: false, erro: "Não foi possível salvar agora. Tente de novo." };
  }
  if (!data || data.length === 0) return { ok: false, erro: "Grupo não encontrado." };

  revalidatePath(`/plataforma/grupos/${grupoId}`);
  return { ok: true };
}
