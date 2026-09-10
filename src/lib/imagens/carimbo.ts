import "server-only";

import { RESSALVA } from "./marketing";

/**
 * O carimbo da ressalva legal — escrito por CÓDIGO sobre a imagem pronta.
 *
 * ## Por que ele existe de novo
 *
 * A ressalva era desenhada por `compor.ts`, apagado em 10/09/2026 junto com o
 * caminho de arte composta que nunca produziu uma peça. Com ele saiu o único
 * lugar do sistema que escrevia "Imagem gerada por IA, meramente ilustrativa."
 * numa imagem — e por algumas horas toda arte saiu sem aviso nenhum.
 *
 * O motor de VÍDEO nunca perdeu a dele (`render.ts` a desenha com o FFmpeg).
 * Era só o caminho de imagem que estava descoberto: dois caminhos irmãos e um
 * só corrigido, a assinatura que esta base já registrou mais de uma vez.
 *
 * ## Por que não se pede ao modelo
 *
 * O `gpt-image-2` acerta um texto literal 3 em 4 (medido aqui; 2 em 2 com a
 * técnica de aspas e soletração da F0). Isso é ótimo para uma manchete e
 * inaceitável para um aviso legal: uma palavra trocada muda o que a peça está
 * afirmando ao consumidor. `receitas.test.ts` trava essa regra lendo o código.
 *
 * ## Por que SEMPRE, e não atrás de um botão
 *
 * O carimbo de marketing — logo, telefone, chamada — é decoração e cabe num
 * botão: quem vai levar a arte para o Canva não quer a marca queimada nela.
 * A ressalva não é decoração. Ela é o que separa uma perspectiva ilustrativa
 * de uma promessa ao cliente, e aviso legal opcional é aviso legal esquecido
 * — a mesma razão pela qual a cláusula anti-invenção mora em `gerarImagem.ts`
 * e não na tela.
 *
 * ## O que acontece quando falha
 *
 * A imagem JÁ FOI PAGA quando o carimbo roda. Recusar de nada adiantaria:
 * queimaria o dinheiro e devolveria erro para quem não errou. Então a função
 * degrada — devolve os bytes originais com `carimbada: false`, e quem chama é
 * obrigado a contar isso para o corretor, porque uma peça sem a ressalva
 * exige que ele escreva a dele antes de publicar.
 */

/** `sharp` sob demanda: binário nativo no topo do módulo já derrubou uma tela inteira aqui. */
type Sharp = (typeof import("sharp"))["default"];
let modulo: Sharp | null | undefined;

async function carregarSharp(): Promise<Sharp | null> {
  if (modulo !== undefined) return modulo;
  try {
    modulo = (await import("sharp")).default;
  } catch (erro) {
    console.error("[carimbo] sharp indisponível neste runtime:", erro);
    modulo = null;
  }
  return modulo;
}

/**
 * A régua da tipografia, toda derivada da LARGURA.
 *
 * Número chumbado quebraria no dia em que um formato novo entrasse — e a
 * primeira arte de story desta base vazou pela direita justamente porque
 * alguém contou CARACTERES onde a conta é de LARGURA.
 */
const BASE = 1024;
/** Média medida da sans-serif do runtime (DejaVu) em texto corrido. */
const EM_POR_CARACTERE = 0.56;
/** Abaixo disto ninguém lê, e ressalva ilegível não cumpre o papel dela. */
const PISO_DE_LEITURA = 11;

export function reguaDoCarimbo(largura: number, texto: string = RESSALVA) {
  const escala = largura / BASE;
  const margem = Math.round(24 * escala);
  const disponivel = largura - 2 * margem;

  /*
   * 18px na base de 1024, encolhendo se o texto for longo — em UMA linha
   * sempre, porque ressalva quebrada em duas some dentro da faixa.
   *
   * O piso de 11px e o "cabe numa linha" são objetivos que se contradizem
   * para texto muito longo, e a saída honesta é DIZER isso em vez de fingir:
   * abaixo de 11 ninguém lê, então a fonte para ali e `cabe` vira `false`.
   * Truncar seria pior — é aviso legal, e meia frase afirma outra coisa.
   *
   * Na prática `cabe` é sempre `true`: a RESSALVA tem 43 caracteres e o menor
   * formato que geramos tem 1024 de largura. O teste trava exatamente isso,
   * para o dia em que alguém alongar o texto ou baixar o formato.
   */
  const ideal = Math.round(18 * escala);
  const queCabe = Math.floor(disponivel / (texto.length * EM_POR_CARACTERE));
  const fonte = Math.max(PISO_DE_LEITURA, Math.min(ideal, queCabe));

  return {
    margem,
    fonte,
    /** A faixa escura por trás. Sem ela o texto some numa foto de céu claro. */
    faixa: Math.round(fonte * 2.6),
    /** `false` = nem no piso de leitura o texto cabe numa linha desta largura. */
    cabe: queCabe >= PISO_DE_LEITURA,
  };
}

