import type { Metadata } from "next";
import TELAS from "./telasDeAbertura.json";

/**
 * O app no iPhone (29/10/2026): o CRM como PWA de primeira classe no iOS,
 * enquanto o app da App Store não existe (plano em `docs/APP-IOS.md`).
 *
 * Módulo PURO. Três coisas:
 *
 * 1. Os metadados do "Adicionar à Tela de Início": abre sem a barra do
 *    Safari, barra de status translúcida (o cabeçalho do painel já reserva
 *    `env(safe-area-inset-top)`), nome curto e as telas de abertura.
 * 2. As telas de abertura (`apple-touch-startup-image`): o iOS NÃO monta
 *    splash pelo manifesto como o Android; ou existe uma imagem do tamanho
 *    exato da tela (casada por media query), ou o app abre num branco. As
 *    imagens saem de `scripts/marca/gerarIconeAstroimob.mjs`, com a mesma
 *    lista (`telasDeAbertura.json`).
 * 3. Quem está no Safari do iPhone/iPad e ainda não instalou — o único caso
 *    em que o cartão "Instalar no iPhone" aparece.
 */

export type TelaDeAbertura = { aparelho: string; largura: number; altura: number; escala: number };

export const TELAS_DE_ABERTURA: TelaDeAbertura[] = TELAS;

/** Fundo do splash = o do `astro.webmanifest` e da abertura animada. */
export const FUNDO_DA_ABERTURA = "#08132a";

export function arquivoDaTela(t: TelaDeAbertura): string {
  return `/icones/abertura/astro-${t.largura * t.escala}x${t.altura * t.escala}.png`;
}

/** A media query que o Safari usa para escolher a imagem (só retrato: o app é retrato). */
export function mediaDaTela(t: TelaDeAbertura): string {
  return `(device-width: ${t.largura}px) and (device-height: ${t.altura}px) and (-webkit-device-pixel-ratio: ${t.escala}) and (orientation: portrait)`;
}

/** Os tamanhos de ícone que o iOS pede (iPhone 120/180, iPad 152/167). */
export const ICONES_DO_IOS = [120, 152, 167, 180] as const;

export const APP_DO_IPHONE: NonNullable<Metadata["appleWebApp"]> = {
  capable: true,
  title: "Astro CRM",
  statusBarStyle: "black-translucent",
  startupImage: TELAS_DE_ABERTURA.map((t) => ({ url: arquivoDaTela(t), media: mediaDaTela(t) })),
};

/**
 * O Next escreve só `mobile-web-app-capable` para `capable: true`; iPhones
 * mais antigos só leem o nome com prefixo da Apple. Vai pelos dois.
 */
export const META_DO_IPHONE: NonNullable<Metadata["other"]> = { "apple-mobile-web-app-capable": "yes" };

export const ICONES_APPLE_DA_ASTRO = ICONES_DO_IOS.map((lado) => ({
  url: `/icones/astroimob-${lado}.png`,
  sizes: `${lado}x${lado}`,
  type: "image/png",
}));

// ---------------------------------------------------------------------------
// Detecção do Safari no iOS
// ---------------------------------------------------------------------------

export type Aparelho = {
  userAgent: string;
  /** `navigator.maxTouchPoints`: o iPad com iPadOS 13+ se diz "Macintosh". */
  toques?: number;
  /** `navigator.standalone` (só existe no iOS) ou `display-mode: standalone`. */
  instalado?: boolean;
};

/** Navegadores do iOS que não são o Safari (todos WebKit, mas com outro menu). */
const OUTROS_NAVEGADORES = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo|GSA\/|Brave/i;
/** Navegadores embutidos (Instagram, Facebook, WhatsApp, LinkedIn…): sem "Adicionar à Tela de Início". */
const EMBUTIDOS = /FBAN|FBAV|FB_IAB|Instagram|Line\/|LinkedInApp|Twitter|WhatsApp|Snapchat|TikTok|musical_ly|MicroMessenger/i;

export function ehIos(a: Aparelho): boolean {
  if (/iPhone|iPod|iPad/.test(a.userAgent)) return true;
  // iPadOS 13+ pede a versão de computador e se apresenta como Mac.
  return /Macintosh/.test(a.userAgent) && (a.toques ?? 0) > 1;
}

/**
 * O cartão de instalação só vale aqui: iOS, Safari de verdade (o menu
 * Compartilhar → "Adicionar à Tela de Início" é o dele) e ainda não
 * instalado.
 */
export function mostrarGuiaDoIphone(a: Aparelho): boolean {
  if (a.instalado) return false;
  if (!ehIos(a)) return false;
  if (OUTROS_NAVEGADORES.test(a.userAgent) || EMBUTIDOS.test(a.userAgent)) return false;
  return /Safari\//.test(a.userAgent) && /Version\//.test(a.userAgent);
}
