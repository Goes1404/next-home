// A abordagem da prospecção (0253, 02/11/2026): link da amostra, mensagem
// padrão e o link do WhatsApp com a mensagem pronta.
//
// Módulo PURO. Quem assina é o vendedor da Astro (hoje, o Eduardo); o envio
// da fase 1 é manual: o botão abre o WhatsApp de quem está no painel com a
// mensagem preenchida, e a pessoa confere e envia.

import { PAINEL_URL_PADRAO } from "@/lib/marcaDoCrm/marca";

/** Quem assina a abordagem e atende quem responde. */
export const VENDEDOR_PADRAO = "Eduardo";


export function vendedorDaProspeccao(env: Record<string, string | undefined> = process.env): string {
  return env.PROSPECCAO_VENDEDOR?.trim() || VENDEDOR_PADRAO;
}

/**
 * WhatsApp do vendedor para o botão "Conversar com o Eduardo" da amostra (só
 * dígitos, com DDI). Vem de `PROSPECCAO_WHATSAPP`, fora do código (o
 * repositório é público); sem a variável, a amostra sai sem o botão.
 */
export function whatsappDaProspeccao(env: Record<string, string | undefined> = process.env): string {
  const numero = (env.PROSPECCAO_WHATSAPP ?? "").replace(/\D/g, "");
  return numero.length >= 12 && numero.length <= 15 ? numero : "";
}

export function linkDaAmostra(slug: string, base: string = process.env.PROSPECCAO_URL_BASE || PAINEL_URL_PADRAO): string {
  return `${base.replace(/\/+$/, "")}/astro/amostra/${encodeURIComponent(slug)}`;
}

/** O gancho vira o meio de uma frase: sem ponto final e com a primeira letra maiúscula. */
function gancho(texto: string | null | undefined): string {
  const limpo = (texto ?? "").trim().replace(/[.!\s]+$/, "");
  if (!limpo) return "";
  return limpo[0].toUpperCase() + limpo.slice(1);
}

export function mensagemPadrao(params: { nome: string; gancho?: string | null; link: string; vendedor?: string }): string {
  const vendedor = params.vendedor ?? VENDEDOR_PADRAO;
  const meio = gancho(params.gancho);
  const abertura = `Oi, tudo bem? Aqui é o ${vendedor}, da Astro Soluções, uma empresa aqui da região que cria sites e sistemas para o comércio local.`;
  const motivo = meio
    ? `${meio}. Por isso montamos uma amostra de como poderia ser o site da ${params.nome}, já com a cara da loja:`
    : `Montamos uma amostra de como poderia ser o site da ${params.nome}, já com a cara da loja:`;
  const convite =
    "Ela mostra a vitrine de novidades, a cliente reservando pelo celular e um programa de cashback que chama a cliente de volta sozinho pelo WhatsApp. Posso passar aí 15 minutos esta semana para mostrar ao vivo?";
  return `${abertura}\n\n${motivo}\n${params.link}\n\n${convite}`;
}

/** Só dígitos; número de celular brasileiro sem DDI ganha o 55. */
export function normalizarWhatsapp(valor: string | null | undefined): string | null {
  const digitos = (valor ?? "").replace(/\D/g, "");
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`;
  if (digitos.length >= 12 && digitos.length <= 15) return digitos;
  return null;
}

export function linkDoWhatsapp(numero: string, texto: string): string {
  return `https://wa.me/${numero.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;
}

/** Slug da amostra a partir do nome: minúsculo, sem acento, com hífen. */
export function slugDaLoja(nome: string): string {
  return (
    nome
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60)
      .replace(/-+$/g, "") || "loja"
  );
}

/** O único follow-up, para quem foi abordado e não respondeu. */
export function mensagemDeFollowup(params: { link: string }): string {
  return `Oi, tudo bem? Só passando para saber se conseguiram abrir a amostra que mandei:\n${params.link}\n\nSe preferir, passo aí rapidinho e mostro no celular, leva 10 minutos.`;
}
