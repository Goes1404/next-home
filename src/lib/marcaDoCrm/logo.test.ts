import { describe, expect, it } from "vitest";
import { caminhoDaLogo, ehLogoDoGrupo, formatoDaLogo, problemaDaLogo, TETO_DA_LOGO_BYTES } from "./logo";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10];
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];
const SVG = Array.from(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
const GIF = Array.from(new TextEncoder().encode("GIF89a"));
const GRUPO = "22222222-2222-2222-2222-222222222222";

describe("formato da logo (pelos bytes)", () => {
  it("aceita PNG, JPEG e WebP", () => {
    expect(formatoDaLogo(new Uint8Array(PNG))).toEqual({ mime: "image/png", extensao: "png" });
    expect(formatoDaLogo(new Uint8Array(JPEG))).toEqual({ mime: "image/jpeg", extensao: "jpg" });
    expect(formatoDaLogo(new Uint8Array(WEBP))).toEqual({ mime: "image/webp", extensao: "webp" });
  });

  it("recusa SVG (risco de script), GIF e vazio, não importa o nome ou o tipo declarado", () => {
    expect(formatoDaLogo(new Uint8Array(SVG))).toBeNull();
    expect(formatoDaLogo(new Uint8Array(GIF))).toBeNull();
    expect(formatoDaLogo(new Uint8Array())).toBeNull();
    expect(problemaDaLogo(new Uint8Array(SVG))).toMatch(/SVG não é aceito/);
  });

  it("RIFF que não é WebP (WAV) não passa", () => {
    const wav = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45];
    expect(formatoDaLogo(new Uint8Array(wav))).toBeNull();
  });
});

describe("problema da logo", () => {
  it("passa uma imagem boa até 1 MB", () => {
    expect(problemaDaLogo(new Uint8Array(PNG))).toBeNull();
    const justa = new Uint8Array(TETO_DA_LOGO_BYTES);
    justa.set(PNG);
    expect(problemaDaLogo(justa)).toBeNull();
  });

  it("recusa mais de 1 MB e arquivo vazio", () => {
    const grande = new Uint8Array(TETO_DA_LOGO_BYTES + 1);
    grande.set(PNG);
    expect(problemaDaLogo(grande)).toMatch(/1 MB/);
    expect(problemaDaLogo(new Uint8Array())).toMatch(/vazio/);
  });
});

describe("onde a logo mora", () => {
  it("grupos/<grupo_id>/logo-<hash>.<ext> no bucket público", () => {
    expect(caminhoDaLogo(GRUPO, "0123456789abcdef", "png")).toBe(`grupos/${GRUPO}/logo-0123456789abcdef.png`);
  });

  it("só a logo do PRÓPRIO grupo conta como logo a apagar", () => {
    expect(ehLogoDoGrupo(GRUPO, `grupos/${GRUPO}/logo-0123456789abcdef.webp`)).toBe(true);
    expect(ehLogoDoGrupo(GRUPO, `grupos/outro/logo-0123456789abcdef.webp`)).toBe(false);
    expect(ehLogoDoGrupo(GRUPO, `grupos/${GRUPO}/capa.png`)).toBe(false);
    expect(ehLogoDoGrupo(GRUPO, `grupos/${GRUPO}/../x/logo-0123456789abcdef.png`)).toBe(false);
  });
});
