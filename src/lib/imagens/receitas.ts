/**
 * As receitas — o que o corretor escolhe em vez de saber escrever um prompt.
 *
 * O problema medido é concreto: quem usa esta tela vende imóvel, não escreve
 * para modelo de imagem. O pedido que sai da cabeça dele é "sala moderna", e o
 * que separa isso de uma arte publicável não é vocabulário bonito — é a
 * ESPINHA TÉCNICA que ele não tem motivo nenhum para saber: tipo de lente,
 * altura da câmera, hora do dia, qualidade de luz, e o que a imagem NÃO pode
 * inventar.
 *
 * Então a receita carrega essa espinha e ele carrega o assunto. Junta-se por
 * CÓDIGO, na rota, antes de qualquer IA entrar: escolher a receita já melhora
 * o resultado mesmo que o botão de melhorar a descrição nunca seja tocado, e
 * mesmo que o motor de texto esteja fora do ar. A IA é o degrau de cima, não o
 * piso.
 *
 * **Tudo aqui é em português, e isso é decisão, não descuido.** Modelo de
 * imagem costuma responder um pouco melhor em inglês, mas o prompt final
 * aparece na tela para o corretor ler, corrigir e aprender com ele — e prompt
 * que ele não consegue ler é prompt que ele não consegue consertar. Legível
 * por quem usa ganha da margem de qualidade.
 *
 * Módulo PURO, sem `server-only`: a tela é `"use client"` e precisa dos
 * rótulos. Mesma pedra de `limitesPdf.ts`, `pessoasTipos.ts` e
 * `imagensTipos.ts`.
 */

import type { ChaveTamanho } from "./imagensTipos";

export type Receita = {
  chave: string;
  /** O trabalho, com o nome que quem faz o trabalho usa. */
  rotulo: string;
  /** Uma linha na tela, dizendo para que serve. */
  ajuda: string;
  /** Sem foto anexada, esta receita não funciona — a tela avisa antes. */
  precisaFoto: boolean;
  /** O formato que quase sempre é o certo para este trabalho. */
  tamanhoSugerido: ChaveTamanho;
  /** O que o corretor escreveria se soubesse — some no prompt final. */
  espinha: string;
  /** Exemplo curto, que vira o placeholder do campo. */
  exemplo: string;
};

export const RECEITAS: Receita[] = [
  {
    chave: "ambientar",
    rotulo: "Mobiliar ambiente vazio",
    ajuda: "Parte da foto de um cômodo vazio e coloca móveis nele.",
    precisaFoto: true,
    tamanhoSugerido: "paisagem",
    espinha:
      "Fotografia de interiores profissional. Mantenha EXATAMENTE a arquitetura " +
      "da foto original: mesmas paredes, janelas, portas, piso, pé-direito e " +
      "mesmo ângulo de câmera. Apenas acrescente mobília e decoração, com " +
      "escala correta em relação ao ambiente. Luz natural entrando pelas " +
      "janelas, iluminação suave e realista, sombras coerentes com essa luz.",
    exemplo: "sala de estar, estilo contemporâneo, tons claros",
  },
  {
    chave: "melhorar_foto",
    rotulo: "Melhorar a luz da foto",
    ajuda: "Foto escura ou com dia nublado vira uma foto bem iluminada.",
    precisaFoto: true,
    tamanhoSugerido: "paisagem",
    espinha:
      "Tratamento fotográfico profissional. Mantenha EXATAMENTE o mesmo " +
      "enquadramento, o mesmo ângulo e a mesma arquitetura da foto original — " +
      "não acrescente nem remova elementos construídos. Corrija a exposição, " +
      "recupere as sombras, deixe as cores naturais e o céu limpo. Resultado " +
      "com aparência de foto real, sem efeito artificial.",
    exemplo: "fim de tarde, céu com poucas nuvens",
  },
  {
    chave: "fachada",
    rotulo: "Fachada do prédio",
    ajuda: "Perspectiva de um empreendimento, útil quando ainda é na planta.",
    precisaFoto: false,
    tamanhoSugerido: "retrato",
    espinha:
      "Perspectiva arquitetônica fotorrealista de edifício residencial, vista " +
      "da calçada, câmera na altura dos olhos, lente de 24mm sem distorção. " +
      "Paisagismo tratado no térreo, iluminação de destaque na entrada. " +
      "Acabamento e volumetria coerentes com prédio recém-entregue.",
    exemplo: "torre de 12 andares, sacadas amplas, entardecer",
  },
  {
    chave: "ambiente_decorado",
    rotulo: "Ambiente decorado do zero",
    ajuda: "Cria o cômodo inteiro, para quando não existe foto ainda.",
    precisaFoto: false,
    tamanhoSugerido: "paisagem",
    espinha:
      "Fotografia de interiores profissional de apartamento decorado, câmera " +
      "na altura dos olhos, lente grande-angular sem distorção nas bordas. " +
      "Luz natural de janela ampla, iluminação suave, materiais realistas e " +
      "proporções corretas de um apartamento urbano.",
    exemplo: "cozinha integrada, ilha central, madeira clara",
  },
  {
    chave: "fundo_post",
    rotulo: "Fundo para post",
    ajuda: "Imagem de fundo para arte de story ou feed. O texto você escreve depois.",
    precisaFoto: false,
    tamanhoSugerido: "retrato",
    espinha:
      "Imagem publicitária de alto padrão para o mercado imobiliário, " +
      "fotorrealista, composição limpa com ÁREA VAZIA generosa em uma das " +
      "laterais ou no topo, reservada para receber texto depois. Iluminação " +
      "cinematográfica, cores sóbrias e elegantes.",
    exemplo: "varanda com vista para a cidade ao anoitecer",
  },
  {
    chave: "livre",
    rotulo: "Livre",
    ajuda: "Sem receita: vale exatamente o que você escrever.",
    precisaFoto: false,
    tamanhoSugerido: "quadrado",
    espinha: "",
    exemplo: "descreva a imagem que você quer",
  },
];

export const RECEITA_PADRAO = "ambientar";

export function receitaPor(chave: string | null | undefined): Receita {
  return RECEITAS.find((r) => r.chave === chave) ?? RECEITAS[RECEITAS.length - 1];
}

/**
 * Junta espinha e pedido. Determinístico, e é o que faz a receita valer
 * mesmo com o motor de texto fora do ar.
 *
 * A espinha vem DEPOIS do pedido de propósito: o assunto é o que o corretor
 * escreveu, e o que vem por último num prompt de imagem tende a ser lido como
 * ajuste, não como tema. Invertido, "fotografia de interiores profissional"
 * viraria o assunto e "sala com sofá cinza" viraria o detalhe.
 */
export function montarPedido(pedidoDoCorretor: string, receita: Receita): string {
  const pedido = pedidoDoCorretor.trim();
  if (!receita.espinha) return pedido;
  return `${pedido}. ${receita.espinha}`;
}
