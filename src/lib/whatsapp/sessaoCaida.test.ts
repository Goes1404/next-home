import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ehFalhaDeSessao, MOTIVO_SESSAO_CAIU } from "./sessaoCaida";
import { avaliarSaudeDaConexao, type FotoDaConexao } from "./saudeDaConexao";
import { classificarFalhaDeEnvio, falhaContaParaDisjuntor } from "./listaDeTransmissao";

/*
 * A sessão do WhatsApp da Márcia caiu às 9h de 08/10/2026: os envios voltavam
 * com "Connection Closed", o disjuntor abriu por 12h e o painel dizia
 * "conectado" e "volta sozinho às 21h". Não voltaria sem reconectar.
 */

/** O detalhe como o provedor devolve (forma de `enviarMensagemWhatsapp`). */
const DETALHE_REAL =
  'HTTP 500: {"status":500,"error":"Internal Server Error","response":{"message":["Error: Connection Closed"]}}';

const AGORA = new Date("2026-10-08T15:00:00Z");

const CONECTADO_E_PAUSADO: FotoDaConexao = {
  statusConexao: "conectado",
  conectadoEm: new Date("2026-09-20T12:00:00Z"),
  desconectadoEm: null,
  bloqueadoAte: new Date("2026-10-09T00:00:00Z"),
  enviosCampanhaData: null,
  enviosCampanhaContador: 0,
  pendentes: 32,
};

describe("falha de sessão", () => {
  it("reconhece o erro que o provedor devolveu no número da Márcia", () => {
    expect(ehFalhaDeSessao(DETALHE_REAL)).toBe(true);
    expect(ehFalhaDeSessao("Error: Connection Lost")).toBe(true);
  });

  it("não confunde com número sem WhatsApp, tempo esgotado ou recusa comum", () => {
    expect(ehFalhaDeSessao('HTTP 400: {"exists":false,"jid":"55119..."}')).toBe(false);
    expect(ehFalhaDeSessao("This operation was aborted")).toBe(false);
    expect(ehFalhaDeSessao("HTTP 500: Internal Server Error")).toBe(false);
    expect(ehFalhaDeSessao(undefined)).toBe(false);
  });

  it("para o resto da fila, continua sendo falha do provedor, que conta para o disjuntor", () => {
    const classe = classificarFalhaDeEnvio({ motivo: "erro_provedor", detalhe: DETALHE_REAL });
    expect(classe).toBe("provedor");
    expect(falhaContaParaDisjuntor(classe)).toBe(true);
  });
});

describe("a faixa do painel com a sessão caída", () => {
  it("pede para reconectar em vez de dizer que volta sozinho", () => {
    const aviso = avaliarSaudeDaConexao({ ...CONECTADO_E_PAUSADO, falhasDeSessao: 4 }, AGORA);
    expect(aviso?.tipo).toBe("sessao_caiu");
    expect(aviso?.gravidade).toBe("perigo");
    expect(aviso?.acao).toBe("Reconectar meu número");
    expect(aviso?.detalhe).toMatch(/Desconectar e conecte o número de novo/);
    expect(aviso?.detalhe).not.toMatch(/sozinho às/);
    expect(aviso?.detalhe).toMatch(/32 mensagens estão paradas/);
  });

  it("pausa sem falha de sessão continua sendo a pausa que volta sozinha", () => {
    const aviso = avaliarSaudeDaConexao(CONECTADO_E_PAUSADO, AGORA);
    expect(aviso?.tipo).toBe("envios_pausados");
    expect(aviso?.detalhe).toMatch(/Volta sozinho/);
  });

  it("número que o provedor já deu como caído continua com o aviso de queda", () => {
    const aviso = avaliarSaudeDaConexao(
      { ...CONECTADO_E_PAUSADO, statusConexao: "desconectado", desconectadoEm: AGORA, falhasDeSessao: 2 },
      AGORA,
    );
    expect(aviso?.tipo).toBe("caiu");
  });
});

/*
 * Guardas de código-fonte: as regressões aqui seriam caladas. A lista
 * continuaria parada, o painel diria "volta sozinho" e ninguém reconectaria.
 */
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const disparador = semComentarios(readFileSync("src/lib/whatsapp/campaignDispatcher.ts", "utf8"));
const repositorio = semComentarios(readFileSync("src/lib/whatsapp/repositorio.ts", "utf8"));
const avisoDeQueda = semComentarios(readFileSync("src/lib/whatsapp/avisoDeQueda.ts", "utf8"));
const acoesDaLista = semComentarios(readFileSync("src/app/corretor/(painel)/campanhas/acoes.ts", "utf8"));

