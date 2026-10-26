import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { diaEmSaoPaulo, ehHoraDaLista, textoDaListaSemRetorno } from "./leadsSemRetorno";

describe("lista diária de leads sem retorno", () => {
  it("só na hora das 18h de São Paulo", () => {
    expect(ehHoraDaLista(new Date("2026-10-26T20:59:00Z"))).toBe(false); // 17:59
    expect(ehHoraDaLista(new Date("2026-10-26T21:00:00Z"))).toBe(true); // 18:00
    expect(ehHoraDaLista(new Date("2026-10-26T21:59:00Z"))).toBe(true); // 18:59
    expect(ehHoraDaLista(new Date("2026-10-26T22:00:00Z"))).toBe(false); // 19:00
  });

  it("o dia da trava é o de São Paulo, não o de UTC", () => {
    expect(diaEmSaoPaulo(new Date("2026-10-27T01:30:00Z"))).toBe("2026-10-26");
  });

  it("agrupa por corretor em ordem alfabética, com tempo e tentativas", () => {
    const agora = new Date("2026-10-26T21:00:00Z");
    const texto = textoDaListaSemRetorno(
      [
        { corretor: "Moisés", cliente: "Paulo", avisadoEm: new Date("2026-10-24T21:00:00Z"), tentativas: 2 },
        { corretor: "Fernando", cliente: null, avisadoEm: new Date("2026-10-26T16:00:00Z"), tentativas: 0 },
        { corretor: "Fernando", cliente: "Ana", avisadoEm: new Date("2026-10-26T17:30:00Z"), tentativas: 1 },
      ],
      agora,
    );
    expect(texto?.split("\n")).toEqual([
      "📋 Leads sem retorno de ligação (hoje, 18h)",
      "",
      "*Fernando*",
      "• Cliente novo · há 5 h · nenhuma tentativa",
      "• Ana · há 3 h · 1 tentativa",
      "",
      "*Moisés*",
      "• Paulo · há 2 dias · 2 tentativas",
    ]);
  });

  it("lista vazia não é enviada", () => {
    expect(textoDaListaSemRetorno([], new Date())).toBeNull();
  });

  it("o cron chama a lista junto do aviso dos grupos", () => {
    const fonte = readFileSync(join(process.cwd(), "src", "app", "api", "cron", "followups", "route.ts"), "utf8");
    expect(fonte).toContain('import { enviarListasSemRetorno } from "@/lib/crm/leadsSemRetorno"');
    expect(fonte).toMatch(/enviarListasSemRetorno\(supabase\)/);
  });
});
