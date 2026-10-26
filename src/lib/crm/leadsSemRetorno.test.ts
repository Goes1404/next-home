import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bancoFalso, type BancoFalso, type Linha } from "../../../test/bancoFalso";

const enviadas: Array<{ telefone: string; texto: string }> = [];
vi.mock("@/lib/whatsapp/provider", () => ({
  enviarMensagemWhatsapp: async (p: { telefone: string; texto: string }) => {
    enviadas.push({ telefone: p.telefone, texto: p.texto });
    return { enviado: true, messageId: "x" };
  },
}));

import { diaEmSaoPaulo, ehHoraDaLista, enviarListasSemRetorno, textoDaListaSemRetorno } from "./leadsSemRetorno";

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

describe("lista diária com muitos avisos", () => {
  const G = "grupo-a";
  const AS_18H = new Date("2026-10-26T21:10:00Z");
  let banco: BancoFalso;
  let listasDoIn: unknown[][];

  function semear(quantos: number) {
    const leads: Linha[] = [];
    const avisos: Linha[] = [];
    for (let i = 0; i < quantos; i++) {
      leads.push({ id: `lead-${i}`, grupo_id: G, nome: `Cliente ${i}`, corretor_id: "joao", trazido_por: null, etapa: "novo" });
      avisos.push({
        id: `env-${i}`,
        grupo_id: G,
        lead_id: `lead-${i}`,
        corretor_id: "joao",
        status: "enviado",
        retorno_em: null,
        enviado_em: "2026-10-26T10:00:00.000Z",
        tentativas_ligacao: 0,
      });
    }
    banco = bancoFalso({
      grupos: [{ id: G, envio_grupo_leads_ativo: true, envio_grupo_leads_instancia: "central" }],
      corretores: [
        { id: "joao", grupo_id: G, nome: "João", papel: "corretor", ativo: true, oculta: false, whatsapp: "11900000001" },
        { id: "gestor", grupo_id: G, nome: "Gestora", papel: "gestor", ativo: true, oculta: false, whatsapp: "11900000002" },
      ],
      leads,
      lead_envios_grupo: avisos,
      listas_de_retorno_enviadas: [],
    });
    listasDoIn = [];
    const from = banco.cliente.from;
    banco.cliente.from = ((t: string) => {
      const q = from(t);
      if (t === "leads") {
        const original = q.in;
        q.in = ((coluna: string, valores: unknown[]) => {
          listasDoIn.push(valores);
          return original(coluna, valores);
        }) as typeof q.in;
      }
      return q;
    }) as typeof banco.cliente.from;
  }

  beforeEach(() => {
    enviadas.length = 0;
  });

  it("até 200 avisos na lista, os leads lidos em lotes de até 100, e o resto vira \"…e mais N\"", async () => {
    semear(250);
    expect(await enviarListasSemRetorno(banco.cliente as never, AS_18H)).toBe(1);
    const linhas = enviadas[0].texto.split("\n");
    expect(linhas.filter((l) => l.startsWith("• "))).toHaveLength(200);
    expect(linhas.at(-1)).toBe("…e mais 50");
    expect(listasDoIn.length).toBeGreaterThan(0);
    for (const lista of listasDoIn) expect(lista.length).toBeLessThanOrEqual(100);
  });

  it("dentro do teto, a lista sai inteira, sem \"…e mais\"", async () => {
    semear(3);
    await enviarListasSemRetorno(banco.cliente as never, AS_18H);
    expect(enviadas[0].texto).not.toContain("…e mais");
    expect(enviadas[0].texto.split("\n").filter((l) => l.startsWith("• "))).toHaveLength(3);
  });

  it("o teto fica com os avisos mais recentes (o banco falso não ordena: confere a consulta)", () => {
    const fonte = readFileSync(join(process.cwd(), "src", "lib", "crm", "leadsSemRetorno.ts"), "utf8");
    expect(fonte).toMatch(/\.order\("enviado_em", \{ ascending: false \}\)\s*\.limit\(TETO_DA_LISTA\)/);
    const situacao = readFileSync(join(process.cwd(), "src", "lib", "crm", "retornoPeloGrupo", "situacao.ts"), "utf8");
    expect(situacao).toMatch(/\.is\("retorno_em", null\)\s*\.order\("enviado_em", \{ ascending: false \}\)\s*\.limit\(TETO_DE_AGUARDANDO\)/);
  });

  it("textoDaListaSemRetorno: \"…e mais N\" no fim quando há mais do que coube", () => {
    const agora = new Date("2026-10-26T21:00:00Z");
    const texto = textoDaListaSemRetorno([{ corretor: "Ana", cliente: "Paulo", avisadoEm: new Date("2026-10-26T17:00:00Z"), tentativas: 0 }], agora, 7);
    expect(texto?.split("\n").at(-1)).toBe("…e mais 7");
  });
});
