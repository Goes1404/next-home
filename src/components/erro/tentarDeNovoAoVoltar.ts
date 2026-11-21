"use client";

import { useEffect, useRef } from "react";

/**
 * Tela de erro que se conserta sozinha (20/11/2026).
 *
 * O erro que mais cai nas telas de erro do painel é a conexão cortada: no
 * celular, o botão "Enviar no WhatsApp" manda o navegador para segundo plano
 * no meio de uma requisição. Quando a pessoa volta, a página já pode ser
 * buscada de novo, então a tela tenta sozinha: logo ao aparecer (se a aba
 * está visível e com internet), ao voltar para a aba e quando a internet
 * volta.
 *
 * No máximo 2 tentativas automáticas a cada 30 s por endereço: um erro de
 * verdade (código quebrado) não vira um laço de recarregar; a tela fica com
 * os botões para a pessoa decidir.
 */
const LIMITE = 2;
const JANELA_MS = 30_000;
const CHAVE = "astro:tentativas-de-erro";

// Sem sessionStorage (bloqueado), a conta fica na memória da aba.
const naMemoria: Record<string, number[]> = {};

function ler(): Record<string, number[]> {
  try {
    return JSON.parse(window.sessionStorage.getItem(CHAVE) ?? "{}") as Record<string, number[]>;
  } catch {
    return naMemoria;
  }
}

function gravar(guardado: Record<string, number[]>): void {
  try {
    window.sessionStorage.setItem(CHAVE, JSON.stringify(guardado));
  } catch {
    Object.assign(naMemoria, guardado);
  }
}

/** Puro o bastante para testar: decide e já registra a tentativa. */
export function podeTentar(agora: number, endereco: string = window.location.pathname): boolean {
  const guardado = ler();
  const recentes = (guardado[endereco] ?? []).filter((t) => agora - t < JANELA_MS);
  if (recentes.length >= LIMITE) return false;
  gravar({ ...guardado, [endereco]: [...recentes, agora] });
  return true;
}

export function useTentarDeNovoAoVoltar(tentar: () => void): void {
  // A função muda a cada render; o efeito não pode recomeçar (e tentar de novo) por isso.
  const atual = useRef(tentar);
  useEffect(() => {
    atual.current = tentar;
  }, [tentar]);
  useEffect(() => {
    let timer: number | undefined;
    const talvez = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (podeTentar(Date.now())) atual.current();
      }, 400);
    };
    talvez();
    document.addEventListener("visibilitychange", talvez);
    window.addEventListener("online", talvez);
    window.addEventListener("pageshow", talvez);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", talvez);
      window.removeEventListener("online", talvez);
      window.removeEventListener("pageshow", talvez);
    };
  }, []);
}
