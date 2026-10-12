"use client";

import dynamic from "next/dynamic";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { COOKIE_CORRETOR_ATIVO } from "@/lib/corretorAtivoCookie";
import type { FundoTipo } from "@/lib/types";

// Os dois fundos do corretor só existem DEPOIS da resposta de
// `/api/corretor-ativo`, e só para quem veio pelo link pessoal. Importá-los
// estaticamente poria o código deles no primeiro carregamento de TODA
// página pública (a catraca de peso acusou +1 a +2 KB por rota); por
// `next/dynamic` eles chegam só quando vão ser desenhados.
const HeroImageBackground = dynamic(
  () => import("./HeroImageBackground").then((m) => m.HeroImageBackground),
  { ssr: false },
);
const HeroVideoBackground = dynamic(
  () => import("./HeroVideoBackground").then((m) => m.HeroVideoBackground),
  { ssr: false },
);

/*
 * O fundo do corretor do link pessoal, decidido NO NAVEGADOR (F2b, 12/10/2026).
 *
 * Até aqui os dois layouts públicos liam o cookie `corretor_ativo` no
 * servidor (`getCorretorAtivo`) para trocar o fundo da casa pela foto ou
 * pelo vídeo do corretor. `cookies()` num layout torna toda rota abaixo
 * dele dinâmica — era uma das duas leituras que impediam o site público de
 * ser servido do cache (a outra era o tema, ver lib/tema.ts).
 *
 * Agora o HTML sai sempre com o fundo da CASA, estático. Quem chegou por um
 * link pessoal tem o cookie no navegador; este componente o vê na
 * hidratação, pergunta a `/api/corretor-ativo` (sem banco: a lista de
 * corretores já está cacheada por etiqueta) e troca o fundo. O custo
 * declarado: para quem veio pelo link, a foto do corretor entra um instante
 * depois da primeira pintura, em vez de vir no HTML. Para todo o resto —
 * quem chega pelo Google, que é a maioria — nada é pedido e nada muda.
 *
 * `useSyncExternalStore` para ler o cookie: no servidor (e na hidratação) a
 * resposta é "não tem", que é o que o HTML estático afirma; o navegador
 * corrige no primeiro quadro, sem aviso de hidratação e sem `setState` em
 * efeito.
 */

type FundoDoCorretor = {
  fundoTipo: FundoTipo | null;
  fundoFotoUrl: string | null;
  videoUrl: string | null;
};

type Personalizacao = { tipo: "nenhuma" } | { tipo: "foto"; src: string } | { tipo: "video"; src: string };

const Contexto = createContext<Personalizacao>({ tipo: "nenhuma" });

const semAssinatura = () => () => {};
const lerCookieNoNavegador = () =>
  document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE_CORRETOR_ATIVO}=`));
const semCookie = () => false;

function decidir(corretor: FundoDoCorretor | null | undefined): Personalizacao {
  if (!corretor) return { tipo: "nenhuma" };
  if (corretor.fundoTipo === "foto" && corretor.fundoFotoUrl) return { tipo: "foto", src: corretor.fundoFotoUrl };
  // Vídeo PRÓPRIO do corretor tem precedência sobre a peça da casa: é
  // personalização explícita dele, feita no painel.
  if (corretor.videoUrl) return { tipo: "video", src: corretor.videoUrl };
  return { tipo: "nenhuma" };
}

export function PersonalizacaoDoLink({ children }: { children: ReactNode }) {
  const temCookie = useSyncExternalStore(semAssinatura, lerCookieNoNavegador, semCookie);
  // `undefined` = ainda não perguntou; `null` = perguntou e não há corretor.
  const [corretor, setCorretor] = useState<FundoDoCorretor | null | undefined>(undefined);

  useEffect(() => {
    if (!temCookie) return;
    let vivo = true;
    fetch("/api/corretor-ativo", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((dados: { corretor?: FundoDoCorretor | null } | null) => {
        if (vivo) setCorretor(dados?.corretor ?? null);
      })
      .catch(() => {
        // Falha aberta, como `getCorretorAtivo`: sem resposta, fica o fundo
        // da casa — é o que o HTML já mostra.
        if (vivo) setCorretor(null);
      });
    return () => {
      vivo = false;
    };
  }, [temCookie]);

  return <Contexto.Provider value={temCookie ? decidir(corretor) : { tipo: "nenhuma" }}>{children}</Contexto.Provider>;
}

/** O fundo dentro da caixa fixa: o do corretor quando há, senão o `padrao` da casa. */
export function FundoDoLink({ padrao }: { padrao: ReactNode }) {
  const personalizacao = useContext(Contexto);
  if (personalizacao.tipo === "foto") return <HeroImageBackground src={personalizacao.src} />;
  if (personalizacao.tipo === "video") return <HeroVideoBackground src={personalizacao.src} />;
  return <>{padrao}</>;
}

/** O que só existe quando o fundo é o da casa (a peça do celular, por exemplo). */
export function SoComFundoDaCasa({ children }: { children: ReactNode }) {
  const personalizacao = useContext(Contexto);
  return personalizacao.tipo === "nenhuma" ? <>{children}</> : null;
}
