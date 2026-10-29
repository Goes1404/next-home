import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  caminhoDaVitrine,
  codigoComFormato,
  gerarCodigoDaVitrine,
  haQuanto,
  resumirVisualizacoes,
  visitanteDaVitrine,
} from "./vitrine";

/** A vitrine personalizada (29/10/2026, 0245). */

const NAVEGADOR = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

describe("código curto", () => {
  it("8 caracteres no formato que o CHECK da 0245 aceita, sem letras que se confundem", () => {
    const vistos = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const c = gerarCodigoDaVitrine();
      expect(codigoComFormato(c)).toBe(true);
      expect(c).toMatch(/^[A-Za-z0-9]{8}$/);
      expect(c).not.toMatch(/[0O1lI]/);
      vistos.add(c);
    }
    expect(vistos.size).toBe(200);
    expect(caminhoDaVitrine("AbCd2345")).toBe("/v/AbCd2345");
  });

  it("formato inválido não vira consulta", () => {
    for (const c of [null, "", "abc", "abcdefghi", "abcd-efg", "../selec", "' or 1=1"]) expect(codigoComFormato(c)).toBe(false);
  });
});

describe("visitante sem dado pessoal", () => {
  const cabecalhos = (ip: string, ua = NAVEGADOR) => new Headers({ "x-forwarded-for": `${ip}, 10.0.0.1`, "user-agent": ua });
  const dia1 = new Date("2026-10-29T15:00:00Z");
  const dia2 = new Date("2026-10-30T15:00:00Z");

  it("o resumo não contém o IP e muda com o dia (não segue ninguém pela semana)", () => {
    const a = visitanteDaVitrine(cabecalhos("187.10.20.30"), "segredo", dia1);
    expect(a.conta).toBe(true);
    expect(a.visitante).toMatch(/^[0-9a-f]{24}$/);
    expect(a.visitante).not.toContain("187");
    expect(a.dia).toBe("2026-10-29");
    // A mesma pessoa no mesmo dia é o mesmo resumo (o índice único descarta a repetição).
    expect(visitanteDaVitrine(cabecalhos("187.10.20.30"), "segredo", dia1).visitante).toBe(a.visitante);
    expect(visitanteDaVitrine(cabecalhos("187.10.20.30"), "segredo", dia2).visitante).not.toBe(a.visitante);
    expect(visitanteDaVitrine(cabecalhos("187.10.20.31"), "segredo", dia1).visitante).not.toBe(a.visitante);
    // Sem o segredo do servidor o resumo não é montado (seria reversível por força bruta).
    expect(visitanteDaVitrine(cabecalhos("187.10.20.30"), "", dia1).visitante).toBeNull();
  });

  it("robô que se declara (a prévia do WhatsApp) não conta como abertura", () => {
    expect(visitanteDaVitrine(cabecalhos("1.1.1.1", "WhatsApp/2.23 facebookexternalhit/1.1"), "s", dia1).conta).toBe(false);
    expect(visitanteDaVitrine(new Headers(), "s", dia1).conta).toBe(false);
  });

  it("a tabela da 0245 não tem coluna de IP nem de navegador", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/0245_portais_e_vitrine.sql"), "utf8");
    const tabela = sql.slice(sql.indexOf("create table if not exists public.vitrine_visualizacoes"));
    // Só as colunas: o comentário da migration explica o resumo e cita "IP".
    const colunas = tabela.slice(0, tabela.indexOf(");")).replace(/--.*$/gm, "");
    expect(colunas).not.toMatch(/\b(ip|user_agent|navegador|telefone|nome)\b/);
    expect(colunas).toMatch(/visitante\s+text/);
  });
});

describe("resumo para a ficha do lead", () => {
  it("aberturas, a mais recente e os imóveis vistos (mais visto primeiro)", () => {
    const r = resumirVisualizacoes([
      { empreendimento_id: null, criado_em: "2026-10-29T10:00:00Z" },
      { empreendimento_id: null, criado_em: "2026-10-29T12:00:00Z" },
      { empreendimento_id: "vitra", criado_em: "2026-10-29T12:01:00Z" },
      { empreendimento_id: "dom", criado_em: "2026-10-29T10:01:00Z" },
      { empreendimento_id: "dom", criado_em: "2026-10-28T10:01:00Z" },
    ]);
    expect(r.aberturas).toBe(2);
    expect(r.ultimaAbertura).toBe("2026-10-29T12:00:00Z");
    expect(r.vistos).toEqual([
      { empreendimentoId: "dom", vezes: 2, ultima: "2026-10-29T10:01:00Z" },
      { empreendimentoId: "vitra", vezes: 1, ultima: "2026-10-29T12:01:00Z" },
    ]);
    expect(resumirVisualizacoes([])).toEqual({ ultimaAbertura: null, aberturas: 0, vistos: [] });
  });

  it("'há quanto' curto", () => {
    const agora = new Date("2026-10-29T12:00:00Z");
    expect(haQuanto("2026-10-29T11:59:40Z", agora)).toBe("agora");
    expect(haQuanto("2026-10-29T11:50:00Z", agora)).toBe("há 10 min");
    expect(haQuanto("2026-10-29T09:00:00Z", agora)).toBe("há 3 h");
    expect(haQuanto("2026-10-28T11:00:00Z", agora)).toBe("há 1 dia");
    expect(haQuanto("2026-10-25T11:00:00Z", agora)).toBe("há 4 dias");
  });
});
