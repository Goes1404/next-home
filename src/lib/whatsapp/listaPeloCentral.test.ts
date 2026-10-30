import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));

const { quantosSaemHoje, inicioDeAmanhaEmSaoPaulo } = await import("./listaPeloCentral");

/*
 * A lista pedida pelo número central (onda 3) repete o `criarCampanha` da
 * tela pela chave de serviço. As regressões seriam caladas: a lista sairia,
 * só sem uma das travas que derrubaram os números da Bruna e do Ramos.
 */
const semComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fonte = semComentarios(readFileSync("src/lib/whatsapp/listaPeloCentral.ts", "utf8"));
const tratador = semComentarios(readFileSync("src/lib/central/tratadores/listas.ts", "utf8"));

function corpo(nome: string): string {
  const ini = fonte.indexOf(`export async function ${nome}`);
  expect(ini, nome).toBeGreaterThan(0);
  return fonte.slice(ini, fonte.indexOf("\nexport ", ini + 10));
}

describe("criar a lista pelo central: as travas da tela, na ordem da tela", () => {
  const criar = corpo("criarListaPeloCentral");
  const pos = (trecho: string) => {
    const i = criar.indexOf(trecho);
    expect(i, trecho).toBeGreaterThan(0);
    return i;
  };

  it("número conectado, público refeito com a proteção, sem WhatsApp fora, limite do plano: tudo antes de gravar", () => {
    const gravar = pos('from("whatsapp_campanhas")\n    .insert(');
    expect(pos('instancia?.status_conexao !== "conectado"')).toBeLessThan(gravar);
    expect(pos("publicoDaListaPeloCentral(")).toBeLessThan(gravar);
    expect(pos("externos.conferirNumeros(")).toBeLessThan(gravar);
    expect(pos("externos.limiteDoPlano(")).toBeLessThan(gravar);
    expect(pos("externos.conferirNumeros(")).toBeLessThan(pos("montarFilaCampanha("));
  });

  it("lista nunca 'de qualquer hora', sem foto, e a fila sem IA", () => {
    expect(criar).toContain("ignorar_janela: false");
    expect(criar).toContain("midias: []");
    expect(criar).not.toMatch(/ignorarJanela|chamarLlm|variarSemRepetir/);
  });

  it("o público é a régua da tela: carteira dele, elegível e protegida de lista recente", () => {
    const publico = corpo("publicoDaListaPeloCentral");
    expect(publico).toContain("leadsDoCorretor(supabase, p.corretorId)");
    expect(publico).toContain("elegivel(l, p.filtro");
    expect(publico).toContain("idsProtegidosDeNovaLista(supabase, p.corretorId)");
  });

  it("o primeiro contato é a conta do disparador", () => {
    const situacao = corpo("situacaoDoNumero");
    expect(situacao).toContain("contarPrimeirosContatos(supabase, p.corretorId");
    expect(situacao).toContain("vagasDePrimeiroContato(");
    expect(situacao).toContain("inicioDoPrimeiroContato(");
    expect(situacao).toContain("externos.limiteDoDia(");
  });

  it("nem o domínio nem o tratador enviam: o envio é do disparador", () => {
    for (const f of [fonte, tratador]) {
      expect(f).not.toMatch(/enviarMensagemWhatsapp|enviarMidiaWhatsapp|processarFilaCampanhas|reservarCotaCampanha/);
    }
  });

  it("o número e a carteira são sempre os de quem pediu (o contexto), nunca um argumento", () => {
    expect(tratador).not.toMatch(/corretorId:\s*(a|d|dados|argumentos)\./);
    expect(tratador.match(/corretorId: ctx\.corretorId/g)?.length ?? 0).toBeGreaterThanOrEqual(8);
  });
});

describe("quantosSaemHoje", () => {
  const base = {
    pessoas: 20,
    nuncaFalaram: 15,
    vagasDePrimeiroContato: 4,
    saldoDaCota: 50,
    naFilaHoje: 0,
    expediente: { inicioHora: 9, fimHora: 21 },
    // Sexta, 12h em São Paulo.
    agora: new Date("2026-10-30T15:00:00.000Z"),
  };

  it("quem já conversou mais as vagas de primeiro contato", () => {
    expect(quantosSaemHoje(base)).toBe(5 + 4);
  });
  it("a cota que sobra manda, descontada a fila de outras listas", () => {
    expect(quantosSaemHoje({ ...base, saldoDaCota: 10, naFilaHoje: 4 })).toBe(6);
  });
  it("número recém-conectado: nenhum primeiro contato", () => {
    expect(quantosSaemHoje({ ...base, vagasDePrimeiroContato: 0 })).toBe(5);
  });
  it("fora da janela ou no domingo, nada hoje", () => {
    expect(quantosSaemHoje({ ...base, agora: new Date("2026-10-31T00:30:00.000Z") })).toBe(0);
    expect(quantosSaemHoje({ ...base, agora: new Date("2026-11-01T15:00:00.000Z") })).toBe(0);
  });
  it("o expediente do corretor encurta o dia", () => {
    expect(quantosSaemHoje({ ...base, expediente: { inicioHora: 9, fimHora: 12 } })).toBe(0);
  });
});

describe("inicioDeAmanhaEmSaoPaulo", () => {
  it("meia-noite de amanhã em São Paulo, mesmo depois das 21h (já é amanhã em UTC)", () => {
    expect(inicioDeAmanhaEmSaoPaulo(new Date("2026-10-30T15:00:00.000Z"))).toBe("2026-10-31T03:00:00.000Z");
    expect(inicioDeAmanhaEmSaoPaulo(new Date("2026-10-31T01:00:00.000Z"))).toBe("2026-10-31T03:00:00.000Z");
  });
});
