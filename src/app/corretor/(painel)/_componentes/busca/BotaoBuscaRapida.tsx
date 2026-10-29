"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { TipoDoGrupo } from "@/lib/grupos/grupo";

/*
 * A paleta (lista, teclado, buscas recentes) só é baixada no primeiro toque
 * no botão ou no Ctrl/⌘K (29/10/2026). O botão mora no cabeçalho, que toda
 * rota do painel carrega — a mesma régua da bolha do consultor
 * (`painelLeve.test.ts`).
 */
const PaletaDeBusca = dynamic(() => import("./PaletaDeBusca").then((m) => m.PaletaDeBusca), { ssr: false });

/** Outros lugares do painel abrem a busca disparando este evento na janela. */
export const EVENTO_ABRIR_BUSCA = "astro:abrir-busca";

/**
 * O botão "Buscar" do cabeçalho do painel e o atalho Ctrl/⌘K.
 *
 * No celular é só a lupa (o cabeçalho volta ao primeiro gesto para cima, e
 * a barra do polegar já tem os quatro alvos que cabem em 320px); no
 * computador mostra a dica do atalho.
 */
export function BotaoBuscaRapida({ ehGestor, tipoDoGrupo }: { ehGestor: boolean; tipoDoGrupo: TipoDoGrupo }) {
  const [aberta, setAberta] = useState(false);
  // Depois do primeiro uso a paleta fica montada (fechada): reabrir é instantâneo.
  const [usada, setUsada] = useState(false);
  const [mac, setMac] = useState<boolean | null>(null);

  useEffect(() => {
    const abrir = () => {
      setUsada(true);
      setAberta(true);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setUsada(true);
        setAberta((a) => !a);
      }
    };
    window.addEventListener("keydown", aoTeclar);
    window.addEventListener(EVENTO_ABRIR_BUSCA, abrir);
    // A dica do atalho depende do sistema; no servidor ninguém sabe.
    const t = window.setTimeout(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), 0);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener(EVENTO_ABRIR_BUSCA, abrir);
      window.clearTimeout(t);
    };
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setUsada(true);
          setAberta(true);
        }}
        aria-haspopup="dialog"
        aria-expanded={aberta}
        aria-label="Buscar leads, conversas, catálogo e telas"
        data-busca-rapida
        className="border-linha text-apoio hover:bg-vidro hover:text-titulo flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-2 rounded-full border px-3 transition-colors md:justify-start md:pr-2 md:pl-3.5"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M20 20l-4.2-4.2" />
        </svg>
        <span className="text-fluid-sm hidden md:inline">Buscar</span>
        <kbd className="border-linha text-tenue hidden rounded-md border px-1.5 py-0.5 font-sans text-[11px] lg:inline">
          {mac === null ? "Ctrl K" : mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </button>
      {usada && (
        <PaletaDeBusca aberta={aberta} aoFechar={() => setAberta(false)} ehGestor={ehGestor} tipoDoGrupo={tipoDoGrupo} />
      )}
    </>
  );
}
