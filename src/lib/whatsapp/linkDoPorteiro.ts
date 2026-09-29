import type { ChaveIntencao } from "./mensagensDoSite";

/**
 * O endereço do porteiro, montado num lugar só.
 *
 * Todo ponto de WhatsApp do site público aponta para cá. Duas montagens do
 * mesmo link divergem no primeiro ajuste — é o defeito que esta base
 * registra desde `montarResumo` —, e a divergência aqui seria calada: o
 * botão funcionaria, a conversa abriria, e só o CRM não veria nada.
 *
 * `de=site` separa, em `cliques_whatsapp`, o clique do site do clique do
 * anúncio pago: os dois passam pela mesma rota `/wa/<imóvel>`, e sem a marca
 * o site inflaria a métrica do anúncio.
 *
 * Módulo PURO, sem `server-only`: quem chama é `"use client"`.
 */
export function linkDoPorteiro(params: {
  imovelSlug?: string | null;
  intencao?: ChaveIntencao | null;
  /** Texto livre emendado depois da frase reconhecida (ver `destinoDoPorteiro`). */
  complemento?: string | null;
}): string {
  const base = params.imovelSlug ? `/wa/${encodeURIComponent(params.imovelSlug)}` : "/wa";

  const busca = new URLSearchParams();
  if (params.intencao) busca.set("i", params.intencao);
  if (params.complemento) busca.set("m", params.complemento);
  busca.set("de", "site");

  return `${base}?${busca.toString()}`;
}
