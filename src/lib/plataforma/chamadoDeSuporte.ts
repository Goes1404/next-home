// Os chamados de suporte e o contato com a Astro (0240, 29/10/2026).
//
// Pedido do dono: "todo atendimento cai no celular dos ADMs". Duas portas
// gravam na mesma tabela (`chamados_de_suporte`):
//
//   - `/astro/contato` (origem "site"): quem ainda não é cliente. Nome,
//     e-mail, WhatsApp, assunto, mensagem e o consentimento da LGPD.
//   - `/corretor/suporte` (origem "painel"): corretor ou gestor logado. Só
//     assunto e mensagem; nome, e-mail e grupo saem da sessão.
//
// Módulo PURO: o formulário (navegador) e as actions (servidor) validam com
// as MESMAS regras, e a tela da plataforma tira daqui os rótulos. O WhatsApp
// e o e-mail usam a régua do pedido de contratação (`pedidoDeContratacao.ts`),
// para o site não ter duas.

import { emailValido, whatsappValido } from "./pedidoDeContratacao";

export { TEMPO_MINIMO_NO_FORMULARIO_MS } from "./pedidoDeContratacao";

export const ASSUNTOS = ["duvida", "problema", "financeiro", "sugestao", "comercial"] as const;
export type AssuntoDoChamado = (typeof ASSUNTOS)[number];

export const ROTULO_DO_ASSUNTO: Record<AssuntoDoChamado, string> = {
  duvida: "Dúvida",
  problema: "Algo não funciona",
  financeiro: "Financeiro",
  sugestao: "Sugestão",
  comercial: "Planos e contratação",
};

/** A ordem do seletor em cada porta: no site o comercial vem primeiro; no painel, o problema. */
export const ASSUNTOS_DO_SITE: AssuntoDoChamado[] = ["comercial", "duvida", "financeiro", "sugestao", "problema"];
export const ASSUNTOS_DO_PAINEL: AssuntoDoChamado[] = ["problema", "duvida", "financeiro", "sugestao", "comercial"];

export function ehAssunto(valor: unknown): valor is AssuntoDoChamado {
  return typeof valor === "string" && (ASSUNTOS as readonly string[]).includes(valor);
}

export const STATUS_DO_CHAMADO = ["novo", "em_atendimento", "resolvido"] as const;
export type StatusDoChamado = (typeof STATUS_DO_CHAMADO)[number];

export const ROTULO_DO_STATUS_DO_CHAMADO: Record<StatusDoChamado, string> = {
  novo: "Novo",
  em_atendimento: "Em atendimento",
  resolvido: "Resolvido",
};

export function ehStatusDoChamado(valor: unknown): valor is StatusDoChamado {
  return typeof valor === "string" && (STATUS_DO_CHAMADO as readonly string[]).includes(valor);
}

export const ROTULO_DA_ORIGEM = { site: "Site", painel: "Painel" } as const;

export const MENSAGEM_MINIMA = 5;
export const MENSAGEM_MAXIMA = 2000;

function linha(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max + 1) : "";
}

/**
 * A mensagem guarda as quebras de linha (a pessoa explica em parágrafos),
 * mas não sobra espaço nas pontas nem mais de uma linha em branco seguida.
 * Corta em MAX + 1 para a validação ainda enxergar o "longo demais".
 */
export function limparMensagem(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MENSAGEM_MAXIMA + 1);
}

function erroDaMensagem(mensagem: string): string | null {
  if (mensagem.length < MENSAGEM_MINIMA) return "Escreva sua mensagem (pelo menos algumas palavras).";
  if (mensagem.length > MENSAGEM_MAXIMA) return `A mensagem passa de ${MENSAGEM_MAXIMA.toLocaleString("pt-BR")} caracteres.`;
  return null;
}

// ── Contato pelo site ──────────────────────────────────────────────────────

/** O que o formulário de `/astro/contato` manda (tudo texto vindo do navegador). */
export type DadosDoContato = {
  nome: string;
  email: string;
  whatsapp: string;
  assunto: string;
  mensagem: string;
};

