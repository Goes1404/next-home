/**
 * O roteiro do vídeo — quais fotos entram, em que ordem e por quanto tempo.
 *
 * Junto com `gramatica.ts`, é o que garante que dois imóveis produzam vídeos
 * diferentes sem sorteio nenhum: a ordem sai do que aquele imóvel TEM, e o
 * ritmo sai do objetivo da peça.
 *
 * Módulo PURO. Ele não sabe o que é FFmpeg nem `sharp` — decide, não desenha.
 * É a mesma separação que `carrossel.ts` faz com `renderizarSlide.ts`, e que
 * esta casa já pagou caro para aprender (uma constante importada de um módulo
 * com `sharp` derrubou a página inteira do editor de imóveis).
 */

import type { Midia } from "@/lib/types";
import type { ChaveObjetivo } from "@/lib/imagens/marketing";
import { movimentoDoPlano, tipoDoPlano, type Movimento, type TipoDePlano } from "./gramatica";

export type Plano = {
  foto: Midia;
  tipo: TipoDePlano;
  movimento: Movimento;
  /** Segundos deste plano. */
  duracao: number;
  /** Legenda queimada durante este plano. Vazia quando não há o que dizer. */
  legenda: string;
};

/**
 * O ritmo de cada objetivo, e ele não é estético.
 *
 * "Últimas unidades" corta rápido porque urgência se sente no ritmo antes de
 * se ler no texto. "Visite o decorado" corta devagar porque contemplação é o
 * argumento. Um vídeo de 15 a 25 s converte melhor que um de 45 em Reels, e é
 * o `duracao` × `planos` que fecha nessa faixa.
 */
type Ritmo = { planos: number; duracaoPorPlano: number; abre: TipoDePlano };

const RITMO: Record<ChaveObjetivo, Ritmo> = {
  lancamento: { planos: 5, duracaoPorPlano: 4.0, abre: "fachada" },
  decorado: { planos: 5, duracaoPorPlano: 4.5, abre: "interior" },
  ultimas_unidades: { planos: 6, duracaoPorPlano: 2.5, abre: "interior" },
  pronto_para_morar: { planos: 5, duracaoPorPlano: 4.0, abre: "fachada" },
  investimento: { planos: 5, duracaoPorPlano: 4.0, abre: "fachada" },
  vida_no_bairro: { planos: 6, duracaoPorPlano: 3.0, abre: "lazer" },
};

export function ritmoDoObjetivo(objetivo: ChaveObjetivo): Ritmo {
  return RITMO[objetivo] ?? RITMO.lancamento;
}

/**
 * A legenda de um plano, a partir do `alt`.
 *
 * O `alt` foi escrito para leitor de tela e é descritivo demais para vídeo
 * ("Living integrado com adega climatizada e sala de jantar, unidade 03").
 * Corta na primeira pontuação e limita o tamanho — é a mesma régua de
 * `legendaDaFoto` no carrossel, e a mesma lição que tirou o `alt` da legenda
 * de mídia do WhatsApp: texto de acessibilidade não é texto de cliente.
 */
export function legendaDoPlano(alt: string | null | undefined, maxCaracteres = 42): string {
  const primeira = (alt ?? "").split(/[,;:–—]/)[0].trim().replace(/\s+/g, " ");
  if (!primeira) return "";
  if (primeira.length <= maxCaracteres) return primeira;
  return `${primeira.slice(0, maxCaracteres - 1).trimEnd()}…`;
}

/**
 * Ordena as fotos numa narrativa e escolhe quantas entram.
 *
 * A ordem é: o plano de abertura que o objetivo pede, depois alternando entre
 * os tipos disponíveis, e fechando por onde abriu. Alternar importa: três
 * interiores seguidos parecem a mesma sala, mesmo sendo salas diferentes.
 *
 * Fotos repetidas de um mesmo tipo NÃO são descartadas — vão para o fim da
 * fila do tipo. Um imóvel com 12 fotos de interior e nenhuma de fachada ainda
 * precisa de um vídeo.
 */
export function montarRoteiro(params: {
  fotos: Midia[];
  objetivo: ChaveObjetivo;
  /** Multiplica a duração de cada plano. 1 = ritmo do objetivo. */
  escalaDeTempo?: number;
}): Plano[] {
  const { fotos, objetivo } = params;
  const ritmo = ritmoDoObjetivo(objetivo);
  const escala = params.escalaDeTempo ?? 1;

  const usaveis = fotos.filter((f) => f?.url);
  if (usaveis.length === 0) return [];

  // Agrupa por tipo, preservando a ordem original dentro de cada grupo.
  const porTipo = new Map<TipoDePlano, Midia[]>();
  for (const foto of usaveis) {
    const tipo = tipoDoPlano(foto.alt);
    const lista = porTipo.get(tipo) ?? [];
    lista.push(foto);
    porTipo.set(tipo, lista);
  }

  // A roda de tipos: começa pelo que o objetivo pede, depois os demais na
  // ordem em que aparecem no catálogo daquele imóvel.
  const disponiveis = [...porTipo.keys()];
  const roda: TipoDePlano[] = disponiveis.includes(ritmo.abre)
    ? [ritmo.abre, ...disponiveis.filter((t) => t !== ritmo.abre)]
    : disponiveis;

  const escolhidas: Midia[] = [];
  let volta = 0;
  while (escolhidas.length < ritmo.planos && volta < usaveis.length + 1) {
    let pegouAlguma = false;
    for (const tipo of roda) {
      if (escolhidas.length >= ritmo.planos) break;
      const lista = porTipo.get(tipo);
      if (lista && lista.length > 0) {
        escolhidas.push(lista.shift()!);
        pegouAlguma = true;
      }
    }
    if (!pegouAlguma) break; // acabaram as fotos antes de encher o roteiro
    volta += 1;
  }

  return escolhidas.map((foto) => {
    const tipo = tipoDoPlano(foto.alt);
    return {
      foto,
      tipo,
      movimento: movimentoDoPlano(foto.alt),
      duracao: Number((ritmo.duracaoPorPlano * escala).toFixed(2)),
      legenda: legendaDoPlano(foto.alt),
    };
  });
}

/**
 * A duração final, já descontando os crossfades.
 *
 * Cada transição consome `transicao` segundos do total, porque os dois planos
 * se sobrepõem. Sem essa conta, o vídeo prometido e o vídeo entregue não batem
 * — e é a duração que decide se a peça cabe na faixa que converte em Reels.
 */
export function duracaoTotal(planos: Plano[], transicao = 0.7): number {
  if (planos.length === 0) return 0;
  const soma = planos.reduce((total, p) => total + p.duracao, 0);
  return Number((soma - transicao * (planos.length - 1)).toFixed(2));
}
