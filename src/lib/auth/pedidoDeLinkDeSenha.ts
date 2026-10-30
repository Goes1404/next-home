import "server-only";

import { enviarLinkDeAcesso } from "@/lib/auth/emailsDeAcesso";
import { gerarLinkDeAcesso } from "@/lib/auth/links";
import { ehEmailDeAcesso } from "@/lib/corretores/credenciaisIniciais";
import { MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";
import { site } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";

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
 * A conta sem ficha de corretor que administra a plataforma (o dono, por
 * exemplo) também recupera por aqui (revisão de 30/10/2026): sem ficha, o
 * e-mail é procurado entre os logins de `administradores_da_plataforma`
 * (nunca na lista inteira do Auth), e o registro do pedido é um evento da
 * plataforma (`grupo_id` nulo, `detalhes.origem = 'plataforma'`,
 * `detalhes.alvo_user_id`), com o mesmo limite. A tela pública responde
 * igual nos dois casos.
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
 * De quem é o pedido: a ficha (o registro mora no grupo dela) ou o login de
 * quem administra a plataforma sem ficha (registro da plataforma, sem grupo).
 */
type Alvo = { tipo: "ficha"; ficha: Ficha } | { tipo: "admin"; userId: string };

/** Teto de leitura de `administradores_da_plataforma`: são poucos logins. */
const MAXIMO_DE_ADMINISTRADORES = 50;

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

async function lerPedidos(servico: Servico, alvo: Alvo, agora: Date) {
  const desde = new Date(agora.getTime() - UMA_HORA_MS).toISOString();
  const base = servico.from("admin_eventos").select("id, created_at").eq("acao", ACAO_DO_PEDIDO);
  if (alvo.tipo === "ficha") {
    return base.eq("grupo_id", alvo.ficha.grupo_id).eq("alvo_corretor_id", alvo.ficha.id).gte("created_at", desde);
  }
  return base.is("grupo_id", null).eq("detalhes->>alvo_user_id", alvo.userId).gte("created_at", desde);
}

function registroDoPedido(alvo: Alvo, via: string, agora: Date): Database["public"]["Tables"]["admin_eventos"]["Insert"] {
  if (alvo.tipo === "ficha") {
    return {
      grupo_id: alvo.ficha.grupo_id,
      acao: ACAO_DO_PEDIDO,
      ator_id: null,
      alvo_corretor_id: alvo.ficha.id,
      detalhes: { via },
      created_at: agora.toISOString(),
    };
  }
  // Evento da plataforma (0191): sem grupo, sem nenhuma linha-mãe, origem marcada.
  return {
    grupo_id: null,
    acao: ACAO_DO_PEDIDO,
    ator_id: null,
    alvo_corretor_id: null,
    detalhes: { origem: "plataforma", via, alvo_user_id: alvo.userId },
    created_at: agora.toISOString(),
  };
}

/** Reserva a vez do pedido; `false` = acima do limite (ou não deu para conferir). */
async function reservarPedido(servico: Servico, alvo: Alvo, via: string, agora: Date): Promise<boolean> {
  const antes = await lerPedidos(servico, alvo, agora);
  if (antes.error) {
    console.error(`[senha] pedidos anteriores não lidos; pedido recusado: ${antes.error.message}`);
    return false;
  }
  if (!pedidoCabeNoLimite((antes.data ?? []).map((p) => p.created_at), agora)) return false;

  const { data: proprio, error } = await servico
    .from("admin_eventos")
    .insert(registroDoPedido(alvo, via, agora))
    .select("id")
    .single();
  if (error || !proprio) {
    console.error(`[senha] pedido não registrado; recusado: ${error?.message ?? "sem linha"}`);
    return false;
  }

  const depois = await lerPedidos(servico, alvo, agora);
  if (depois.error) {
    console.error(`[senha] pedidos não relidos; pedido recusado: ${depois.error.message}`);
    return false;
  }
  const outros = (depois.data ?? []).filter((p) => p.id !== proprio.id).map((p) => p.created_at);
  return pedidoCabeNoLimite(outros, agora);
}

/** Gera o link de recuperação do e-mail e manda — só se o Auth devolver o login do alvo. */
async function gerarEMandar(servico: Servico, alvo: Alvo, email: string): Promise<DesfechoDoPedido> {
  // O administrador sem ficha não tem grupo: o link vai ao endereço do CRM
  // (`enderecoDoPainel` de qualquer grupo que não é a Next Home), onde mora `/plataforma`.
  const grupoDoLink = alvo.tipo === "ficha" ? alvo.ficha.grupo_id : "plataforma";
  const userIdEsperado = alvo.tipo === "ficha" ? alvo.ficha.user_id : alvo.userId;
  const link = await gerarLinkDeAcesso("recovery", email, "/corretor/definir-senha", grupoDoLink);
  if (!link.ok) return "nao_enviado";
  if (link.userId !== userIdEsperado) {
    console.error(`[senha] o e-mail do pedido é de outro login; link não enviado`);
    return "nao_enviado";
  }
  // O administrador sem ficha recebe o e-mail com o nome da plataforma.
  let nome: string = MARCA_DA_PLATAFORMA.nome;
  if (alvo.tipo === "ficha") {
    const { data: grupo } = await servico.from("grupos").select("nome").eq("id", alvo.ficha.grupo_id).maybeSingle();
    nome = grupo?.nome || site.nome;
  }
  const desfecho = await enviarLinkDeAcesso("recovery", email, nome, link.url);
  if (!desfecho.enviado) {
    console.warn(`[senha] link de recuperação não enviado: ${desfecho.motivo}`);
    return "nao_enviado";
  }
  return "enviado";
}

/**
 * O login de quem administra a plataforma com este e-mail, ou `null`. Só
 * percorre `administradores_da_plataforma` (poucos logins), lendo cada um
 * no Auth: nenhum outro login é consultado.
 */
async function adminDaPlataformaPorEmail(servico: Servico, email: string): Promise<string | null | "erro"> {
  const { data, error } = await servico
    .from("administradores_da_plataforma")
    .select("user_id")
    .limit(MAXIMO_DE_ADMINISTRADORES);
  if (error) {
    console.error(`[senha] administradores da plataforma não lidos: ${error.message}`);
    return "erro";
  }
  for (const { user_id } of data ?? []) {
    const { data: lido, error: erroDoAuth } = await servico.auth.admin.getUserById(user_id);
    if (erroDoAuth) {
      console.error(`[senha] login de administrador não lido: ${erroDoAuth.message}`);
      continue;
    }
    if (lido?.user?.email?.trim().toLowerCase() === email) return user_id;
  }
  return null;
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
  let alvo: Alvo;
  if (ficha) {
    alvo = { tipo: "ficha", ficha };
  } else {
    const admin = await adminDaPlataformaPorEmail(servico, email);
    if (admin === "erro") return "nao_enviado";
    if (!admin) return "sem_ficha";
    alvo = { tipo: "admin", userId: admin };
  }

  if (!(await reservarPedido(servico, alvo, "esqueci_a_senha", agora))) return "limite";
  return gerarEMandar(servico, alvo, email);
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
  let alvo: Alvo;
  if (ficha?.user_id) {
    alvo = { tipo: "ficha", ficha: ficha as Ficha };
  } else {
    // Sem ficha: só quem administra a plataforma (o login é o da própria sessão).
    const { data: admin, error: erroAdmin } = await servico
      .from("administradores_da_plataforma")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (erroAdmin) {
      console.error(`[senha] administrador da sessão não conferido: ${erroAdmin.message}`);
      return "nao_enviado";
    }
    if (!admin) return "sem_ficha";
    alvo = { tipo: "admin", userId };
  }

  if (!(await reservarPedido(servico, alvo, "link_vencido", agora))) return "limite";
  return gerarEMandar(servico, alvo, email);
}
