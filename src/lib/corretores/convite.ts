import "server-only";

import { enviarLinkDeAcesso } from "@/lib/auth/emailsDeAcesso";
import { limparEmail } from "./emailLimpo";
import { emailConfigurado } from "@/lib/email";
import { gerarLinkDeAcesso, type TipoDeLink } from "@/lib/auth/links";
import { site } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/types";
import {
  MENSAGEM_EMAIL_EM_USO,
  MENSAGEM_ENDERECO_DE_ACESSO,
} from "./acessoDaConta";
import { ehEmailDeAcesso } from "./credenciaisIniciais";

/**
 * O convite do corretor, num caminho só (fase 2A).
 *
 * Quem convida é o gestor (tela de Contas) ou o operador da plataforma
 * (criação de grupo). Os dois passam por aqui, para o convite não ter duas
 * versões que divergem.
 *
 * NÃO há guarda dentro: quem chama já provou que pode agir no grupo
 * (`exigirGestorNaAcao` ou `exigirAdminDaPlataformaNaAcao`) e passa o
 * `grupoId` que provou. Toda escrita pela chave de serviço filtra esse grupo,
 * então um `corretorId` de outro grupo não acha a ficha.
 *
 * O convite cria o usuário no Auth (`generateLink('invite')`) ANTES de
 * vincular a ficha. Se o vínculo falha, o usuário é apagado — só se nenhuma
 * ficha o tiver (`apagarLoginSemFicha`): sem isso sobraria um login órfão com
 * o e-mail queimado pela unicidade; e apagar sem conferir mataria o login
 * quando o vínculo GRAVOU e só a resposta se perdeu.
 *
 * Sem `RESEND_API_KEY` (ou com o envio recusado), o convite NÃO falha: a URL
 * volta para a tela, e o gestor a manda pelo WhatsApp. A URL só volta nesse
 * caso — com o e-mail entregue, ela não precisa ficar na tela de ninguém.
 */

/** Para onde vai quem abre o link: criar a própria senha. */
export const DESTINO_DO_LINK = "/corretor/definir-senha";

/**
 * Quem agiu: um corretor-gestor do grupo, um operador da plataforma, ou o
 * sistema no teste grátis (29/10/2026, 0241: sem login; o pedido de
 * contratação que originou a conta fica no evento).
 */
export type AtorDoAcesso =
  | { corretorId: string }
  | { plataformaUserId: string }
  | { sistema: "teste-gratis"; pedidoId: string };

export type ResultadoDoLink = { ok: true; enviado: boolean; url?: string } | { ok: false; erro: string };

/**
 * Convite que falhou depois de o Auth devolver um login que não deu para
 * conferir (erro transitório ao perguntar se ele já é de outra ficha). O
 * login pode ser novo — criado agora por este convite — e ficaria órfão;
 * quem chama decide se o apaga, conferindo de novo (o desfazer da
 * plataforma faz isso).
 */
export type FalhaDoConvite = { ok: false; erro: string; loginNaoConferido?: string };

export { limparEmail };

type Servico = ReturnType<typeof createServiceClient>;

/**
 * Grava o evento de auditoria e LÊ o erro. Valor fora do CHECK de `acao` (ou
 * qualquer outra recusa) falhava calado aqui antes — o log do gestor perdia a
 * linha sem ninguém saber. O log não leva o e-mail.
 */
export async function registrarEventoDeAcesso(
  servico: Servico,
  evento: {
    grupoId: string;
    ator: AtorDoAcesso;
    acao: "convite_enviado" | "convite_reenviado" | "email_alterado" | "link_de_senha_enviado";
    alvoCorretorId: string;
    detalhes?: { [chave: string]: Json };
  },
): Promise<void> {
  const { error } = await servico.from("admin_eventos").insert({
    grupo_id: evento.grupoId,
    ator_id: "corretorId" in evento.ator ? evento.ator.corretorId : null,
    ator_plataforma_user_id: "plataformaUserId" in evento.ator ? evento.ator.plataformaUserId : null,
    acao: evento.acao,
    alvo_corretor_id: evento.alvoCorretorId,
    detalhes:
      "sistema" in evento.ator
        ? { ...(evento.detalhes ?? {}), origem: evento.ator.sistema, pedido_id: evento.ator.pedidoId }
        : (evento.detalhes ?? {}),
  });
  if (error) {
    console.error(`[acesso] evento ${evento.acao} não gravado (corretor ${evento.alvoCorretorId}): ${error.message}`);
  }
}

/**
 * O link de uma conta que JÁ foi usada não aparece na tela de ninguém: quem
 * o copiasse entraria na conta de outra pessoa (e leria as conversas dela).
 * Sem e-mail configurado, ele nem é gerado.
 */
