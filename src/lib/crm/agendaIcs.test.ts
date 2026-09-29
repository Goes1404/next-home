import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dobrarLinha, ehToken, escaparTexto, montarIcs } from "./agendaIcs";

describe("feed .ics das visitas", () => {
  const ics = montarIcs(
    [
      {
        leadId: "l1",
        nome: "Ana; Prado, filha",
        telefone: "11999990000",
        inicio: "2026-09-28T13:00:00.000Z",
        imovel: "Vista Alta",
        endereco: "Rua A, 10, Alphaville",
        confirmada: true,
        linkFicha: "https://x.com/corretor/leads/l1",
      },
    ],
    { nomeCalendario: "Visitas", dominio: "x.com", agora: new Date("2026-09-26T00:00:00Z") },
  );

  it("evento com início, fim de 1h, alarme e status", () => {
    expect(ics).toContain("DTSTART:20260928T130000Z");
    expect(ics).toContain("DTEND:20260928T140000Z");
    expect(ics).toContain("TRIGGER:-PT1H");
    expect(ics).toContain("STATUS:CONFIRMED");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });

  it("escapa ; e , do texto", () => {
    expect(escaparTexto("a;b,c\nd")).toBe("a\;b\\,c\\nd");
    expect(ics).toContain("Ana\; Prado\\, filha");
  });

  it("dobra linha longa em 75 octetos, contando acento como dois", () => {
    const linha = "DESCRIPTION:" + "ã".repeat(80);
    for (const parte of dobrarLinha(linha).split("\r\n")) {
      expect(new TextEncoder().encode(parte).length).toBeLessThanOrEqual(75);
    }
  });

  it("token só no formato uuid", () => {
    expect(ehToken("0b7e4a1c-2d3f-4a5b-8c9d-0e1f2a3b4c5d")).toBe(true);
    expect(ehToken("../../etc")).toBe(false);
  });
});

describe("credencial não mora em tabela pública", () => {
  it("`corretores` é lida pelo site; nenhuma migration posterior à 0126 põe token nela", () => {
    const dir = "supabase/migrations";
    const depois = readdirSync(dir).filter((f) => f > "0126");
    for (const f of depois) {
      const sql = readFileSync(`${dir}/${f}`, "utf8").replace(/--.*$/gm, "");
      expect(sql, f).not.toMatch(/alter\s+table\s+public\.corretores\s+add\s+column[^;]*token/i);
    }
  });
});
