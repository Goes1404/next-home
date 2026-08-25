import { describe, expect, it } from "vitest";
import { manterIdentidadeHonesta } from "./identidadeHonesta";

/*
 * Os casos "mente" vêm da transcrição real da fábrica (25/08/2026, persona
 * pergunta-se-e-robo-no-meio): a Sofia respondeu "Sou humana" duas vezes a
 * uma pergunta direta, e se apresentou com o CRECI do corretor.
 */

describe("frases que mentem sobre a natureza da assistente", () => {
  const mentiras = [
    "Sou humana, Sofia, consultora de imóveis de alto padrão em Alphaville.",
    "Sim, sou humana e estou aqui para ajudar você.",
    "Não sou um robô, pode ficar tranquilo!",
    "Não sou uma inteligência artificial.",
    "Fica tranquilo, sou de carne e osso.",
    "Eu sou uma pessoa de verdade, prometo.",
  ];

  for (const frase of mentiras) {
    it(`corrige: "${frase.slice(0, 40)}..."`, () => {
      const r = manterIdentidadeHonesta(frase, "Sofia");
      expect(r.corrigiu).toBe(true);
      expect(r.texto.toLowerCase()).not.toMatch(/sou human|não sou um robô|carne e osso|pessoa de verdade|não sou uma intelig/);
      expect(r.texto).toContain("assistente digital");
    });
  }

  it("a assistente não veste o CRECI do corretor", () => {
    const r = manterIdentidadeHonesta(
      "Sou Sofia, consultora de imóveis de alto padrão, CRECI 254161, aqui para ajudar.",
      "Sofia",
    );
    expect(r.corrigiu).toBe(true);
    expect(r.texto).not.toContain("CRECI");
  });

  it("duas mentiras na mesma resposta viram UMA apresentação honesta", () => {
    const r = manterIdentidadeHonesta("Sou humana. Não sou um robô, confia.", "Sofia");
    expect(r.corrigiu).toBe(true);
    expect(r.texto.match(/assistente digital/g)).toHaveLength(1);
  });

  it("as frases inocentes em volta sobrevivem intactas", () => {
    const r = manterIdentidadeHonesta(
      "O Terra Alta tem 3 dormitórios. Sou humana, claro! Quer agendar uma visita?",
      "Sofia",
    );
    expect(r.texto).toContain("O Terra Alta tem 3 dormitórios.");
    expect(r.texto).toContain("Quer agendar uma visita?");
  });
});

describe("o que NÃO é mentira e não pode ser tocado", () => {
  const inocentes = [
    // O caso simétrico: admitir ser IA é o comportamento certo.
    "Sou uma assistente digital da equipe, e sigo com você por aqui!",
    "Sou a Sofia, da equipe da Bruna. Como posso ajudar?",
    // "humano" fora da primeira pessoa.
    "O atendimento humano da Bruna continua disponível quando você quiser.",
    // CRECI apresentando o CORRETOR, não a si mesma.
    "A Bruna Cristal (CRECI 254161) vai conduzir sua visita pessoalmente.",
    // Conversa normal.
    "O More Aldeia tem 2 dormitórios, 1 suíte e 64m². Quer ver a planta?",
  ];

  for (const frase of inocentes) {
    it(`preserva: "${frase.slice(0, 40)}..."`, () => {
      const r = manterIdentidadeHonesta(frase, "Sofia");
      expect(r.corrigiu).toBe(false);
      expect(r.texto).toBe(frase);
    });
  }

  it("texto vazio passa reto", () => {
    expect(manterIdentidadeHonesta("", "Sofia")).toEqual({ texto: "", corrigiu: false });
  });
});
