/**
 * O texto que o corretor DITOU para aparecer na imagem.
 *
 * ## Por que aspas, e por que isto existe
 *
 * Com a cláusula anti-texto retirada (11/09/2026), o modelo escreve o que
 * quiser — e é isso que se quer na maior parte dos pedidos. Mas quando a peça
 * tem uma manchete que precisa sair CERTA, "o que quiser" não serve: medido na
 * F0 de 10/09, o modelo acerta o texto literal 3 em 4 quando ele aparece solto
 * no pedido, e **2 em 2** quando vem entre aspas e soletrado.
 *
 * As aspas são a convenção mais barata que existe: ninguém precisa aprender
 * campo novo, e quem não souber da regra continua sendo atendido — sem aspas,
 * nada é ditado.
 *
 * Módulo PURO, sem `server-only`: a tela é `"use client"` e pode querer
 * mostrar o que foi reconhecido. Constante é valor (a pedra do `limitesPdf.ts`).
 */

/**
 * Quantos textos no máximo.
 *
 * Quatro cobre manchete, apoio, selo e chamada — a anatomia das peças reais
 * que serviram de referência. Acima disso o pedido é um LAYOUT, e layout não
 * se resolve pedindo mais texto a um gerador de imagem: sai amontoado, e a
 * geração é paga.
 */
export const TETO_DE_TEXTOS = 4;

/** Abaixo disto não é texto de peça: é aspa de ênfase ou resto de digitação. */
const MINIMO_DE_CARACTERES = 2;

/*
 * Só aspas DUPLAS, retas ou curvas. Aspas simples ficam de fora de propósito:
 * "marca d'água" e "uma sala 'moderna'" virariam texto ditado, e aí o modelo
 * desenha a palavra solta dentro da peça. O erro é assimétrico — não
 * reconhecer custa um pedido menos preciso; reconhecer errado suja a imagem.
 */
const ASPAS = /"([^"]+)"|“([^”]+)”/g;

export function textosEntreAspas(pedido: string): string[] {
  const achados: string[] = [];
  for (const casamento of pedido.matchAll(ASPAS)) {
    const texto = (casamento[1] ?? casamento[2] ?? "").trim();
    if (texto.length < MINIMO_DE_CARACTERES) continue;
    // Duplicata é repetição de quem reforçou o pedido, não um segundo texto.
    if (achados.includes(texto)) continue;
    achados.push(texto);
    if (achados.length === TETO_DE_TEXTOS) break;
  }
  return achados;
}
