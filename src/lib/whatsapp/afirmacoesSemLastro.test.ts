import { describe, expect, it } from "vitest";
import { removerAnuncioDeAnexo, removerConfirmacaoSemAceite, removerPromessaDeValorizacao } from "./afirmacoesSemLastro";

// Frases reais do eval de conversa de 28/09/2026.
describe("visita confirmada que ninguém confirmou", () => {
  const texto =
    "O Bosque AlphaGran tem unidades de 1 dormitório com metragem a partir de 44m².\nA visita está confirmada para quinta-feira às 15h no stand. Qualquer dúvida até lá, me chama.";

  it("sem o campo confirmar, a frase sai", () => {
    const r = removerConfirmacaoSemAceite(texto, false);
    expect(r.cortou).toBe(true);
    expect(r.texto).not.toMatch(/confirmada/);
    expect(r.texto).toMatch(/44m²/);
  });

  it("com o cliente tendo aceitado, fica", () => {
    expect(removerConfirmacaoSemAceite(texto, true).texto).toBe(texto);
  });

  it("\"está reservado para você\" também é confirmação", () => {
    const r = removerConfirmacaoSemAceite(
      "Sábado às 10h está reservado para você conhecer o Viva.\nTe mandei as fotos.",
      false,
    );
    expect(r.texto.trim()).toBe("Te mandei as fotos.");
  });

  it("oferecer horário não é confirmar", () => {
    const oferta = "Posso te receber terça às 14h ou quinta às 16h?";
    expect(removerConfirmacaoSemAceite(oferta, false).texto).toBe(oferta);
  });

  it("nunca deixa a resposta vazia", () => {
    const so = "A visita está confirmada para sábado às 11h.";
    expect(removerConfirmacaoSemAceite(so, false).texto).toBe(so);
  });
});

describe("promessa de valorização", () => {
  it("sai a frase da valorização, fica o resto", () => {
    const r = removerPromessaDeValorizacao(
      "O Viva RSF Vila do Conde tem unidades a partir de R$ 457.000.\nFica em Vila do Conde, Barueri, uma região com ótima valorização.",
    );
    expect(r.cortou).toBe(true);
    expect(r.texto.trim()).toBe("O Viva RSF Vila do Conde tem unidades a partir de R$ 457.000.");
  });

  it("localização sem promessa fica", () => {
    const t = "Fica em Vila do Conde, pertinho da estação de Barueri.";
    expect(removerPromessaDeValorizacao(t).texto).toBe(t);
  });
});

it("corta também quando os balões vêm separados por --- e sem ponto final", () => {
  const r = removerConfirmacaoSemAceite(
    "Te mandei as fotos das unidades de 3 dormitórios --- A visita está confirmada para o dia e horário combinados --- Qualquer dúvida até lá, me chama",
    false,
  );
  expect(r.cortou).toBe(true);
  expect(r.texto).not.toMatch(/confirmada/);
});

it("sem anexo, some a frase que anuncia foto", () => {
  const r = removerAnuncioDeAnexo(
    "O valor exato quem fecha é o corretor.\nTe mandei as fotos dos imóveis prontos em Barueri.\nQual é a renda média da família por mês?",
  );
  expect(r.cortou).toBe(true);
  expect(r.texto).not.toMatch(/fotos/);
  expect(r.texto).toMatch(/renda/);
});
