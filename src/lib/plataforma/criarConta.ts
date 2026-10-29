import "server-only";

import { MENSAGEM_EMAIL_EM_USO } from "@/lib/corretores/acessoDaConta";
import { convidarCorretorDoGrupo, type AtorDoAcesso } from "@/lib/corretores/convite";
import { normalizarParaEmail } from "@/lib/corretores/credenciaisIniciais";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { padraoDoEmail, type NovoGrupoValidado } from "@/lib/plataforma/dadosDoGrupo";
import { ACAO_GRUPO_DESFEITO, ORDEM_DO_DESFAZER, type PassoQueFalhou } from "@/lib/plataforma/desfazerGrupo";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";

/**
 * O núcleo da criação de conta (grupo + primeiro acesso), fora do arquivo
 * `"use server"` (29/10/2026, teste grátis): toda função exportada de um
 * arquivo de actions vira uma porta pública, e este núcleo NÃO pode ser uma.
 *
 * Duas origens, e cada uma traz a sua PROVA, conferida aqui antes de
 * qualquer escrita (`conferirOrigem`):
 *
 * - `plataforma`: a action de `src/app/plataforma/acoes.ts` passou pela
 *   guarda e manda o `userId` dela; aqui a guarda roda DE NOVO
 *   (`exigirAdminDaPlataformaNaAcao`) e o login tem de ser o mesmo. Chamar o
 *   núcleo "como plataforma" sem a sessão de um administrador não passa.
 * - `teste-gratis`: o assistente público `/astro/contratar` gravou o pedido
 *   com `teste_gratis = true` (0241: um por e-mail, WhatsApp e documento) e
 *   manda o id dele; aqui o pedido é relido pela chave e tem de estar
 *   `novo`, sem conta criada, com o MESMO e-mail do primeiro acesso e
 *   gravado há menos de 15 minutos. O rastro fica em `admin_eventos`
 *   (`convite_enviado` com `origem: teste-gratis` e o id do pedido; o
 *   `teste_gratis_iniciado` é gravado por quem chama), sem ator: quem criou
 *   foi o sistema.
 *
 * O resto é a criação de sempre: `criar_grupo` (grupo, taxas, fiscal,
 * evento), o cadastro que `criar_grupo` não recebe, a ficha do primeiro
 * corretor como GESTORA do grupo e o convite (`convidarCorretorDoGrupo`),
 * cujo link é a confirmação do e-mail. Se a ficha ou o convite falham, o
 * grupo é desfeito.
 *
 * Nada aqui lê conversa, ficha de cliente nem lead (§4).
 */

type Servico = ReturnType<typeof createServiceClient>;
type AtualizacaoDoGrupo = Database["public"]["Tables"]["grupos"]["Update"];

export type OrigemDaConta = { origem: "plataforma"; userId: string } | { origem: "teste-gratis"; pedidoId: string };

/** O que o grupo recebe além do que `criar_grupo` grava. */
export type CadastroDaConta = Pick<
  AtualizacaoDoGrupo,
  "razao_social" | "documento" | "creci" | "creci_tipo" | "mensalidade" | "dia_do_vencimento" | "teste_ate"
>;

export type ResultadoDaConta =
  | { ok: true; grupoId: string; email: string; enviado: boolean; url?: string }
  | { ok: false; erro: string };

/** Quanto tempo o pedido do teste vale como prova (a action cria logo depois de gravar). */
export const VALIDADE_DA_PROVA_DO_TESTE_MS = 15 * 60 * 1000;

const RECUSA_DA_PROVA = "Não foi possível confirmar o pedido. Tente de novo.";

/**
 * A prova da origem, ANTES de qualquer escrita. Devolve o ator do convite e
 * quem assina `criar_grupo`, ou a recusa.
 */
async function conferirOrigem(
  servico: Servico,
  origem: OrigemDaConta,
  email: string,
  agora: Date,
): Promise<{ ok: true; ator: AtorDoAcesso; operador: string | null } | { ok: false; erro: string }> {
  if (origem.origem === "plataforma") {
    const guarda = await exigirAdminDaPlataformaNaAcao();
    if ("erro" in guarda) return { ok: false, erro: guarda.erro };
    if (guarda.userId !== origem.userId) return { ok: false, erro: "Esta ação é restrita a quem administra a plataforma." };
    return { ok: true, ator: { plataformaUserId: guarda.userId }, operador: guarda.userId };
  }

  const { data: pedido, error } = await servico
    .from("pedidos_de_contratacao")
    .select("id, email, status, teste_gratis, grupo_criado_id, criado_em")
    .eq("id", origem.pedidoId)
    .maybeSingle();
  if (error) {
    console.error(`[teste grátis] pedido ${origem.pedidoId} não conferido: ${error.message}`);
    return { ok: false, erro: RECUSA_DA_PROVA };
  }
  const recente = pedido ? agora.getTime() - new Date(pedido.criado_em).getTime() < VALIDADE_DA_PROVA_DO_TESTE_MS : false;
  if (
    !pedido ||
    !pedido.teste_gratis ||
    pedido.status !== "novo" ||
    pedido.grupo_criado_id !== null ||
    pedido.email.trim().toLowerCase() !== email.trim().toLowerCase() ||
    !recente
  ) {
    console.error(`[teste grátis] pedido ${origem.pedidoId} não serve de prova para criar a conta`);
    return { ok: false, erro: RECUSA_DA_PROVA };
  }
  return { ok: true, ator: { sistema: "teste-gratis", pedidoId: pedido.id }, operador: null };
}

