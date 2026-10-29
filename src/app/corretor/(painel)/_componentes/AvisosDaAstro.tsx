"use client";

import { useState } from "react";
import { FaixaDoAviso, type DadosDaFaixa } from "@/components/avisosDaAstro/FaixaDoAviso";
import { useGuardadoNoAparelho } from "@/lib/navegador/guardadoNoAparelho";
import { CHAVE_DOS_AVISOS_FECHADOS, lerAvisosFechados } from "@/lib/plataforma/avisoAosClientes";

/**
 * Os avisos da Astro no painel (0242, 29/10/2026), já filtrados pelo
 * servidor (no ar e para o papel de quem vê). Aqui só mora o "fechei":
 * por aviso, no navegador da pessoa (localStorage). Aviso novo tem id novo,
 * então aparece mesmo para quem fechou o anterior.
 *
 * Até o navegador dizer o que foi fechado, nada aparece: mostrar e sumir em
 * seguida seria pior que chegar um instante depois (a entrada é suave).
 */
export function AvisosDaAstro({ avisos }: { avisos: (DadosDaFaixa & { id: string })[] }) {
  const [guardado, guardar] = useGuardadoNoAparelho(CHAVE_DOS_AVISOS_FECHADOS);
  const [saindo, setSaindo] = useState<string | null>(null);
  if (guardado === undefined) return null;

  const fechados = lerAvisosFechados(guardado);
  const visiveis = avisos.filter((a) => !fechados.includes(a.id));
  if (visiveis.length === 0) return null;

  function fechar(id: string) {
    guardar(JSON.stringify([...lerAvisosFechados(guardado ?? null), id]));
    setSaindo(null);
  }

  // Com movimento reduzido não há animação de saída, então o fim dela nunca
  // chegaria: fecha na hora.
  function pedirParaFechar(id: string) {
    const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (semMovimento) fechar(id);
    else setSaindo(id);
  }

  return (
    <div className="mx-auto w-full max-w-[84rem] space-y-2 px-4 pt-3 md:px-8" aria-label="Avisos da Astro Soluções">
      {visiveis.map((a) => (
        <FaixaDoAviso
          key={a.id}
          aviso={a}
          saindo={saindo === a.id}
          onFechar={() => pedirParaFechar(a.id)}
          onFimDaSaida={() => fechar(a.id)}
        />
      ))}
    </div>
  );
}
