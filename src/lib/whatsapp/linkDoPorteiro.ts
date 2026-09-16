import type { ChaveIntencao } from "./porteiro";

/**
 * O endereço do porteiro, montado num lugar só.
 *
 * Todo ponto de WhatsApp do site público aponta para cá. Duas montagens do
 * mesmo link divergem no primeiro ajuste — é o defeito que esta base
 * registra desde `montarResumo` —, e a divergência aqui seria calada: o
 * botão funcionaria, a conversa abriria, e só o CRM não veria nada.
 *
 * Módulo PURO, sem `server-only`: quem chama é `"use client"`.
 */
export function linkDoPorteiro(params: {
  imovelSlug?: string | null;
  intencao?: ChaveIntencao | null;
  corretorSlug?: string | null;
}): string {
  const base = params.imovelSlug
    ? `/wa/${encodeURIComponent(params.imovelSlug)}`
    : "/wa";

  const busca = new URLSearchParams();
  if (params.corretorSlug) busca.set("c", params.corretorSlug);
  if (params.intencao) busca.set("i", params.intencao);

  const query = busca.toString();
  return query ? `${base}?${query}` : base;
}