/**
 * O e-mail já é de alguma ficha (de qualquer grupo)? A plataforma não chama
 * `email_de_acesso_livre` (0192), que é do gestor: a mesma pergunta vai pela
 * chave de serviço, e só a contagem volta. Conferir antes de criar o grupo
 * poupa criar e desfazer; o Auth ainda recusa e-mail com login no convite.
 *
 * Sem diferença de maiúsculas: fichas gravadas antes da normalização têm
 * "Beto@Gmail.com", e o digitado chega em minúsculas.
 */
export async function emailEmFicha(servico: Servico, email: string): Promise<boolean> {
  const { count, error } = await servico
    .from("corretores")
    .select("id", { count: "exact", head: true })
    .ilike("email", padraoDoEmail(email));
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
 * `slug_de_corretor_livre` (0192), que exige gestor; o operador não é, então
 * a pergunta vai pela chave de serviço. Erro na conferência não vira
 * "livre": o slug sai com o sufixo de tempo.
 */
export async function slugDeCorretorLivre(servico: Servico, nome: string): Promise<string> {
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
 * falharam), na ordem de `ORDEM_DO_DESFAZER`, e deixa UM evento da
 * plataforma dizendo que a tentativa existiu.
 *
 * O login: o convite já apaga o usuário que criou quando o vínculo falha;
 * aqui só se apaga o que ficou VINCULADO a esta ficha, ou o login que o
 * convite não conseguiu conferir (`loginNaoConferido`) — e este só depois de
 * conferir de novo que ele não é de ficha nenhuma. Um login de outra ficha
 * (o Auth reaproveita convite pendente) nunca é apagado.
 */
async function desfazerGrupo(
  servico: Servico,
  tentativa: {
    grupoId: string;
    slug: string;
    passo: PassoQueFalhou;
    /** O login do administrador; `null` no teste grátis (quem criou foi o sistema). */
    operador: string | null;
    origem: OrigemDaConta["origem"];
    corretorId?: string;
    loginNaoConferido?: string;
  },
): Promise<void> {
  const { grupoId } = tentativa;
  if (tentativa.corretorId) {
    const { data: ficha } = await servico
      .from("corretores")
      .select("user_id")
      .eq("id", tentativa.corretorId)
      .eq("grupo_id", grupoId)
      .maybeSingle();
    if (ficha?.user_id) await apagarLogin(servico, ficha.user_id);
  }
  if (tentativa.loginNaoConferido) await apagarLoginSemFicha(servico, tentativa.loginNaoConferido);

  let desfeito = true;
  for (const { tabela, coluna } of ORDEM_DO_DESFAZER) {
    // Com a tabela numa união, o supabase-js não acha coluna em comum para o
    // `eq`; o par tabela/coluna de cada linha é conferido no banco
    // (`plataforma.db.test.ts` apaga pela mesma constante).
    const apagar = servico.from(tabela).delete() as unknown as {
      eq: (coluna: string, valor: string) => PromiseLike<{ error: { message: string } | null }>;
    };
    const { error } = await apagar.eq(coluna, grupoId);
    if (error) {
      // Parar aqui: apagar o grupo com linhas dele ainda vivas bateria na
      // chave estrangeira do mesmo jeito. O endereço fica preso, e o log diz qual.
      console.error(`[plataforma] grupo ${grupoId} não foi desfeito por inteiro (${tabela}): ${error.message}`);
      desfeito = false;
      break;
    }
  }

  // Depois dos deletes: o evento é da plataforma (sem grupo), então não sai
  // junto com os do grupo. Sem e-mail e sem nome — o endereço e o passo bastam.
  const { error: erroDoEvento } = await servico.from("admin_eventos").insert({
    grupo_id: null,
    acao: ACAO_GRUPO_DESFEITO,
    ator_id: null,
    ator_plataforma_user_id: tentativa.operador,
    alvo_corretor_id: null,
    detalhes: { origem: tentativa.origem, slug: tentativa.slug, passo: tentativa.passo, desfeito },
  });
  if (erroDoEvento) {
    console.error(`[plataforma] evento do grupo desfeito (${tentativa.slug}) não gravado: ${erroDoEvento.message}`);
  }
}

export async function apagarLogin(servico: Servico, userId: string): Promise<void> {
  const { error } = await servico.auth.admin.deleteUser(userId);
  if (error) console.error(`[plataforma] login do grupo desfeito não apagado: ${error.message}`);
}

/**
 * Apaga o login que o convite devolveu e não conseguiu conferir — só se,
 * agora, ele não for de ficha nenhuma. Se a conferência falhar de novo, fica:
 * apagar o login de outra pessoa é pior que deixar um órfão.
 */
async function apagarLoginSemFicha(servico: Servico, userId: string): Promise<void> {
  const { count, error } = await servico
    .from("corretores")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    console.error(`[plataforma] login do convite não conferido de novo; mantido: ${error.message}`);
    return;
  }
  if ((count ?? 0) === 0) await apagarLogin(servico, userId);
}

