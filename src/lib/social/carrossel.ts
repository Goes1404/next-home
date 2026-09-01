import type { Empreendimento, Midia } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/types";

/**
 * O roteiro de um carrossel de Instagram, montado do catálogo.
 *
 * ## Por que este recurso existe
 *
 * É o único da lista que **não depende de nada que está quebrado**: o
 * número do WhatsApp fora do ar, a ausência de conversas e os 112 leads
 * frios não impedem um post. E ataca o gargalo medido — o TOPO do funil,
 * onde a campanha converte a 0,98% e o site traz pouco.
 *
 * A matéria-prima já está curada: 25 imóveis publicados, 307 fotos, e 257
 * com descrição real escrita por visão em agosto. É delas que sai a legenda
 * de cada slide.
 *
 * ## A restrição que definiu o layout
 *
 * Medido antes de desenhar: **nenhuma foto passa de 1000px** e a maioria é
 * paisagem (1000×562, 900×506). Carrossel é 1080×1350, em pé. Foto sangrada
 * exigiria cortar dois terços da imagem ou esticar. Por isso o slide é um
 * CARTÃO — faixa de foto com tipografia da marca em volta — que além de
 * caber, sai com a cara da casa em vez de mais um post genérico.
 *
 * ## O que este módulo NÃO faz
 *
 * Não desenha nada e não sabe o que é `sharp`. Aqui mora a decisão de
 * PRODUTO: quais fotos, em que ordem, com que texto. A renderização é
 * `renderizarSlide.ts`, que é I/O e depende de binário nativo — separação
 * que esta casa já pagou caro para aprender (uma constante importada de um
 * módulo com `sharp` derrubou a página inteira do editor).
 */

export type TipoDeSlide = "capa" | "foto" | "tipologias" | "localizacao" | "chamada";

export interface Slide {
  tipo: TipoDeSlide;
  /** A linha grande. Curta: é lida em um segundo, no feed. */
  titulo: string;
  /** A linha de apoio. Pode ser vazia. */
  apoio: string;
  /** A foto de fundo do cartão, quando houver. */
  foto: Midia | null;
}

/** Instagram: 4:5 é o formato mais alto do feed — mais tela por post. */
export const LARGURA = 1080;
export const ALTURA = 1350;

/**
 * Quantas fotos entram.
 *
 * Sete a dez slides é o intervalo em que o carrossel ainda é percorrido até
 * o fim. Com capa, tipologias, localização e chamada fixos, sobram quatro
 * para foto — e é melhor mostrar quatro boas que dez repetidas.
 */
const FOTOS_NO_CARROSSEL = 4;

/**
 * Legenda de slide a partir do `alt` da foto.
 *
 * O `alt` foi escrito para leitor de tela e é descritivo demais para o
 * feed ("Living integrado com adega climatizada e sala de jantar, unidade
 * 03"). Corta na primeira vírgula e limita o tamanho: o que sobra é o
 * assunto da foto, que é o que a legenda precisa dizer.
 *
 * É a mesma lição que tirou o `alt` da legenda do WhatsApp — texto de
 * acessibilidade não é texto de cliente.
 */
export function legendaDaFoto(alt: string): string {
  const primeiraParte = alt.split(/[,;–—]/)[0].trim();
  const limpa = primeiraParte.replace(/\s+/g, " ");
  return limpa.length > 48 ? `${limpa.slice(0, 45).trimEnd()}…` : limpa;
}

/** "2 e 3 dormitórios · 63 a 81 m²" — o que o cliente pergunta primeiro. */
export function resumoDeTipologias(imovel: Empreendimento): string {
  const dorms = [...new Set(imovel.tipologias.map((t) => t.dormitorios).filter(Boolean))].sort();
  const areas = imovel.tipologias
    .map((t) => t.areaPrivativa)
    .filter((a): a is number => typeof a === "number" && a > 0);

  const partes: string[] = [];
  if (dorms.length > 0) {
    partes.push(`${dorms.join(" e ")} dormitório${dorms.some((d) => d > 1) ? "s" : ""}`);
  }
  if (areas.length > 0) {
    const min = Math.min(...areas);
    const max = Math.max(...areas);
    partes.push(min === max ? `${min} m²` : `${min} a ${max} m²`);
  }
  return partes.join(" · ");
}

/**
 * O roteiro completo.
 *
 * A ordem não é decorativa: capa prende, fotos sustentam, tipologia
 * responde a pergunta que todo mundo faz, localização é o que decide em
 * lançamento, e a chamada fecha com o caminho para falar com ESTE corretor.
 *
 * Slide sem conteúdo não entra. Um cartão dizendo "sem informação" no meio
 * do carrossel é pior que um carrossel mais curto — a mesma régua do
 * contador que só aparece quando é maior que zero.
 */
export function montarCarrossel(params: {
  imovel: Empreendimento;
  /** O link que vai na chamada — já com o slug do corretor. */
  linkDaChamada: string;
}): Slide[] {
  const { imovel } = params;
  const slides: Slide[] = [];

  const fotos = imovel.galeria.filter((m) => m.url);
  const capa = fotos[0] ?? imovel.capa ?? null;

  slides.push({
    tipo: "capa",
    titulo: imovel.nome,
    apoio: `${imovel.bairro}, ${imovel.cidade} · ${STATUS_LABEL[imovel.status]}`,
    foto: capa,
  });

  for (const foto of fotos.slice(1, 1 + FOTOS_NO_CARROSSEL)) {
    slides.push({
      tipo: "foto",
      titulo: legendaDaFoto(foto.alt || imovel.nome),
      apoio: "",
      foto,
    });
  }

  const tipologias = resumoDeTipologias(imovel);
  if (tipologias) {
    slides.push({
      tipo: "tipologias",
      titulo: tipologias,
      apoio: imovel.construtora ? `Construtora ${imovel.construtora}` : "",
      foto: imovel.plantas[0] ?? null,
    });
  }

  slides.push({
    tipo: "localizacao",
    titulo: imovel.bairro,
    apoio: imovel.endereco || imovel.cidade,
    foto: fotos[1 + FOTOS_NO_CARROSSEL] ?? null,
  });

  slides.push({
    tipo: "chamada",
    titulo: "Quer conhecer?",
    apoio: params.linkDaChamada,
    foto: null,
  });

  return slides;
}
