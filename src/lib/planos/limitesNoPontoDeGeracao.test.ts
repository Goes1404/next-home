import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/lib/grupos/codigoFonte";

/**
 * Guarda da limites do plano: o limite do plano é conferido ANTES de gastar dinheiro.
 *
 * Cada ponto de geração chama `conferirLimite` (de `usoDaIa`) e só depois a
 * chamada cara. Se alguém reordenar, ou criar um caminho novo e esquecer, a
 * regressão é calada: tudo segue funcionando e o custo é que sobe.
 */

const RAIZ = process.cwd();
const ler = (arquivo: string) => semComentarios(readFileSync(join(RAIZ, arquivo), "utf8"));

/** Cada ponto: o arquivo, o recurso e o que custa dinheiro/dispara o envio. */
const PONTOS: { arquivo: string; recurso: string; caro: string[] }[] = [
  { arquivo: "src/app/api/imagens/gerar/route.ts", recurso: "arte", caro: ["gerarImagem({"] },
  {
    arquivo: "src/app/corretor/(painel)/marketing/video/acoes.ts",
    recurso: "video",
    // A visão que classifica as fotos e a fila de render. Nas duas ações.
    caro: ["preparar(pedido)", "enfileirarVideo({"],
  },
  {
    arquivo: "src/app/corretor/(painel)/campanhas/acoes.ts",
    recurso: "lista",
    caro: ['total_leads: elegiveis.length', 'from("whatsapp_campanhas_fila").insert'],
  },
  { arquivo: "src/lib/whatsapp/listasVivas.ts", recurso: "lista", caro: ['from("whatsapp_campanhas_fila").insert'] },
];

describe("limites do plano no ponto de geração", () => {
  for (const ponto of PONTOS) {
    it(`${ponto.arquivo}: confere "${ponto.recurso}" antes de gastar`, () => {
      const codigo = ler(ponto.arquivo);
      const chamada = new RegExp(`conferirLimite\\([^)]*"${ponto.recurso}"`);
      const achada = codigo.search(chamada);
      expect(achada, "chamada a conferirLimite").toBeGreaterThan(-1);
      for (const caro of ponto.caro) {
        const primeiro = codigo.indexOf(caro);
        expect(primeiro, `existe ${caro}`).toBeGreaterThan(-1);
        expect(achada, `conferirLimite vem antes de ${caro}`).toBeLessThan(primeiro);
      }
    });
  }

  it("a criação do vídeo confere o limite também (a tela pode ter ficado aberta desde a prévia)", () => {
    const codigo = ler("src/app/corretor/(painel)/marketing/video/acoes.ts");
    expect(codigo.match(/conferirLimite\(/g)?.length).toBe(2);
    const criar = codigo.slice(codigo.indexOf("export async function criarVideo"));
    expect(criar.indexOf('conferirLimite(')).toBeGreaterThan(-1);
    expect(criar.indexOf("conferirLimite(")).toBeLessThan(criar.indexOf("enfileirarVideo({"));
  });
});