function erroDoCriarGrupo(error: { message: string; code?: string }): string {
  if (error.code === "23505") return "Esse endereço já é de outro grupo. Escolha outro.";
  console.error("[plataforma] criar_grupo falhou:", error.message);
  // Pode ter falhado só a resposta, com o grupo já criado: tentar de novo
  // às cegas bateria no endereço repetido e pareceria culpa dele.
  return "Não foi possível confirmar a criação do grupo. Antes de tentar de novo, confira na lista de grupos se ele já aparece.";
}

/**
 * Cria o grupo e o primeiro acesso numa operação só, para a origem provada
 * (ver o cabeçalho). O grupo do teste grátis (`cadastro.teste_ate`) perde a
 * competência de valor 0 que o gatilho da 0207 grava no cadastro: a
 * primeira competência dele é a do fim do teste (`cobranca.ts`). Sem
 * conseguir apagá-la, o grupo é desfeito: um teste que nunca cobraria é pior
 * que um teste que não começou.
 */
export async function criarContaComPrimeiroAcesso(
  origem: OrigemDaConta,
  d: NovoGrupoValidado,
  cadastro?: CadastroDaConta,
  agora: Date = new Date(),
): Promise<ResultadoDaConta> {
  const servico = createServiceClient();
  const prova = await conferirOrigem(servico, origem, d.primeiro.email, agora);
  if (!prova.ok) return { ok: false, erro: prova.erro };
  const { ator, operador } = prova;

  if (await emailEmFicha(servico, d.primeiro.email)) return { ok: false, erro: MENSAGEM_EMAIL_EM_USO };

  const { data: grupoId, error: erroGrupo } = await servico.rpc("criar_grupo", {
    p_nome: d.nome,
    p_slug: d.slug,
    p_tipo: d.tipo,
    p_plano: d.plano,
    p_contato: d.contato,
    // Sem login no teste grátis: `criado_por` nulo, e os eventos dizem de onde veio.
    p_criado_por: operador,
  });
  if (erroGrupo || !grupoId) {
    return { ok: false, erro: erroDoCriarGrupo(erroGrupo ?? { message: "sem id" }) };
  }
  const desfazer = (passo: PassoQueFalhou, extra: { corretorId?: string; loginNaoConferido?: string } = {}) =>
    desfazerGrupo(servico, { grupoId, slug: d.slug, passo, operador, origem: origem.origem, ...extra });

  if (cadastro) {
    // Documento, CRECI, mensalidade, vencimento e fim do teste: colunas que `criar_grupo` não recebe.
    const { data: gravado, error: erroCadastro } = await servico
      .from("grupos")
      .update(cadastro)
      .eq("id", grupoId)
      .select("id");
    if (erroCadastro || !gravado || gravado.length === 0) {
      console.error("[plataforma] falha ao gravar o cadastro do grupo:", erroCadastro?.message);
      await desfazer("cadastro");
      return { ok: false, erro: "Não foi possível gravar os dados do grupo agora; o grupo foi desfeito. Tente de novo." };
    }
  }

  if (cadastro?.teste_ate) {
    const { error: erroDaCompetencia } = await servico
      .from("pagamentos_do_grupo")
      .delete()
      .eq("grupo_id", grupoId)
      .eq("valor", 0)
      .is("asaas_pagamento_id", null);
    if (erroDaCompetencia) {
      console.error(`[teste grátis] competência do cadastro não apagada (${grupoId}): ${erroDaCompetencia.message}`);
      await desfazer("cadastro");
      return { ok: false, erro: "Não foi possível começar o teste agora. Tente de novo em instantes." };
    }
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
    await desfazer("ficha");
    return { ok: false, erro: "Não foi possível criar o primeiro acesso agora; o grupo foi desfeito. Tente de novo." };
  }

  const convite = await convidarCorretorDoGrupo({
    grupoId,
    corretorId: ficha.id,
    email: d.primeiro.email,
    ator,
    slug,
  });
  if (!convite.ok) {
    await desfazer("convite", { corretorId: ficha.id, loginNaoConferido: convite.loginNaoConferido });
    return { ok: false, erro: convite.erro };
  }

  return {
    ok: true,
    grupoId,
    email: d.primeiro.email,
    enviado: convite.enviado,
    ...(convite.url ? { url: convite.url } : {}),
  };
}
