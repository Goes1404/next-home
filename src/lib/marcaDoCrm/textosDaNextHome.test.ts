import { describe, expect, it, vi } from "vitest";

/**
 * A Next Home (grupo 1) fica byte a byte como era: os textos que o CRM monta
 * com o nome da casa saem IGUAIS quando nada é passado (o padrão) e quando se
 * passa a marca da Next Home; outro grupo só vê o nome dele.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/whatsapp/provider", () => ({ enviarMensagemWhatsapp: async () => ({ enviado: false }) }));
vi.mock("@/lib/notificacoes/push", () => ({ notificarCorretor: async () => 0 }));
vi.mock("@/lib/marcaDoCrm/ler", () => ({ lerMarcaDoCrm: async () => ({ nome: "Sol Imóveis" }) }));

const { notificacaoDoTexto } = await import("@/lib/crm/avisoAoCorretor");
const { assuntoDoRelatorio } = await import("@/lib/admin/relatorioSemanal");
const { linkWhatsappLead } = await import("@/app/corretor/(painel)/_componentes/CartaoLead");
const { MARCA_NEXT_HOME, enderecoDoPainel, linkDoPainel } = await import("./marca");
const { GRUPO_NEXT_HOME_ID } = await import("@/lib/grupos/grupo");
const { site } = await import("@/lib/site");

const lead = {
  nome: "Ana Souza",
  telefone: "11999998888",
  portalOrigem: null,
  origem: "site",
  empreendimento: null,
  anuncioOrigem: null,
} as never;

describe("textos da Next Home, como sempre", () => {
  it("título da notificação de uma linha só: 'Next Home'", () => {
    expect(notificacaoDoTexto("Um aviso").titulo).toBe("Next Home");
    expect(notificacaoDoTexto("Um aviso", MARCA_NEXT_HOME.nome).titulo).toBe("Next Home");
    expect(notificacaoDoTexto("Linha 1\nLinha 2")).toEqual({ titulo: "Linha 1", corpo: "Linha 2" });
  });

  it("assunto do relatório semanal", () => {
    expect(assuntoDoRelatorio([])).toBe("Next Home · a semana correu bem");
    expect(assuntoDoRelatorio([], MARCA_NEXT_HOME.nome)).toBe("Next Home · a semana correu bem");
  });

  it("primeira mensagem do corretor ao cliente", () => {
    const url = new URL(linkWhatsappLead(lead)!);
    expect(decodeURIComponent(url.searchParams.get("text")!)).toBe(
      "Olá, Ana! Aqui é da Next Home, recebi seu contato pelo site da Next Home. Como posso te ajudar?",
    );
    expect(linkWhatsappLead(lead, MARCA_NEXT_HOME.nome)).toBe(linkWhatsappLead(lead));
  });

  it("links para o corretor: o endereço de site.url", () => {
    expect(linkDoPainel(GRUPO_NEXT_HOME_ID, "/corretor/leads/1")).toBe(`${site.url.replace(/\/+$/, "")}/corretor/leads/1`);
    expect(enderecoDoPainel(GRUPO_NEXT_HOME_ID)).toContain("next-home");
  });
});

describe("textos de outro grupo", () => {
  it("levam o nome do grupo, nunca o da Next Home", () => {
    expect(notificacaoDoTexto("Um aviso", "Sol Imóveis").titulo).toBe("Sol Imóveis");
    expect(assuntoDoRelatorio([], "Sol Imóveis")).toBe("Sol Imóveis · a semana correu bem");
    const texto = decodeURIComponent(new URL(linkWhatsappLead(lead, "Sol Imóveis")!).searchParams.get("text")!);
    expect(texto).toBe("Olá, Ana! Aqui é da Sol Imóveis, recebi seu contato pelo site da Sol Imóveis. Como posso te ajudar?");
    expect(texto).not.toMatch(/Next ?Home/);
  });
});
