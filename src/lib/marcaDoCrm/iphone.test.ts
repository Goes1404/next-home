import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_DO_IPHONE, ICONES_DO_IOS, TELAS_DE_ABERTURA, arquivoDaTela, ehIos, mediaDaTela, mostrarGuiaDoIphone } from "./iphone";

const UA = {
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1",
  firefoxIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0 (iPhone15,3; iOS 18_1; pt_BR)",
  whatsappIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1 WhatsApp/24.20",
  ipadOs: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};

describe("guia de instalação no iPhone", () => {
  it("aparece no Safari do iPhone e do iPad (que se diz Mac), fora do app", () => {
    expect(mostrarGuiaDoIphone({ userAgent: UA.safariIphone })).toBe(true);
    expect(mostrarGuiaDoIphone({ userAgent: UA.ipadOs, toques: 5 })).toBe(true);
  });

  it("some no app já instalado", () => {
    expect(mostrarGuiaDoIphone({ userAgent: UA.safariIphone, instalado: true })).toBe(false);
  });

  it("some em outros navegadores e nos embutidos do iPhone (não têm o menu do Safari)", () => {
    for (const ua of [UA.chromeIphone, UA.firefoxIphone, UA.instagram, UA.whatsappIphone]) {
      expect(mostrarGuiaDoIphone({ userAgent: ua }), ua).toBe(false);
    }
  });

  it("some fora do iOS: Mac de verdade (sem toque) e Android", () => {
    expect(ehIos({ userAgent: UA.safariMac, toques: 0 })).toBe(false);
    expect(mostrarGuiaDoIphone({ userAgent: UA.safariMac, toques: 0 })).toBe(false);
    expect(mostrarGuiaDoIphone({ userAgent: UA.chromeAndroid, toques: 5 })).toBe(false);
  });
});

describe("app do iPhone: metadados e arquivos", () => {
  const publico = (url: string) => join(process.cwd(), "public", url);

  it("abre sem a barra do Safari, com barra translúcida e nome curto", () => {
    expect(APP_DO_IPHONE).toMatchObject({ capable: true, statusBarStyle: "black-translucent", title: "Astro CRM" });
  });

  it("toda tela de abertura declarada existe, com o tamanho em pixels no nome", () => {
    expect(TELAS_DE_ABERTURA.length).toBeGreaterThanOrEqual(10);
    for (const t of TELAS_DE_ABERTURA) {
      expect(existsSync(publico(arquivoDaTela(t))), arquivoDaTela(t)).toBe(true);
      expect(arquivoDaTela(t)).toContain(`${t.largura * t.escala}x${t.altura * t.escala}`);
      expect(mediaDaTela(t)).toContain(`-webkit-device-pixel-ratio: ${t.escala}`);
    }
    // Duas telas com a mesma media query: o Safari ficaria com uma só.
    const medias = TELAS_DE_ABERTURA.map(mediaDaTela);
    expect(new Set(medias).size).toBe(medias.length);
  });

  it("os ícones do iOS existem", () => {
    for (const lado of ICONES_DO_IOS) expect(existsSync(publico(`/icones/astroimob-${lado}.png`)), String(lado)).toBe(true);
  });
});
