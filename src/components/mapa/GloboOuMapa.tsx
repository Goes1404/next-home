"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapaEmpreendimentos } from "@/components/mapa/MapaEmpreendimentos";
import type { Empreendimento } from "@/lib/types";
import { estadoDaTransicao, DURACAO_MERGULHO_MS } from "./transicaoGlobo";

// O globo carrega no cliente e só quando é usado — é WebGL, não faz sentido
// no HTML do servidor.
const Globo = dynamic(
  () => import("@/components/mapa/GloboImoveis").then((m) => m.GloboImoveis),
  { ssr: false },
);

/**
 * A seção do mapa em dois tempos: o mundo, e então a região.
 *
 * Primeiro o visitante vê um globo girando com um pino em cada imóvel; ao
 * tocar (ou usar o botão), a CÂMERA CAI sobre o continente até a região, e o
 * mapa interativo assume no fim da queda. É a mesma narrativa da página do
 * imóvel — mostrar antes de explicar — aplicada à localização.
 *
 * A transição existe porque a troca seca desperdiçava o único argumento do
 * globo: onde, no mundo, fica isto aqui. Trocar um componente pelo outro no
 * mesmo quadro é um corte; a queda é uma frase.
 *
 * Os dois ficam montados durante o mergulho, e é isso que faz funcionar: o
 * mapa entra ANTES de o globo terminar de sair (ver `transicaoGlobo.ts`),
 * senão há um quadro de fundo vazio no meio. O preço é ter Leaflet e WebGL
 * vivos ao mesmo tempo por ~1,5s — o globo é destruído no fim, devolvendo o
 * contexto ao orçamento (`orcamentoWebgl`).
 *
 * Há um ganho concreto além do visual: o Leaflet (146 KB de JS) e as ~15
 * requisições de tile a um CDN externo só acontecem quando alguém pede o
 * mapa. Quem rola a home inteira sem tocar aqui não paga nada disso.
 *
 * Imóvel sem lat/lng não vira pino — mesma regra do mapa (ver
 * docs/MEMORIA.md: "nunca inventar coordenada de pin").
 */
/**
 * `preparando` monta o Leaflet invisível assim que o visitante demonstra
 * intenção — o ponteiro chegando no botão, ou o dedo encostando no globo.
 *
 * Não é adiantamento gratuito: o mapa trava a thread ao nascer (em dev,
 * ~900ms sem um único quadro), e esse engasgo caía bem no meio da queda.
 * Quem nunca chega perto do botão continua sem baixar os 146 KB do Leaflet
 * nem pedir tile nenhum, que é a razão de o globo existir.
 */
type Fase = "globo" | "preparando" | "mergulhando" | "mapa";

export function GloboOuMapa({
  empreendimentos,
  alturaClasse,
}: {
  empreendimentos: Empreendimento[];
  alturaClasse: string;
}) {
  const [fase, setFase] = useState<Fase>("globo");
  const camadaDoMapa = useRef<HTMLDivElement>(null);

  /*
   * `useMemo` NÃO é otimização aqui, é correção. Sem ele, `pinos` é um
   * array novo a cada render; o efeito do globo depende dele, e o globo
   * inteiro era destruído e recriado — em WebGL, a cada quadro do mergulho.
   * Na tela: a queda não acontecia, o globo simplesmente sumia.
   */
  const pinos = useMemo(
    () =>
      empreendimentos
        .filter((e) => e.lat !== null && e.lng !== null)
        .map((e) => ({ lat: e.lat as number, lng: e.lng as number })),
    [empreendimentos],
  );

  const prepararOMapa = useCallback(() => {
    setFase((atual) => (atual === "globo" ? "preparando" : atual));
  }, []);

  const pedirOMapa = useCallback(() => {
    // Quem pediu para reduzir movimento recebe o mapa direto. A queda é
    // exatamente o tipo de câmera que provoca enjoo em quem é sensível a
    // isso, e aqui ela não carrega informação que o mapa já não dê.
    const reduzido =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    setFase(reduzido ? "mapa" : "mergulhando");
  }, []);

  /*
   * A opacidade do mapa segue a mesma curva do globo, escrita DIRETO no
   * estilo do nó — não em estado de React. Um `setState` por quadro
   * re-renderizaria a árvore do Leaflet 90 vezes durante a queda, e foi
   * assim que o globo acabou sendo recriado a cada quadro na primeira
   * versão desta transição.
   */
  useEffect(() => {
    if (fase !== "mergulhando") return;
    const inicio = performance.now();
    let quadro = 0;

    const seguir = () => {
      const t = (performance.now() - inicio) / DURACAO_MERGULHO_MS;
      const camada = camadaDoMapa.current;
      if (camada) camada.style.opacity = String(estadoDaTransicao(t).opacidadeMapa);
      if (t < 1) quadro = requestAnimationFrame(seguir);
    };

    quadro = requestAnimationFrame(seguir);
    return () => cancelAnimationFrame(quadro);
  }, [fase]);

  const mostrarSoOMapa = useCallback(() => setFase("mapa"), []);

  if (fase === "mapa" || pinos.length === 0) {
    return (
      <MapaEmpreendimentos
        empreendimentos={empreendimentos}
        alturaClasse={alturaClasse}
        compacto
        // Já foi pedido explicitamente: não faz sentido esperar visibilidade.
        /*
         * Só quando NÃO houve pedido: é o caminho de quem não tem pino
         * nenhum no catálogo, e aí o mapa espera a seção chegar perto da
         * viewport (146 KB + ~15 tiles que talvez ninguém role até ver).
         * Depois do mergulho, esperar visibilidade seria absurdo — o mapa
         * acabou de ser pedido.
         */
        adiarAteVisivel={fase === "globo"}
      />
    );
  }

  return (
    <div
      className={`relative w-full overflow-hidden rounded-2xl border border-linha bg-superficie/40 ${alturaClasse}`}
    >
      {/*
        O mapa entra POR BAIXO, já montado e voando para o enquadramento
        enquanto o globo ainda cobre a tela. Montá-lo só no fim da queda
        mostraria o esqueleto de carregamento do Leaflet — o carregamento
        acontece atrás do globo, que é onde ninguém vê.
      */}
      {/*
        As duas camadas têm `key` FIXA, e isso não é preferência de estilo: o
        React reconcilia filhos por posição, então ao inserir a camada do
        mapa o div do globo passava a ser comparado com o do mapa e o globo
        REMONTAVA — WebGL destruído e recriado no primeiro quadro da queda.
        Na tela, o globo simplesmente sumia ao clicar.
      */}
      {fase !== "globo" && (
        <div key="mapa" ref={camadaDoMapa} className="absolute inset-0" style={{ opacity: 0 }}>
          <MapaEmpreendimentos
            empreendimentos={empreendimentos}
            alturaClasse="h-full"
            compacto
            entradaCinematica
          />
        </div>
      )}

      <div key="globo" className="absolute inset-0">
        <Globo
          pinos={pinos}
          aoAtivar={pedirOMapa}
          aoAproximar={prepararOMapa}
          mergulhando={fase === "mergulhando"}
          // Só agora o globo sai da árvore: desmontá-lo antes devolveria o
          // contexto WebGL no meio da própria animação.
          aoFimDoMergulho={mostrarSoOMapa}
          className="h-full w-full py-6"
        />
      </div>
    </div>
  );
}
