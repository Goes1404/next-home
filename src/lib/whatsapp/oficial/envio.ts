import "server-only";

import { normalizarTelefoneBr } from "@/lib/whatsapp/telefone";
import { versaoGraph } from "./configuracao";
import { chamarGraph, type ErroDaMeta } from "./graph";

/**
 * O envio pela API oficial. Mesma regra inegociável do `provider.ts` da
 * Evolution: NUNCA `enviado: true` sem o comprovante — aqui, o `wamid` que a
 * Meta devolve em `messages[0].id`. É por ele que o status do webhook acha a
 * mensagem depois (entregue, lida, falhou, cobrada).
 */

export type ResultadoEnvioOficial =
  | { enviado: true; wamid: string }
  | { enviado: false; erro: ErroDaMeta };

type RespostaDeEnvio = { messages?: { id?: string }[] };

export type Remetente = { phoneNumberId: string; token: string };

function destino(telefone: string): string | null {
  const n = normalizarTelefoneBr(telefone);
  return n && /^\d{10,15}$/.test(n) ? n : null;
}

function semDestino(telefone: string): ResultadoEnvioOficial {
  return {
    enviado: false,
    erro: { codigo: 131026, subcodigo: null, mensagem: `Telefone inválido: ${telefone}`, detalhe: null, status: null, incerto: false },
  };
}

async function enviar(remetente: Remetente, corpo: Record<string, unknown>): Promise<ResultadoEnvioOficial> {
  const r = await chamarGraph<RespostaDeEnvio>({
    versao: versaoGraph(),
    caminho: `${remetente.phoneNumberId}/messages`,
    token: remetente.token,
    corpo: { messaging_product: "whatsapp", recipient_type: "individual", ...corpo },
    prazoMs: 20_000,
  });
  if (!r.ok) return { enviado: false, erro: r.erro };
  const wamid = r.dados.messages?.[0]?.id;
  if (!wamid) {
    // 2xx sem comprovante: não dá para afirmar que saiu nem para casar o
    // status depois. Incerto: não se reenvia.
    return {
      enviado: false,
      erro: { codigo: null, subcodigo: null, mensagem: "A Meta respondeu sem o id da mensagem.", detalhe: null, status: 200, incerto: true },
    };
  }
  return { enviado: true, wamid };
}

/** Modelo aprovado: o único jeito de falar com quem não escreveu nas últimas 24 h. */
export function enviarModeloOficial(p: {
  remetente: Remetente;
  telefone: string;
  nome: string;
  idioma: string;
  componentes: Record<string, unknown>[];
}): Promise<ResultadoEnvioOficial> {
  const para = destino(p.telefone);
  if (!para) return Promise.resolve(semDestino(p.telefone));
  return enviar(p.remetente, {
    to: para,
    type: "template",
    template: {
      name: p.nome,
      language: { code: p.idioma },
      ...(p.componentes.length > 0 ? { components: p.componentes } : {}),
    },
  });
}

/** Texto livre: só dentro da janela de 24 h aberta pela fala do cliente. */
export function enviarTextoOficial(p: { remetente: Remetente; telefone: string; texto: string }): Promise<ResultadoEnvioOficial> {
  const para = destino(p.telefone);
  if (!para) return Promise.resolve(semDestino(p.telefone));
  return enviar(p.remetente, { to: para, type: "text", text: { body: p.texto.slice(0, 4096), preview_url: true } });
}

/** Foto por link público (a do catálogo), dentro da janela. */
export function enviarImagemOficial(p: {
  remetente: Remetente;
  telefone: string;
  link: string;
  legenda?: string | null;
}): Promise<ResultadoEnvioOficial> {
  const para = destino(p.telefone);
  if (!para) return Promise.resolve(semDestino(p.telefone));
  return enviar(p.remetente, {
    to: para,
    type: "image",
    image: { link: p.link, ...(p.legenda ? { caption: p.legenda.slice(0, 1024) } : {}) },
  });
}

/**
 * Marca a mensagem do cliente como lida e mostra "digitando" enquanto a IA
 * pensa. Falha aqui não importa: é cortesia, não pode atrasar a resposta.
 */
export async function marcarLidaEDigitando(remetente: Remetente, wamid: string): Promise<void> {
  await chamarGraph({
    versao: versaoGraph(),
    caminho: `${remetente.phoneNumberId}/messages`,
    token: remetente.token,
    corpo: { messaging_product: "whatsapp", status: "read", message_id: wamid, typing_indicator: { type: "text" } },
    prazoMs: 5_000,
  }).catch(() => undefined);
}
