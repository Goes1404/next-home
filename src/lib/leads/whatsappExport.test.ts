import { describe, expect, it } from "vitest";
import { ehExportDeConversa, parsearConversaWhatsapp } from "./whatsappExport";

/*
 * Os fixtures aqui são cópias do que os dois aparelhos realmente escrevem,
 * marcas invisíveis incluídas (U+200E no começo da linha do iPhone). Um
 * fixture "limpo", digitado olhando para o texto na tela, testa um formato
 * que não existe — foi assim que a regex de repetição desta base passou meses
 * cega.
 */

const ANDROID = [
  "12/09/2026 09:41 - As mensagens e as chamadas são protegidas com a criptografia de ponta a ponta.",
  "12/09/2026 09:41 - +55 11 99123-4567: Boa tarde! Vi o anúncio do Vitra Alphaville",
  "12/09/2026 09:42 - +55 11 99123-4567: Ainda tem unidade de 2 dormitórios?",
  "12/09/2026 09:45 - Bruna Next Home: Oi! Tenho sim, vou te mandar a planta",
  "12/09/2026 09:45 - Bruna Next Home: <Arquivo de mídia oculto>",
  "12/09/2026 09:50 - +55 11 99123-4567: Perfeito",
].join("\n");

const IPHONE = [
  "‎[12/09/2026 09:41:02] ‎Ana Prado: Oi Bruna, tudo bem?",
  "‎[12/09/2026 09:41:30] Ana Prado: Queria ver o decorado no sábado",
  "de manhã, se puder",
  "‎[12/09/2026 09:42:00] Bruna: Claro! Te confirmo já já",
  "‎[12/09/2026 09:43:00] ‎Ana Prado: ‎imagem ocultada",
].join("\n");

describe("Export do WhatsApp — reconhecimento", () => {
  it("reconhece os dois formatos de aparelho", () => {
    expect(ehExportDeConversa(ANDROID)).toBe(true);
    expect(ehExportDeConversa(IPHONE)).toBe(true);
  });

  it("não confunde uma lista de contatos com uma conversa", () => {
    const csv = "nome;telefone\nAna Prado;11991234567\nBruno Lima;11987654321";
    expect(ehExportDeConversa(csv)).toBe(false);
  });
});

describe("Export do WhatsApp — participantes", () => {
  it("separa os autores e descarta o aviso de criptografia", () => {
    const conversa = parsearConversaWhatsapp(ANDROID, "Conversa do WhatsApp com +55 11 99123-4567.txt");

    expect(conversa.autores.map((a) => a.rotulo)).toEqual([
      "+55 11 99123-4567",
      "Bruna Next Home",
    ]);
    expect(conversa.totalDeMensagens).toBe(5);
    expect(conversa.ehGrupo).toBe(false);
  });

  it("usa o nome do arquivo para saber quem é o dono do aparelho", () => {
    const conversa = parsearConversaWhatsapp(ANDROID, "Conversa do WhatsApp com +55 11 99123-4567.txt");
    expect(conversa.donoProvavel).toBe("Bruna Next Home");
  });

  it("não chuta o dono quando é grupo", () => {
    const grupo = [
      "12/09/2026 09:41 - +55 11 99123-4567: oi",
      "12/09/2026 09:42 - +55 11 98888-7777: oi gente",
      "12/09/2026 09:43 - Bruna: bom dia!",
    ].join("\n");

    const conversa = parsearConversaWhatsapp(grupo, "Conversa do WhatsApp com Clientes Alphaville.txt");

    expect(conversa.ehGrupo).toBe(true);
    expect(conversa.donoProvavel).toBeNull();
  });

  it("junta a continuação de uma mensagem de várias linhas", () => {
    const conversa = parsearConversaWhatsapp(IPHONE, "Conversa do WhatsApp com Ana Prado.txt");
    const ana = conversa.autores.find((a) => a.rotulo === "Ana Prado")!;

    expect(ana.mensagens[1]).toBe("Queria ver o decorado no sábado de manhã, se puder");
  });

  it("conta a mídia como mensagem mas não a guarda como fala", () => {
    const conversa = parsearConversaWhatsapp(IPHONE, "Conversa do WhatsApp com Ana Prado.txt");
    const ana = conversa.autores.find((a) => a.rotulo === "Ana Prado")!;

    // Três mensagens dela, mas só duas com texto — "imagem ocultada" não
    // descreve intenção nenhuma e ocuparia o campo da ficha.
    expect(ana.mensagens).toHaveLength(2);
    expect(ana.mensagens.join(" ")).not.toContain("imagem ocultada");
  });

  it("não toma aviso de sistema com dois-pontos por autor", () => {
    const texto = [
      "12/09/2026 09:41 - Bruna mudou o assunto do grupo para “Plantão: Vitra”",
      "12/09/2026 09:42 - Ana Prado: oi",
      "12/09/2026 09:43 - Ana Prado: tudo bem?",
    ].join("\n");

    const conversa = parsearConversaWhatsapp(texto);
    expect(conversa.autores.map((a) => a.rotulo)).toEqual(["Ana Prado"]);
  });
});