/** `&`, `<` e `>` quebram o SVG; a ressalva não os tem hoje, mas ela é um dado. */
function escapar(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/*
 * O véu e a posição do texto foram MEDIDOS, não escolhidos de olho.
 *
 * A primeira versão punha a linha de base no MEIO da faixa e o gradiente ia
 * até 0,62 de preto. Sobre uma foto de céu branco — o pior caso, e comum numa
 * fachada — isso dava **2,08:1** de contraste: abaixo de AA, ou seja, um aviso
 * legal que não se lê. E passou despercebido ao olho porque a amostra que eu
 * tinha desenhado usava fundo cinza-claro, não branco.
 *
 * O que conserta são duas coisas juntas: o véu fecha mais cedo e mais forte, e
 * o texto desce para os 62% da faixa, onde ele já está escuro. Medido de novo:
 * **9,46:1**. `carimbo.test.ts` mede isso a cada rodada, sobre branco puro.
 */
const PARADA_DO_VEU = [
  { em: "0%", opacidade: 0 },
  { em: "55%", opacidade: 0.72 },
  { em: "100%", opacidade: 0.82 },
] as const;

/** Onde a linha de base cai dentro da faixa. 0,62 = já na parte escura. */
const ALTURA_DA_LINHA = 0.62;

export function svgDaRessalva(largura: number, altura: number, texto: string = RESSALVA): string {
  const { margem, fonte, faixa } = reguaDoCarimbo(largura, texto);
  const topoDaFaixa = altura - faixa;
  const linhaDeBase = Math.round(topoDaFaixa + faixa * ALTURA_DA_LINHA + fonte * 0.34);
  const paradas = PARADA_DO_VEU.map(
    (p) => `<stop offset="${p.em}" stop-color="#000000" stop-opacity="${p.opacidade}"/>`,
  ).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}">
  <defs><linearGradient id="veu" x1="0" y1="0" x2="0" y2="1">${paradas}</linearGradient></defs>
  <rect x="0" y="${topoDaFaixa}" width="${largura}" height="${faixa}" fill="url(#veu)"/>
  <text x="${margem}" y="${linhaDeBase}" font-family="sans-serif" font-size="${fonte}" fill="#ffffff">${escapar(texto)}</text>
</svg>`;
}

/** Onde o miolo das letras cai, em pixels — é a linha que o teste de contraste mede. */
export function linhaDoTexto(largura: number, altura: number, texto: string = RESSALVA): number {
  const { faixa } = reguaDoCarimbo(largura, texto);
  return Math.round(altura - faixa + faixa * ALTURA_DA_LINHA);
}

export type Carimbada = {
  bytes: Buffer;
  mime: string;
  /** `false` = a imagem saiu SEM a ressalva e a tela precisa dizer isso. */
  carimbada: boolean;
};

export async function carimbarRessalva(bytes: Buffer, mime = "image/png"): Promise<Carimbada> {
  const cru: Carimbada = { bytes, mime, carimbada: false };

  const sharp = await carregarSharp();
  if (!sharp) return cru;

  try {
    const imagem = sharp(bytes);
    const meta = await imagem.metadata();
    if (!meta.width || !meta.height) return cru;

    const composta = await imagem
      .composite([{ input: Buffer.from(svgDaRessalva(meta.width, meta.height)), top: 0, left: 0 }])
      .png()
      .toBuffer();

    return { bytes: composta, mime: "image/png", carimbada: true };
  } catch (erro) {
    console.error("[carimbo] não deu para escrever a ressalva:", erro);
    return cru;
  }
}
