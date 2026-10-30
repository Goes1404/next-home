"use client";

import { useEffect } from "react";
import { ROTA_DOS_DADOS_OFFLINE } from "@/lib/painel/dadosOffline";

/** De quanto em quanto tempo o app renova o que guarda para ficar sem internet. */
const INTERVALO_MS = 10 * 60_000;
const CHAVE = "astro:offline-renovado-em";

/**
 * Pede `/api/painel/offline` de vez em quando para o service worker guardar
 * a agenda de hoje e os leads recentes (29/10/2026). Não desenha nada.
 *
 * Só age quando há um service worker controlando a página (app instalado ou
 * avisos ligados): sem ele, ninguém guarda a resposta e o pedido seria só
 * custo. A cada abertura do painel no máximo um pedido por 10 minutos
 * (`sessionStorage` protegido), e de novo quando a rede volta.
 */
export function SincronizarOffline() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const renovar = (forcar: boolean) => {
      if (!navigator.serviceWorker.controller || !navigator.onLine) return;
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
      fetch(ROTA_DOS_DADOS_OFFLINE, { cache: "no-store", credentials: "same-origin" }).catch(() => {});
    };

    // Depois do carregamento: o painel primeiro, o guardado depois.
    const t = window.setTimeout(() => renovar(false), 4000);
    const aoVoltar = () => renovar(true);
    window.addEventListener("online", aoVoltar);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("online", aoVoltar);
    };
  }, []);

  return null;
}
