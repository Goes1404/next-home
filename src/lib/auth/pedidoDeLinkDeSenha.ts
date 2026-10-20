import "server-only";

import { enviarLinkDeAcesso } from "@/lib/auth/emailsDeAcesso";
import { gerarLinkDeAcesso } from "@/lib/auth/links";
import { ehEmailDeAcesso } from "@/lib/corretores/credenciaisIniciais";
import { site } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * O pedido de link de senha que a PRÓPRIA pessoa faz: "Esqueci a senha"
 * (público) e "Sair e receber novo link" (convidado cujo link venceu).
 *
 * ## O limite, e por que ele é nosso
 *
 * O Auth do Supabase limita o envio de e-mail que ELE faz, mas aqui o link
 * sai por `generateLink` com a chave de serviço, que passa por cima desse
 * limite — e o e-mail sai pelo Resend. Sem limite nosso, qualquer um
 * mandaria centenas de e-mails para a caixa de alguém (e gastaria a cota do
 * Resend), e cada pedido invalidaria o link anterior que a pessoa já tinha.
 *
 * Por e-mail (pela ficha dele): no máximo 1 pedido a cada 60 s e 5 por hora.
 * O registro é uma linha `link_de_senha_pedido` em `admin_eventos`, no grupo
 * da ficha — sem tabela nova. E-mail sem ficha (com login) não gera nada:
 * nem link, nem registro. Quem responde à tela pública diz sempre a mesma
 * coisa (ver `esqueci-a-senha/acoes.ts`); os desfechos daqui são para o log
 * e para o pedido da própria sessão.
 *
 * A conta sem ficha de corretor (o administrador da plataforma sem ficha)
 * não recupera a senha por aqui: o link dela sai pelo painel do Supabase.
 *
 * O registro é lido ANTES de gravar: pedido acima do limite não grava linha,
 * para quem insiste não encher a tabela. Depois de gravar, lê de novo: dois
 * pedidos simultâneos se veem, e os dois desistem (fechado é o lado certo de
 * errar numa trava).
 */

export const ACAO_DO_PEDIDO = "link_de_senha_pedido";
export const INTERVALO_MINIMO_MS = 60_000;
export const MAXIMO_POR_HORA = 5;
const UMA_HORA_MS = 60 * 60_000;

export type DesfechoDoPedido = "enviado" | "limite" | "sem_ficha" | "nao_enviado";

type Servico = ReturnType<typeof createServiceClient>;
type Ficha = { id: string; user_id: string; grupo_id: string };

/**
 * Pura: com os pedidos anteriores (instantes ISO, da última hora), um pedido
 * novo agora cabe no limite?
 */
export function pedidoCabeNoLimite(anteriores: string[], agora: Date): boolean {
  const t = agora.getTime();
  const naHora = anteriores.map((a) => new Date(a).getTime()).filter((a) => t - a < UMA_HORA_MS);
  if (naHora.length >= MAXIMO_POR_HORA) return false;
  return !naHora.some((a) => t - a < INTERVALO_MINIMO_MS);
}

/** `ana_1%@x.com` → padrão de `ilike` que só casa com ele mesmo (sem maiúsculas). */
function padraoExato(email: string): string {
  return email.replace(/[\\%_]/g, (c) => "\\" + c).replaceAll("*", "_");
}

async function lerPedidos(servico: Servico, ficha: Ficha, agora: Date) {
  return servico
    .from("admin_eventos")
    .select("id, created_at")
    .eq("grupo_id", ficha.grupo_id)
    .eq("acao", ACAO_DO_PEDIDO)
    .eq("alvo_corretor_id", ficha.id)
    .gte("created_at", new Date(agora.getTime() - UMA_HORA_MS).toISOString());
}

