import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * Guardas de código-fonte do texto da lista (08/10/2026). As regressões aqui
 * seriam caladas: a lista continuaria saindo, só que com texto repetido, que
 * é o que o WhatsApp restringe. Foi assim na semana da conta da Bruna: 65 das
 * 114 mensagens idênticas, porque o teste A/B desligava a reescrita e nada
 * conferia o resultado.
 */
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const disparador = semComentarios(readFileSync("src/lib/whatsapp/campaignDispatcher.ts", "utf8"));
const acoes = semComentarios(readFileSync("src/app/corretor/(painel)/campanhas/acoes.ts", "utf8"));
const vencedora = semComentarios(readFileSync("src/lib/whatsapp/vencedoraAB.ts", "utf8"));

describe("o texto da lista é conferido antes de sair", () => {
  it("o disparador confere o texto antes de reservar a cota", () => {
    const conferencia = disparador.indexOf("await variarSemRepetir(");
    expect(conferencia).toBeGreaterThan(0);
    expect(conferencia).toBeLessThan(disparador.indexOf("reservarCotaCampanha(instancia.id"));
  });

  it("o teste A/B não desliga mais a reescrita", () => {
    expect(disparador).not.toContain("variarMensagemComIA");
    expect(disparador).not.toMatch(/!item\.variante/);
    expect(disparador).toContain("manterAbertura: Boolean(item.variante)");
  });

  it("texto que não passou não segue para o envio", () => {
    const ini = disparador.indexOf("if (!variacao.ok) {");
    expect(ini).toBeGreaterThan(0);
    const bloco = disparador.slice(ini, disparador.indexOf("texto = variacao.texto;", ini));
    // O bloco termina saindo do laço: nada depois dele roda para este item.
    expect(bloco.trimEnd()).toMatch(/break;\s*\}$/);
    expect(bloco).not.toContain("enviarMensagemWhatsapp");
    expect(bloco).not.toContain("reservarCotaCampanha");
  });

  it("a saudação é ajustada à hora do envio, logo antes de mandar", () => {
    const ajuste = disparador.indexOf("ajustarSaudacaoAoHorario(texto");
    expect(ajuste).toBeGreaterThan(0);
    expect(ajuste).toBeLessThan(disparador.indexOf("await enviarMensagemWhatsapp("));
  });

  it("a fila reescrita pela vencedora do A/B volta a ser conferida", () => {
    expect(vencedora).toContain("semelhanca_max: null");
  });

  it("a prévia da tela usa o mesmo caminho do envio", () => {
    const ini = acoes.indexOf("export async function gerarPreviewCampanha");
    const corpo = acoes.slice(ini, acoes.indexOf("\nexport ", ini + 10));
    expect(corpo).toContain("textosRecentesDoNumero(");
    // As duas versões passam pela conferência, e é o resultado dela que volta.
    expect(corpo).toContain("const exemplosA = await exemplosDaLista(");
    expect(corpo).toContain("const b = await exemplosDaLista(");
    expect(corpo).toContain("mensagens: exemplosA.textos");
    expect(corpo).toContain("exemploB = b.textos[0]");
  });
});
