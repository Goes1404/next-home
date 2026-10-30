"use client";

import { useEffect } from "react";
import { ROTA_DOS_DADOS_OFFLINE } from "@/lib/painel/dadosOffline";
import { avisarServiceWorkers, registrosDoPainel } from "@/lib/painel/swDoPainel";

/** De quanto em quanto tempo o app renova o que guarda para ficar sem internet. */
const INTERVALO_MS = 10 * 60_000;
const CHAVE = "astro:offline-renovado-em";

/**
 * Pede `/api/painel/offline` de vez em quando para o service worker guardar
 * a agenda de hoje e os leads recentes (29/10/2026). Não desenha nada.
 *
 * Só age quando há um service worker do painel (app instalado ou avisos
 * ligados): sem ele, ninguém guarda a resposta e o pedido seria só custo.
 * Com controlador, o pedido passa pelo worker; SEM controlador (página
 * aberta fora do escopo antigo `/corretor/`, ver `swDoPainel.ts`), o worker
 * ativo recebe `renovar-dados` e faz o pedido ele mesmo (30/10/2026). A cada abertura do painel no máximo um pedido por 10 minutos
 * (`sessionStorage` protegido), e de novo quando a rede volta.
 */
export function SincronizarOffline() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const renovar = async (forcar: boolean) => {
      if (!navigator.onLine) return;
      const controlada = Boolean(navigator.serviceWorker.controller);
      if (!controlada && (await registrosDoPainel()).every((r) => !r.active)) return;
      let ultimo = 0;
      try {
        ultimo = Number(window.sessionStorage.getItem(CHAVE)) || 0;
      } catch {
        /* sem storage: renova sempre que abrir */
      }
      if (!forcar && Date.now() - ultimo < INTERVALO_MS) return;
      try {
        window.sessionStorage.setItem(CHAVE, String(Date.now()));
      } catch {
        /* idem */
      }
      if (controlada) fetch(ROTA_DOS_DADOS_OFFLINE, { cache: "no-store", credentials: "same-origin" }).catch(() => {});
      else await avisarServiceWorkers({ tipo: "renovar-dados" });
    };

    // Depois do carregamento: o painel primeiro, o guardado depois.
    const t = window.setTimeout(() => void renovar(false).catch(() => {}), 4000);
    const aoVoltar = () => void renovar(true).catch(() => {});
    window.addEventListener("online", aoVoltar);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("online", aoVoltar);
    };
  }, []);

  return null;
}
