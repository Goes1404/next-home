/**
 * O atalho da tela inicial (09/10/2026).
 *
 * O print do celular mostrava o triângulo do Next borrado num quadrado branco:
 * o atalho fora criado quando o favicon ainda era o padrão, e atalho não
 * atualiza o ícone sozinho. Estas guardas cuidam do que vale para o próximo
 * atalho: ícone grande, versão mascarável dentro da zona segura, e o
 * manifesto sem as duas opções que mudariam o comportamento do site.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import manifest from "./manifest";

const raiz = process.cwd();

/** Onde mora o arquivo que o endereço do ícone serve. */
function arquivoDo(src: string): string {
  // `/icon.png` é servido pelo Next a partir de src/app; o resto vem de public/.
  const doApp = join(raiz, "src/app", src);
  return existsSync(doApp) ? doApp : join(raiz, "public", src);
}

const md5 = (caminho: string) => createHash("md5").update(readFileSync(caminho)).digest("hex");

describe("manifesto do site", () => {
  const m = manifest();

  it("o atalho abre no navegador, sem convite para instalar", () => {
    // "standalone" faz o Chrome oferecer "Instalar app" a todo visitante e
    // tira a barra de endereço do atalho.
    expect(m.display).toBe("browser");
  });

  it("sem start_url: o atalho abre a página em que a pessoa estava", () => {
    // Com start_url "/", o corretor que põe o painel na tela inicial ganharia
    // um atalho para a home do site.
    expect(m).not.toHaveProperty("start_url");
  });

  it("cada ícone existe e tem o tamanho declarado", async () => {
    expect(m.icons?.length).toBeGreaterThan(0);
    for (const icone of m.icons ?? []) {
      const caminho = arquivoDo(icone.src);
      expect(existsSync(caminho), icone.src).toBe(true);
      const { width, height } = await sharp(caminho).metadata();
      expect(`${width}x${height}`, icone.src).toBe(icone.sizes);
    }
  });

  it("tem ícone de 512 px e versão mascarável", () => {
    const icones = m.icons ?? [];
    expect(icones.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(true);
    expect(icones.some((i) => i.sizes === "512x512" && i.purpose === "maskable")).toBe(true);
  });

  it("a versão mascarável é branca até a borda e o símbolo cabe no círculo de 80%", async () => {
    const mascaravel = (m.icons ?? []).find((i) => i.purpose === "maskable");
    expect(mascaravel).toBeDefined();
    const { data, info } = await sharp(arquivoDo(mascaravel!.src)).raw().toBuffer({ resolveWithObject: true });
    const lado = info.width;
    const centro = (lado - 1) / 2;
    const raio = lado * 0.4;
    let fora = 0;
    let transparente = 0;
    for (let y = 0; y < lado; y++) {
      for (let x = 0; x < lado; x++) {
        const o = (y * lado + x) * info.channels;
        if (info.channels === 4 && data[o + 3] < 255) transparente++;
        const branco = data[o] > 240 && data[o + 1] > 240 && data[o + 2] > 240;
        if (!branco && Math.hypot(x - centro, y - centro) > raio) fora++;
      }
    }
    // O celular recorta o ícone no formato dele: o que fica transparente vira
    // preto, e o que passa do círculo pode ser cortado.
    expect(transparente).toBe(0);
    expect(fora).toBe(0);
  });
});

describe("atalho do iPhone", () => {
  it("o layout desliga o capable que o Next liga sozinho", () => {
    // Com `appleWebApp: { title }` o Next escreve `mobile-web-app-capable`,
    // e o atalho passaria a abrir sem a barra do navegador.
    const layout = readFileSync(join(raiz, "src/app/layout.tsx"), "utf8");
    const linha = layout.split("\n").find((l) => /^\s*appleWebApp:/.test(l)) ?? "";
    expect(linha).toMatch(/capable:\s*false/);
  });
});

describe("ícone do iPhone no caminho padrão", () => {
  it("apple-touch-icon(-precomposed).png são o mesmo arquivo do apple-icon.png", () => {
    const original = md5(join(raiz, "src/app/apple-icon.png"));
    expect(md5(join(raiz, "public/apple-touch-icon.png"))).toBe(original);
    expect(md5(join(raiz, "public/apple-touch-icon-precomposed.png"))).toBe(original);
  });
});
