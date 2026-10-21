"use client";

import { createContext, useContext } from "react";
import { Wordmark } from "@/components/ui/Wordmark";
import { site } from "@/lib/site";

/**
 * A marca do grupo de quem está logado dentro do painel (21/10/2026): o
 * nome, as duas partes do nome escrito e a logo, se o grupo mandou uma. O
 * layout do painel a põe aqui para os textos e os cabeçalhos montados no
 * navegador. Sem provedor vale a marca da instalação (a Next Home), que é o
 * que o painel sempre usou.
 */
export type MarcaNoPainel = {
  nome: string;
  wordmark: readonly [string, string];
  logoUrl: string | null;
};

const MARCA_PADRAO: MarcaNoPainel = { nome: site.nome, wordmark: site.wordmark, logoUrl: null };

const Contexto = createContext<MarcaNoPainel>(MARCA_PADRAO);

export function MarcaDoPainelProvider({ marca, children }: { marca: MarcaNoPainel; children: React.ReactNode }) {
  return <Contexto.Provider value={marca}>{children}</Contexto.Provider>;
}

export function useMarcaDoPainel(): MarcaNoPainel {
  return useContext(Contexto);
}

/** O nome da casa, para os textos que o corretor manda ao cliente. */
export function useNomeDaCasa(): string {
  return useContext(Contexto).nome;
}

/**
 * A logo da casa no cabeçalho e no menu: a imagem do grupo, ou o nome escrito
 * (o logotipo em texto de sempre, na Next Home).
 */
export function LogoDoPainel({ marca, destaque }: { marca: MarcaNoPainel; destaque: string }) {
  if (marca.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- logo do grupo (URL pública do Storage), tamanho fixo pequeno
      <img src={marca.logoUrl} alt={marca.nome} className="block h-8 max-w-44 object-contain object-left" />
    );
  }
  return <Wordmark destaque={destaque} nomes={marca.wordmark} />;
}
