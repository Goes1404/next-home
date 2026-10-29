import type { GrupoWhatsapp } from "./provider";

/**
 * A lista de grupos do número central guardada no grupo (0234).
 *
 * Com o número em centenas de grupos a Evolution leva ~40 s para listar (busca
 * a foto de cada um), e a aba Roleta não pode esperar isso a cada abertura. A
 * última lista lida com sucesso fica em `grupos.grupos_whatsapp_do_central`; a
 * tela mostra ela e só pede outra quando passou de `LISTA_GUARDADA_VALE_MS`.
 *
 * Módulo puro: quem lê e grava é quem já tem o cliente da chave e o grupo
 * conferido (a aba e as ações do gestor).
 */

/** Depois disto a tela ainda mostra a guardada, mas pede uma nova em segundo plano. */
export const LISTA_GUARDADA_VALE_MS = 10 * 60_000;

export type ListaGuardada = { grupos: GrupoWhatsapp[]; lidaEm: string };

/**
 * A lista guardada, se for do número central de agora. Número trocado ou
 * coluna com lixo valem como "não há lista": melhor ler de novo que mostrar o
 * grupo de outro número.
 */
export function listaGuardada(
  linha: { grupos_whatsapp_do_central?: unknown; grupos_whatsapp_instancia?: string | null; grupos_whatsapp_lidos_em?: string | null } | null | undefined,
  instancia: string,
): ListaGuardada | null {
  if (!linha || linha.grupos_whatsapp_instancia !== instancia || !linha.grupos_whatsapp_lidos_em) return null;
  const bruto = linha.grupos_whatsapp_do_central;
  if (!Array.isArray(bruto)) return null;
  const grupos = bruto.flatMap((item): GrupoWhatsapp[] => {
    if (typeof item !== "object" || item === null) return [];
    const { jid, nome } = item as { jid?: unknown; nome?: unknown };
    return typeof jid === "string" && jid && typeof nome === "string" ? [{ jid, nome }] : [];
  });
  return { grupos, lidaEm: linha.grupos_whatsapp_lidos_em };
}

/** Passou do prazo: mostra, mas lê de novo. */
export function listaVencida(lidaEm: string, agora: Date = new Date()): boolean {
  const em = Date.parse(lidaEm);
  return !Number.isFinite(em) || agora.getTime() - em > LISTA_GUARDADA_VALE_MS;
}

/** As colunas para gravar a lista que acabou de ser lida. */
export function colunasDaLista(instancia: string, grupos: GrupoWhatsapp[], agora: Date = new Date()) {
  return {
    grupos_whatsapp_do_central: grupos.map((g) => ({ jid: g.jid, nome: g.nome })),
    grupos_whatsapp_instancia: instancia,
    grupos_whatsapp_lidos_em: agora.toISOString(),
  };
}
