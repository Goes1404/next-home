import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  contaComoRespostaDaLista,
  DIAS_DO_CONTEXTO,
  instrucaoDaCampanha,
  type ListaRecenteDoLead,
} from "./contextoDaCampanha";

const AGORA = new Date("2026-10-03T15:00:00Z");
const diasAtras = (d: number) => new Date(AGORA.getTime() - d * 86_400_000).toISOString();

const lista: ListaRecenteDoLead = {
  itemId: "i1",
  campanhaId: "c1",
  status: "enviado",
  enviadoEm: diasAtras(1),
  titulo: "Reativação setembro",
  imovel: "Dom Parque",
  mensagemEnviada: "Oi, Ana! Saiu a tabela nova do Dom Parque. Quer ver?",
};

const semComentarios = (arquivo: string) =>
  readFileSync(arquivo, "utf8").replace(/\/\*[\s\S]*?\*\/|(^|[^:])\/\/.*$/gm, "$1");

describe("instrucaoDaCampanha — o que a IA sabe da lista", () => {
  it("diz a lista, o imóvel e a mensagem, e manda não repetir", () => {
    const t = instrucaoDaCampanha(lista, AGORA)!;
    expect(t).toContain('"Reativação setembro"');
    expect(t).toContain("Dom Parque");
    expect(t).toContain("Saiu a tabela nova");
    expect(t).toContain("não a repita");
  });

  it("depois da janela, a lista deixa de ser contexto", () => {
    expect(instrucaoDaCampanha({ ...lista, enviadoEm: diasAtras(DIAS_DO_CONTEXTO + 1) }, AGORA)).toBeNull();
    expect(instrucaoDaCampanha(null, AGORA)).toBeNull();
  });

  it("mensagem longa é cortada", () => {
    const t = instrucaoDaCampanha({ ...lista, mensagemEnviada: "x".repeat(2000) }, AGORA)!;
    expect(t.length).toBeLessThan(900);
  });

  it("sem imóvel, não inventa um", () => {
    const t = instrucaoDaCampanha({ ...lista, imovel: null }, AGORA)!;
    expect(t).not.toContain("sobre o");
    expect(t).not.toContain("é o ");
  });
});

describe("contaComoRespostaDaLista", () => {
  it("só item ainda enviado, até 30 dias", () => {
    expect(contaComoRespostaDaLista(lista, AGORA)).toBe(true);
    expect(contaComoRespostaDaLista({ ...lista, status: "respondido" }, AGORA)).toBe(false);
    expect(contaComoRespostaDaLista({ ...lista, enviadoEm: diasAtras(31) }, AGORA)).toBe(false);
  });
});

describe("as guardas que leem o código", () => {
  it("a resposta conta pelo lead e em qualquer conversa, não só nas de origem campanha", () => {
    const webhook = semComentarios("src/app/api/webhooks/whatsapp/route.ts");
    expect(webhook).toContain("ultimaListaDoLead(conversa.leadId)");
    expect(webhook).not.toMatch(/origem === "campanha"\)\s*\{\s*await marcarRespostaCampanha/);
    expect(webhook).toContain("instrucaoDaCampanha(listaRecente)");

    const repo = semComentarios("src/lib/whatsapp/repositorio.ts");
    const ini = repo.indexOf("export async function ultimaListaDoLead");
    const corpo = repo.slice(ini, repo.indexOf("\n}", ini));
    expect(corpo).toContain('.eq("lead_id", leadId)');
    expect(corpo).not.toContain('.eq("telefone"');
  });

  it("o disparador confere a lista e a conversa humana ANTES de reservar a cota", () => {
    const codigo = semComentarios("src/lib/whatsapp/campaignDispatcher.ts");
    const cota = codigo.indexOf("await reservarCotaCampanha(");
    const status = codigo.indexOf("if (!aindaAtiva)");
    const humano = codigo.indexOf("corretorFalouComOLead(supabase, item.lead_id)");
    expect(status).toBeGreaterThan(-1);
    expect(humano).toBeGreaterThan(-1);
    expect(status).toBeLessThan(cota);
    expect(humano).toBeLessThan(cota);
  });

  it("o disparador só fecha como concluída a lista que estava enviando", () => {
    const codigo = semComentarios("src/lib/whatsapp/campaignDispatcher.ts");
    const ini = codigo.indexOf('.update({ status: "concluida" })');
    expect(ini).toBeGreaterThan(-1);
    expect(codigo.slice(ini, ini + 160)).toContain('.eq("status", "em_andamento")');
  });

  it("pausar, retomar, cancelar e detalhar recortam pelo corretor da sessão", () => {
    const acoes = semComentarios("src/app/corretor/(painel)/campanhas/acoes.ts");
    for (const nome of ["detalharCampanha", "cancelarCampanha", "mudarEstadoDaLista"]) {
      const ini = acoes.indexOf(`function ${nome}`);
      expect(ini, nome).toBeGreaterThan(-1);
      const corpo = acoes.slice(ini, acoes.indexOf("\n}", ini));
      expect(corpo, nome).toContain('.eq("corretor_id", corretor.id)');
    }
  });
});
