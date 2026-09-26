import { describe, expect, it } from "vitest";
import {
  diaEmSP,
  horaDeMandarResumo,
  linhaDeOntem,
  segundaEmSP,
  montarResumoDoDia,
  MAXIMO_POR_SECAO,
} from "./resumoDoDia";

describe("hora de mandar o resumo — fuso de São Paulo", () => {
  it("8h de SP é 11h UTC: manda", () => {
    // Segunda-feira: no fim de semana o resumo só sai para quem pediu (0121).
    expect(horaDeMandarResumo(new Date("2026-09-28T11:05:00Z"), null)).toBe(true);
  });

  it("7h de SP (10h UTC) ainda não", () => {
    expect(horaDeMandarResumo(new Date("2026-09-26T10:30:00Z"), null)).toBe(false);
  });

  it("depois do meio-dia não manda mais: é notícia velha", () => {
    expect(horaDeMandarResumo(new Date("2026-09-26T15:30:00Z"), null)).toBe(false);
  });

  it("já mandado hoje não manda de novo", () => {
    const agora = new Date("2026-09-28T11:05:00Z");
    expect(horaDeMandarResumo(agora, "2026-09-28")).toBe(false);
    expect(horaDeMandarResumo(agora, "2026-09-27")).toBe(true);
  });

  it("às 22h de SP o dia ainda é o de SP, não o de UTC", () => {
    expect(diaEmSP(new Date("2026-09-27T01:00:00Z"))).toBe("2026-09-26");
  });
});

describe("texto do resumo", () => {
  const vazio = { nomeCorretor: "Bruna Lima", visitas: [], esperando: [], novos: [], lembretes: [] };

  it("sem nada a dizer, não manda nada", () => {
    expect(montarResumoDoDia(vazio, "https://x")).toBeNull();
  });

  it("cumprimenta pelo primeiro nome e dá um link por item", () => {
    const texto = montarResumoDoDia(
      {
        ...vazio,
        visitas: [{ titulo: "10:00 Ana Prado", detalhe: "Vitra", link: "https://x/corretor/leads/1" }],
      },
      "https://x",
    )!;
    expect(texto).toMatch(/^Bom dia, Bruna!/);
    expect(texto).toContain("*Visitas de hoje (1)*");
    expect(texto).toContain("https://x/corretor/leads/1");
    expect(texto).not.toContain("Esperando sua resposta");
  });

  it("corta cada seção no teto e diz quantos sobraram", () => {
    const muitos = Array.from({ length: MAXIMO_POR_SECAO + 3 }, (_, i) => ({
      titulo: `Pessoa ${i}`,
      link: `https://x/${i}`,
    }));
    const texto = montarResumoDoDia({ ...vazio, novos: muitos }, "https://x")!;
    expect(texto).toContain(`*Leads novos (24h) (${MAXIMO_POR_SECAO + 3})*`);
    expect(texto).toContain("e mais 3");
    expect(texto).not.toContain(`Pessoa ${MAXIMO_POR_SECAO}`);
  });
});

describe("preferências, placar e visitas sem retorno", () => {
  // 26/09/2026 é sábado; 28/09 é segunda. 12:00Z = 9h em SP.
  const sabado9h = new Date("2026-09-26T12:00:00Z");
  const segunda9h = new Date("2026-09-28T12:00:00Z");

  it("respeita a hora escolhida e o fim de semana", () => {
    expect(horaDeMandarResumo(segunda9h, null, { hora: 10 })).toBe(false);
    expect(horaDeMandarResumo(segunda9h, null, { hora: 7 })).toBe(true);
    expect(horaDeMandarResumo(sabado9h, null)).toBe(false);
    expect(horaDeMandarResumo(sabado9h, null, { fimDeSemana: true })).toBe(true);
  });

  it("placar de ontem só aparece com número", () => {
    expect(linhaDeOntem({ clientesQueEscreveram: 0, visitasMarcadas: 0 })).toBeNull();
    expect(linhaDeOntem({ clientesQueEscreveram: 3, visitasMarcadas: 1 })).toBe(
      "Ontem: 3 clientes escreveram · 1 visita marcada",
    );
  });

  it("visita sem retorno entra como seção; placar sozinho não manda mensagem", () => {
    const vazio = { nomeCorretor: "Bruna", visitas: [], esperando: [], novos: [], lembretes: [] };
    expect(montarResumoDoDia({ ...vazio, ontem: { clientesQueEscreveram: 4, visitasMarcadas: 0 } }, "https://x")).toBeNull();
    const t = montarResumoDoDia(
      { ...vazio, semRetorno: [{ titulo: "Ana", link: "https://x/l" }], ontem: { clientesQueEscreveram: 2, visitasMarcadas: 0 } },
      "https://x",
    )!;
    expect(t).toMatch(/Visitas sem retorno do cliente \(1\)/);
    expect(t).toMatch(/Ontem: 2 clientes escreveram/);
  });
});

describe("imóvel novo e vale retomar", () => {
  it("segunda-feira em SP, não em UTC", () => {
    // Domingo 23h em SP = segunda 02h UTC.
    expect(segundaEmSP(new Date("2026-09-28T02:00:00Z"))).toBe(false);
    expect(segundaEmSP(new Date("2026-09-28T12:00:00Z"))).toBe(true);
  });

  it("as duas seções entram e contam como notícia", () => {
    const vazio = { nomeCorretor: "Bruna", visitas: [], esperando: [], novos: [], lembretes: [] };
    const t = montarResumoDoDia(
      {
        ...vazio,
        imoveisNovos: [{ titulo: "Vitra", detalhe: "4 leads combinam", link: "https://x/i" }],
        valeRetomar: [{ titulo: "Ana", link: "https://x/l" }],
      },
      "https://x",
    )!;
    expect(t).toMatch(/Imóvel novo que combina com sua carteira \(1\)/);
    expect(t).toMatch(/Vale retomar esta semana \(1\)/);
  });
});