/** Reserva a vez do pedido; `false` = acima do limite (ou não deu para conferir). */
async function reservarPedido(servico: Servico, ficha: Ficha, via: string, agora: Date): Promise<boolean> {
  const antes = await lerPedidos(servico, ficha, agora);
  if (antes.error) {
    console.error(`[senha] pedidos anteriores não lidos; pedido recusado: ${antes.error.message}`);
    return false;
  }
  if (!pedidoCabeNoLimite((antes.data ?? []).map((p) => p.created_at), agora)) return false;

  const { data: proprio, error } = await servico
    .from("admin_eventos")
    .insert({
      grupo_id: ficha.grupo_id,
      acao: ACAO_DO_PEDIDO,
      ator_id: null,
      alvo_corretor_id: ficha.id,
      detalhes: { via },
      created_at: agora.toISOString(),
    })
    .select("id")
    .single();
  if (error || !proprio) {
    console.error(`[senha] pedido não registrado; recusado: ${error?.message ?? "sem linha"}`);
    return false;
  }

  const depois = await lerPedidos(servico, ficha, agora);
  if (depois.error) {
    console.error(`[senha] pedidos não relidos; pedido recusado: ${depois.error.message}`);
    return false;
  }
  const outros = (depois.data ?? []).filter((p) => p.id !== proprio.id).map((p) => p.created_at);
  return pedidoCabeNoLimite(outros, agora);
}

/** Gera o link de recuperação do e-mail e manda — só se o Auth devolver o login da ficha. */
async function gerarEMandar(servico: Servico, ficha: Ficha, email: string): Promise<DesfechoDoPedido> {
  const link = await gerarLinkDeAcesso("recovery", email, "/corretor/definir-senha");
  if (!link.ok) return "nao_enviado";
  if (link.userId !== ficha.user_id) {
    console.error(`[senha] o e-mail da ficha ${ficha.id} é de outro login; link não enviado`);
    return "nao_enviado";
  }
  const { data: grupo } = await servico.from("grupos").select("nome").eq("id", ficha.grupo_id).maybeSingle();
  const desfecho = await enviarLinkDeAcesso("recovery", email, grupo?.nome || site.nome, link.url);
  if (!desfecho.enviado) {
    console.warn(`[senha] link de recuperação não enviado: ${desfecho.motivo}`);
    return "nao_enviado";
  }
  return "enviado";
}

/** "Esqueci a senha": o e-mail digitado, achado pela ficha que tem login. */
export async function pedirLinkDeSenhaPorEmail(emailDigitado: string, agora = new Date()): Promise<DesfechoDoPedido> {
  const email = emailDigitado.trim().toLowerCase();
  if (!email.includes("@") || ehEmailDeAcesso(email)) return "sem_ficha";

  const servico = createServiceClient();
  const { data: fichas, error } = await servico
    .from("corretores")
    .select("id, user_id, grupo_id")
    .ilike("email", padraoExato(email))
    .not("user_id", "is", null)
    .limit(1);
  if (error) {
    console.error(`[senha] ficha do e-mail não lida: ${error.message}`);
    return "nao_enviado";
  }
  const ficha = fichas?.[0] as Ficha | undefined;
  if (!ficha) return "sem_ficha";

  if (!(await reservarPedido(servico, ficha, "esqueci_a_senha", agora))) return "limite";
  return gerarEMandar(servico, ficha, email);
}

/**
 * O convidado cujo link venceu, já com sessão: o e-mail é o do Auth da
 * própria sessão (quem chama lê com `getUser`), e a ficha é a do login dele.
 */
export async function pedirLinkDeSenhaDaConta(
  userId: string,
  emailDaSessao: string,
  agora = new Date(),
): Promise<DesfechoDoPedido> {
  const email = emailDaSessao.trim().toLowerCase();
  if (ehEmailDeAcesso(email)) return "sem_ficha";

  const servico = createServiceClient();
  const { data: ficha, error } = await servico
    .from("corretores")
    .select("id, user_id, grupo_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error(`[senha] ficha da sessão não lida: ${error.message}`);
    return "nao_enviado";
  }
  if (!ficha?.user_id) return "sem_ficha";

  const f = ficha as Ficha;
  if (!(await reservarPedido(servico, f, "link_vencido", agora))) return "limite";
  return gerarEMandar(servico, f, email);
}
