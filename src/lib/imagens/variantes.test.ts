import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import loaderDeImagem from "./loaderDeImagem";
import {
  LARGURAS_VARIANTES,
  caminhoDaVariante,
  largurasParaGerar,
  marcarVariantes,
  resolverVariante,
  srcDaMidia,
} from "./variantes";

const URL = "https://x.supabase.co/storage/v1/object/public/empreendimentos/e1/foto-abc.jpg";

describe("variantes responsivas", () => {
  it("a variante mora ao lado do original, em WebP, com a largura no nome", () => {
    expect(caminhoDaVariante("e1/foto-abc.jpg", 480)).toBe("e1/foto-abc.w480.webp");
    expect(caminhoDaVariante(URL, 960)).toBe(URL.replace(".jpg", ".w960.webp"));
    expect(caminhoDaVariante("e1/planta-x.WEBP", 480)).toBe("e1/planta-x.w480.webp");
  });

  it("só gera largura MENOR que a do original — nunca amplia", () => {
    expect(largurasParaGerar(1600)).toEqual([480, 960, 1440]);
    expect(largurasParaGerar(1440)).toEqual([480, 960]);
    expect(largurasParaGerar(1000)).toEqual([480, 960]);
    expect(largurasParaGerar(480)).toEqual([]);
    expect(largurasParaGerar(320)).toEqual([]);
    expect(largurasParaGerar(null)).toEqual([]);
  });

  it("a marca só entra quando há variante; a URL crua fica intacta", () => {
    expect(marcarVariantes(URL, null)).toBe(URL);
    expect(marcarVariantes(URL, [])).toBe(URL);
    expect(marcarVariantes(URL, [960, 480])).toBe(`${URL}#v=480,960`);
    expect(srcDaMidia({ url: URL })).toBe(URL);
    expect(srcDaMidia({ url: URL, variantes: [480] })).toBe(`${URL}#v=480`);
  });

  it("o loader escolhe a MENOR variante que atende à largura pedida", () => {
    const src = `${URL}#v=480,960,1440`;
    expect(resolverVariante(src, 320)).toBe(URL.replace(".jpg", ".w480.webp"));
    expect(resolverVariante(src, 480)).toBe(URL.replace(".jpg", ".w480.webp"));
    expect(resolverVariante(src, 481)).toBe(URL.replace(".jpg", ".w960.webp"));
    expect(resolverVariante(src, 1440)).toBe(URL.replace(".jpg", ".w1440.webp"));
  });

  it("pedido maior que toda variante devolve o ORIGINAL — ampliar variante perderia nitidez", () => {
    expect(resolverVariante(`${URL}#v=480,960`, 1200)).toBe(URL);
    expect(resolverVariante(`${URL}#v=480,960`, 1920)).toBe(URL);
  });

  it("URL sem marca volta como veio — logo, YouTube, corretor, data URL", () => {
    expect(resolverVariante(URL, 480)).toBe(URL);
    expect(resolverVariante("/marca/logo.png", 480)).toBe("/marca/logo.png");
    expect(resolverVariante("data:image/png;base64,AAA", 480)).toBe("data:image/png;base64,AAA");
    expect(resolverVariante("https://i.ytimg.com/vi/x/hqdefault.jpg", 768)).toBe("https://i.ytimg.com/vi/x/hqdefault.jpg");
  });

  it("marca malformada não quebra a foto: cai no original", () => {
    expect(resolverVariante(`${URL}#v=`, 480)).toBe(URL);
    expect(resolverVariante(`${URL}#v=abc`, 480)).toBe(URL);
  });

  it("o loader do next/image é a mesma função", () => {
    expect(loaderDeImagem({ src: `${URL}#v=480,960`, width: 640 })).toBe(URL.replace(".jpg", ".w960.webp"));
    expect(loaderDeImagem({ src: URL, width: 640 })).toBe(URL);
  });

  it("next.config aponta para este loader e não força unoptimized", () => {
    const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
    const bloco = config.slice(config.indexOf("images: {"), config.indexOf("remotePatterns"));
    expect(bloco).toMatch(/loader:\s*"custom"/);
    expect(bloco).toMatch(/loaderFile:\s*"\.\/src\/lib\/imagens\/loaderDeImagem\.ts"/);
    expect(bloco).not.toMatch(/\n\s*unoptimized:\s*true,/);
    // Os candidatos do srcset casam com as variantes que existem no Storage,
    // mais 1920 para o original servir a tela grande.
    expect(bloco).toContain(`deviceSizes: [${LARGURAS_VARIANTES.join(", ")}, 1920]`);
  });
});
