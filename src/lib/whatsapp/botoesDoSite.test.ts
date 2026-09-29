import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { mensagemDeAnuncio, mensagemDoSite, reconhecerConviteDeEntrada } from "./porteiro";

/**
 * Desde a 0111, número sem lead só entra no CRM se a primeira fala for
 * reconhecida como convite nosso. Os botões do site mandavam textos
 * próprios ("Olá, Bruna! Vim pelo site…") que o porteiro não reconhece: o
 * visitante novo escrevia e o webhook o ignorava, calado.
 *
 * A guarda lê o código: nenhum arquivo do site público pode voltar a montar
 * a mensagem à mão. Ela tem de sair de `mensagemDoSite`/`mensagemDeAnuncio`.
 */
const RAIZES = ["src/app/(institucional)", "src/app/(vitrine)", "src/components", "src/lib/site.ts"];

function arquivos(caminho: string): string[] {
  if (statSync(caminho).isFile()) return [caminho];
  return readdirSync(caminho).flatMap((nome) => arquivos(join(caminho, nome)));
}

describe("botões de WhatsApp do site", () => {
  it("o porteiro reconhece as duas mensagens do site", () => {
    expect(reconhecerConviteDeEntrada({ texto: mensagemDoSite(), palavrasEntradaCliente: null })?.via).toBe(
      "mensagem_do_site",
    );
    const doImovel = reconhecerConviteDeEntrada({
      texto: mensagemDeAnuncio("Eternity Alphaville", "visita"),
      palavrasEntradaCliente: null,
    });
    expect(doImovel?.via).toBe("mensagem_do_anuncio");
    expect(doImovel?.imovel?.toLowerCase()).toBe("eternity alphaville");
  });

  it("nenhum arquivo do site público monta 'Vim pelo site' à mão", () => {
    const culpados = RAIZES.flatMap(arquivos)
      .filter((f) => /\.tsx?$/.test(f) && !f.endsWith(".test.ts"))
      .filter((f) => /Vim pelo site/i.test(readFileSync(f, "utf8")));
    expect(culpados).toEqual([]);
  });
});