export const CONTATO_VAZIO: DadosDoContato = { nome: "", email: "", whatsapp: "", assunto: "comercial", mensagem: "" };

export type CampoDoContato = keyof DadosDoContato;
export type ErrosDoContato = Partial<Record<CampoDoContato, string>>;

export type ContatoLimpo = {
  nome: string;
  email: string;
  /** Dígitos com o 55. */
  whatsapp: string;
  assunto: AssuntoDoChamado;
  mensagem: string;
};

export function validarContato(
  d: Partial<DadosDoContato>,
): { ok: true; contato: ContatoLimpo } | { ok: false; erros: ErrosDoContato } {
  const erros: ErrosDoContato = {};

  const nome = linha(d.nome, 120);
  if (nome.length < 2) erros.nome = "Informe seu nome.";
  else if (nome.length > 120) erros.nome = "Nome longo demais.";

  const email = linha(d.email, 200).toLowerCase();
  if (!emailValido(email)) erros.email = "Informe um e-mail válido.";

  const whatsapp = whatsappValido(typeof d.whatsapp === "string" ? d.whatsapp : "");
  if (!whatsapp) erros.whatsapp = "Informe um WhatsApp com DDD, como (11) 98765-4321.";

  const assunto = ehAssunto(d.assunto) ? d.assunto : null;
  if (!assunto) erros.assunto = "Escolha o assunto.";

  const mensagem = limparMensagem(d.mensagem);
  const erroMsg = erroDaMensagem(mensagem);
  if (erroMsg) erros.mensagem = erroMsg;

  if (Object.keys(erros).length > 0 || !whatsapp || !assunto) return { ok: false, erros };
  return { ok: true, contato: { nome, email, whatsapp, assunto, mensagem } };
}

// ── Suporte pelo painel ────────────────────────────────────────────────────

export type ErrosDoChamado = Partial<Record<"assunto" | "mensagem", string>>;

export function validarChamadoDoPainel(d: {
  assunto?: unknown;
  mensagem?: unknown;
}): { ok: true; assunto: AssuntoDoChamado; mensagem: string } | { ok: false; erros: ErrosDoChamado } {
  const erros: ErrosDoChamado = {};
  const assunto = ehAssunto(d.assunto) ? d.assunto : null;
  if (!assunto) erros.assunto = "Escolha o assunto.";
  const mensagem = limparMensagem(d.mensagem);
  const erroMsg = erroDaMensagem(mensagem);
  if (erroMsg) erros.mensagem = erroMsg;
  if (!assunto || erroMsg) return { ok: false, erros };
  return { ok: true, assunto, mensagem };
}

// ── O aviso no celular dos administradores ─────────────────────────────────

/**
 * O começo da mensagem para a notificação: uma linha só, até ~80
 * caracteres, cortada no fim de uma palavra e com reticências.
 */
export function trechoDaMensagem(mensagem: string, max = 80): string {
  const corrida = mensagem.replace(/\s+/g, " ").trim();
  if (corrida.length <= max) return corrida;
  const corte = corrida.slice(0, max);
  const espaco = corte.lastIndexOf(" ");
  return `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).replace(/[\s,.;:!?-]+$/, "")}…`;
}

/**
 * O corpo do push: assunto e o começo da mensagem que a PRÓPRIA pessoa
 * escreveu. Nunca telefone, e-mail nem dado de lead (o chamado não puxa
 * nada da carteira por conta própria).
 */
export function corpoDoAviso(assunto: AssuntoDoChamado, mensagem: string): string {
  return `${ROTULO_DO_ASSUNTO[assunto]} · ${trechoDaMensagem(mensagem)}`;
}

/** O título do push do painel: "Suporte: Imob Sol". */
export function tituloDoAvisoDoPainel(nomeDaConta: string | null | undefined): string {
  const nome = (nomeDaConta ?? "").trim();
  return nome ? `Suporte: ${nome}` : "Suporte pelo painel";
}
