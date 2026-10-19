import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * Guardas de código-fonte da proteção da lista (07/10/2026), depois da
 * restrição da conta da Bruna. As duas regressões seriam caladas: a lista
 * continuaria enviando, só sem a proteção.
 */
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("proteção da lista de transmissão", () => {
  it("a criação confere os números antes de montar a fila", () => {
    const fonte = semComentarios(readFileSync("src/app/corretor/(painel)/campanhas/acoes.ts", "utf8"));
    const inicio = fonte.indexOf("export async function criarCampanha");
    const corpo = fonte.slice(inicio, fonte.indexOf("\nexport ", inicio + 10));
    const conferir = corpo.indexOf("conferirNumerosNoWhatsapp(");
    expect(conferir).toBeGreaterThan(0);
    expect(conferir).toBeLessThan(corpo.indexOf("montarFilaCampanha("));
  });

  it("o disparador decide a pausa automática antes de reservar a cota", () => {
    const fonte = semComentarios(readFileSync("src/lib/whatsapp/campaignDispatcher.ts", "utf8"));
    const pausa = fonte.indexOf("motivoDePausaAutomatica(");
    expect(pausa).toBeGreaterThan(0);
    expect(pausa).toBeLessThan(fonte.indexOf("reservarCotaCampanha(instancia.id"));
  });
});