export const MENSAGEM_SEM_EMAIL_CONFIGURADO =
  "Esta pessoa já entrou no painel, então o link só pode ir para o e-mail dela, e o envio de e-mail não está ligado. Peça para ela usar \"Esqueci a senha\" na tela de entrar.";

/** O e-mail com o link de uma conta já usada não saiu, e o link não volta para a tela. */
export const MENSAGEM_EMAIL_NAO_SAIU =
  "O e-mail com o link não saiu agora. Tente de novo em alguns minutos.";

/**
 * Apaga o login que um convite criou — só se, agora, ele não for de ficha
 * nenhuma. É a regra do desfazer da plataforma: o vínculo pode ter gravado e
 * só a resposta se perdido (a ficha tem o login), e o Auth reaproveita o
 * convite pendente de outra ficha. Se a conferência falhar, o login fica:
 * apagar o login de outra pessoa é pior que deixar um órfão.
 */
export async function apagarLoginSemFicha(
  servico: Servico,
  userId: string,
): Promise<"apagado" | "mantido" | "nao_conferido"> {
  const { count, error } = await servico
    .from("corretores")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) {
    console.error(`[acesso] login do convite não conferido; mantido: ${error.message}`);
    return "nao_conferido";
  }
  if ((count ?? 0) > 0) return "mantido";
  const { error: erroApagar } = await servico.auth.admin.deleteUser(userId);
  if (erroApagar) console.error(`[acesso] usuário do convite não apagado: ${erroApagar.message}`);
  return "apagado";
}

/**
 * Manda o link por e-mail; sem envio, devolve a URL para a tela — só quando
 * `somentePorEmail` é falso (conta que nunca entrou). Com ele, envio que não
 * sai é erro, e a URL não volta.
 */
async function entregar(
  servico: Servico,
  tipo: TipoDeLink,
  email: string,
  grupoId: string,
  url: string,
  somentePorEmail = false,
): Promise<{ ok: true; enviado: boolean; url?: string } | { ok: false; erro: string }> {
  const { data: grupo } = await servico.from("grupos").select("nome, teste_ate").eq("id", grupoId).maybeSingle();
  const envio = await enviarLinkDeAcesso(tipo, email, grupo?.nome ?? site.nome, url, { testeAte: grupo?.teste_ate ?? null });
  if (envio.enviado) return { ok: true, enviado: true };
  if (somentePorEmail) {
    console.warn(`[acesso] link (${tipo}) de conta já usada não saiu por e-mail: ${envio.motivo}; não mostrado`);
    return { ok: false, erro: MENSAGEM_EMAIL_NAO_SAIU };
  }
  console.warn(`[acesso] link (${tipo}) não saiu por e-mail: ${envio.motivo}; volta para a tela`);
  return { ok: true, enviado: false, url };
}

function erroDoLink(motivo: "email_em_uso" | "email_de_acesso" | "falha"): string {
  if (motivo === "email_em_uso") return MENSAGEM_EMAIL_EM_USO;
  if (motivo === "email_de_acesso") return MENSAGEM_ENDERECO_DE_ACESSO;
  return "Não foi possível gerar o link agora. Tente de novo.";
}

/**
 * Gera e entrega o link de uma conta que JÁ existe no Auth (reenviar convite,
 * link de senha, depois de trocar o e-mail). `usuarioEsperado` é o login da
 * ficha: se o Auth devolver outro usuário, o link entraria na conta errada, e
 * nada é enviado.
 *
 * `somentePorEmail`: a conta já foi usada (o Auth tem `last_sign_in_at`). O
 * link só vai para o e-mail da própria pessoa, nunca para a tela: sem e-mail
 * configurado ele nem é gerado, e envio recusado é erro.
 */
export async function mandarLinkDeAcesso({
  grupoId,
  tipo,
  email,
  usuarioEsperado,
  somentePorEmail = false,
}: {
  grupoId: string;
  tipo: TipoDeLink;
  email: string;
  usuarioEsperado: string;
  somentePorEmail?: boolean;
}): Promise<ResultadoDoLink & { motivo?: "email_em_uso" | "email_de_acesso" | "falha" | "sem_email" }> {
  if (somentePorEmail && !emailConfigurado()) {
    return { ok: false, erro: MENSAGEM_SEM_EMAIL_CONFIGURADO, motivo: "sem_email" };
  }
  const link = await gerarLinkDeAcesso(tipo, email, DESTINO_DO_LINK, grupoId);
  if (!link.ok) return { ok: false, erro: erroDoLink(link.motivo), motivo: link.motivo };
  if (link.userId !== usuarioEsperado) {
    console.error(`[acesso] link (${tipo}) voltou para outro usuário do Auth; não enviado`);
    return { ok: false, erro: "Não foi possível gerar o link agora. Tente de novo.", motivo: "falha" };
  }
  return entregar(createServiceClient(), tipo, email, grupoId, link.url, somentePorEmail);
}

