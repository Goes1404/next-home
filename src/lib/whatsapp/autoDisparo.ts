import "server-only";

import { after } from "next/server";
import { site } from "@/lib/site";

/**
 * Acende a corrente de auto-disparo.
 *
 * A fila de campanha não anda sozinha por mágica: alguém precisa bater em
 * `/api/cron/campanhas`, e essa rota é que se reagenda enquanto houver fila
 * (ver o comentário de cabeçalho de `campaignDispatcher.ts`). Este módulo é
 * o "acender o pavio" — usado por quem cria uma campanha e pelo botão do
 * painel, para a primeira mensagem sair em segundos em vez de esperar o
 * próximo tique de cron.
 *
 * Chamar isto quando uma corrente já está rodando é inofensivo: a trava de
 * `travar_disparo` (migration 0024) faz a chamada nova encerrar sem mandar
 * nada e sem encadear.
 */
export function acenderCorrenteDeDisparo(): void {
  const segredo = process.env.CRON_SECRET;

  // Em produção o endpoint recusa requisição sem segredo (falha fechada).
  // Acender o pavio sem ele só geraria um 401 no log — melhor não tentar e
  // deixar a fila para o cron, que a Vercel assina sozinha.
  if (!segredo && process.env.NODE_ENV === "production") {
    console.warn("Auto-disparo não acendido: CRON_SECRET ausente. A fila sai só no cron diário.");
    return;
  }

  const url = new URL("/api/cron/campanhas", baseUrl());

  after(async () => {
    try {
      await fetch(url.toString(), {
        method: "POST",
        headers: segredo ? { authorization: `Bearer ${segredo}` } : {},
        // Fire-and-forget: só precisamos que a invocação COMECE. Ela tem os
        // próprios 60 segundos do outro lado.
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Sem pavio, a fila ainda sai — só mais devagar, pelo cron.
    }
  });
}

/**
 * URL pública do próprio site.
 *
 * `VERCEL_PROJECT_PRODUCTION_URL` é o domínio de produção estável; usar
 * `VERCEL_URL` levaria a corrente para a URL única do deploy, que pode
 * estar atrás da proteção de deployment e responder 401 antes de chegar na
 * rota.
 */
function baseUrl(): string {
  const producao = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (producao) return `https://${producao}`;
  if (process.env.NODE_ENV !== "production") return "http://localhost:3000";
  return site.url;
}