function corpoDe(codigo: string, assinatura: string): string {
  const ini = codigo.indexOf(assinatura);
  expect(ini, `não achei ${assinatura}`).toBeGreaterThan(0);
  const fim = codigo.indexOf("\nexport ", ini + assinatura.length);
  return codigo.slice(ini, fim < 0 ? undefined : fim);
}

describe("o disparador com a sessão caída", () => {
  const ini = disparador.indexOf("if (!envio.enviado && ehFalhaDeSessao(envio.detalhe)) {");
  const bloco = disparador.slice(ini, disparador.indexOf("break;", ini) + "break;".length);

  it("trata a sessão antes de classificar a falha como as outras", () => {
    expect(ini).toBeGreaterThan(0);
    expect(ini).toBeLessThan(disparador.indexOf("const classe = envio.enviado ? null : classificarFalhaDeEnvio(envio);"));
  });

  it("devolve a cota, conta para o disjuntor e marca a fila sem gastar tentativa", () => {
    expect(bloco).toContain("await devolverCotaCampanha(instancia.id);");
    expect(bloco).toContain("await registrarResultadoEnvio(instancia.id, false);");
    expect(bloco).toContain("erro_motivo: MOTIVO_SESSAO_CAIU");
    expect(bloco).not.toMatch(/tentativas/);
  });

  it("encerra a vez em vez de mandar o próximo item para a mesma sessão caída", () => {
    expect(bloco.trimEnd().endsWith("break;")).toBe(true);
    expect(bloco).not.toContain("enviarMensagemWhatsapp");
  });

  it("nem na última vaga a corrente continua para a mesma sessão caída", () => {
    expect(disparador).toContain('if (parcial.processados >= ctx.vagas && parcial.motivo !== "nao_conectado") {');
  });

  it("o primeiro envio que dá certo tira a marca", () => {
    const sucesso = disparador.indexOf("parcial.enviados++;");
    const depois = disparador.slice(sucesso, sucesso + 600);
    expect(depois).toMatch(/liberarFilaDaSessao\(\{[\s\S]*levantarPausa: false/);
  });
});

describe("a reconexão libera a fila e a pausa", () => {
  it("pelo evento do provedor e pela sincronização do painel", () => {
    expect(corpoDe(repositorio, "export async function registrarEventoConexao(")).toMatch(
      /if \(conectado\) await liberarFilaDaSessao\(\{ instanciaId: instancia\.id, levantarPausa: true \}\)/,
    );
    expect(corpoDe(repositorio, "export async function sincronizarConexaoInstancia(")).toMatch(
      /await liberarFilaDaSessao\(\{ instanciaId: params\.instanciaId, levantarPausa: true \}\)/,
    );
  });

  it("só levanta a pausa quando achou marca de sessão", () => {
    const corpo = corpoDe(repositorio, "export async function liberarFilaDaSessao(");
    expect(corpo).toMatch(/\.eq\("erro_motivo", MOTIVO_SESSAO_CAIU\)/);
    expect(corpo).toMatch(/if \(quantos > 0 && params\.levantarPausa\)/);
  });
});

describe("as telas leem a mesma marca", () => {
  it("a faixa conta as falhas de sessão junto com a fila", () => {
    expect(avisoDeQueda).toMatch(/\.eq\("erro_motivo", MOTIVO_SESSAO_CAIU\)/);
    expect(avisoDeQueda).not.toContain("contarPendentes(");
  });

  it("a tela de listas diz para reconectar antes de falar da pausa", () => {
    const sessao = acoesDaLista.indexOf("} else if (esperandoSessao > 0) {");
    const pausa = acoesDaLista.indexOf("} else if (bloqueado) {");
    expect(sessao).toBeGreaterThan(0);
    expect(sessao).toBeLessThan(pausa);
    expect(acoesDaLista).toMatch(/\[MOTIVO_TEXTO_SEM_IA, MOTIVO_TEXTO_PARECIDO, MOTIVO_SESSAO_CAIU\]/);
  });

  it("o motivo é uma frase só, igual nos três lugares", () => {
    expect(MOTIVO_SESSAO_CAIU).toMatch(/reconectar/);
  });
});