/**
 * Convida o corretor de um grupo: cria o login pelo link de convite, vincula
 * à ficha, registra e manda o e-mail.
 *
 * `slug` é o link pessoal que a ficha ganha se ainda não tiver: sem slug,
 * `getCorretorLogado()` devolve `null` e a pessoa cairia em "Conta sem
 * vínculo" depois de criar a senha.
 */
export async function convidarCorretorDoGrupo({
  grupoId,
  corretorId,
  email,
  ator,
  slug,
}: {
  grupoId: string;
  corretorId: string;
  email: string;
  ator: AtorDoAcesso;
  slug?: string;
}): Promise<{ ok: true; enviado: boolean; url?: string } | FalhaDoConvite> {
  const emailLimpo = limparEmail(email);
  if (!emailLimpo) return { ok: false, erro: "E-mail inválido." };
  // `gerarLinkDeAcesso` também recusa; aqui a recusa vem antes de tocar no banco.
  if (ehEmailDeAcesso(emailLimpo)) return { ok: false, erro: MENSAGEM_ENDERECO_DE_ACESSO };

  const servico = createServiceClient();
  const { data: ficha } = await servico
    .from("corretores")
    .select("id, slug, user_id")
    .eq("id", corretorId)
    .eq("grupo_id", grupoId)
    .maybeSingle();
  if (!ficha) return { ok: false, erro: "Corretor não encontrado." };
  if (ficha.user_id) return { ok: false, erro: "Este corretor já tem acesso. Use 'Reenviar convite'." };

  const slugFinal = ficha.slug ?? slug;
  if (!slugFinal) return { ok: false, erro: "Este corretor está sem link pessoal. Salve o cadastro e tente de novo." };

  const link = await gerarLinkDeAcesso("invite", emailLimpo, DESTINO_DO_LINK, grupoId);
  if (!link.ok) return { ok: false, erro: erroDoLink(link.motivo) };

  /*
   * O Auth REAPROVEITA um usuário que ainda não confirmou o e-mail: o
   * convite pendente de outra ficha (de qualquer grupo) volta com o id dela.
   * Quem chama confere antes (`email_de_acesso_livre`), mas essa conferência
   * pode falhar, e a da plataforma não existe. Vincular bateria no `unique`
   * de `user_id`, e a compensação abaixo apagaria o login da outra ficha.
   */
  const { data: donoDoLogin, error: erroDono } = await servico
    .from("corretores")
    .select("id")
    .eq("user_id", link.userId)
    .maybeSingle();
  if (erroDono || donoDoLogin) {
    console.error(
      `[acesso] convite para a ficha ${corretorId} voltou com um login já vinculado` +
        (erroDono ? ` (não conferido: ${erroDono.message})` : "") +
        "; não vinculado",
    );
    if (erroDono) {
      return { ok: false, erro: "Não foi possível gerar o link agora. Tente de novo.", loginNaoConferido: link.userId };
    }
    return { ok: false, erro: MENSAGEM_EMAIL_EM_USO };
  }

  // O grupo vai no filtro: a chave de serviço ignora a RLS.
  const { data: vinculadas, error: erroVinculo } = await servico
    .from("corretores")
    .update({ user_id: link.userId, email: emailLimpo, slug: slugFinal, deve_trocar_senha: true })
    .eq("id", corretorId)
    .eq("grupo_id", grupoId)
    .select("id");

  if (erroVinculo || !vinculadas || vinculadas.length === 0) {
    console.error(`[acesso] convite não vinculado à ficha ${corretorId}: ${erroVinculo?.message ?? "nenhuma linha"}`);
    const destino = await apagarLoginSemFicha(servico, link.userId);
    if (destino === "apagado") return { ok: false, erro: "Convite criado mas não vinculado; desfeito. Tente novamente." };
    const erro =
      "Não deu para confirmar o convite agora. Atualize a página e veja se o corretor já aparece com acesso antes de tentar de novo.";
    return destino === "nao_conferido" ? { ok: false, erro, loginNaoConferido: link.userId } : { ok: false, erro };
  }

  await registrarEventoDeAcesso(servico, {
    grupoId,
    ator,
    acao: "convite_enviado",
    alvoCorretorId: corretorId,
    detalhes: { email: emailLimpo, slug: slugFinal },
  });

  return entregar(servico, "invite", emailLimpo, grupoId, link.url);
}
