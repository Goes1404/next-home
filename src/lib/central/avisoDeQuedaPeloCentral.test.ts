import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso } from "./bancoFalso";

const banco = { atual: bancoFalso({}) };
const enviados: { instanceName: string; telefone: string; texto: string }[] = [];

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.atual.cliente }));
vi.mock("@/lib/whatsapp/provider", () => ({
  enviarMensagemWhatsapp: vi.fn(async (p: { instanceName: string; telefone: string; texto: string }) => {
    enviados.push(p);
    return { enviado: true };
  }),
}));

const { avisarPeloCentral, corretorAvisadoDaQueda, montarWhatsappDeQueda, montarWhatsappDeVolta, quedaRecenteParaOCentral } = await import(
  "./avisoDeQuedaPeloCentral"
);
const { esquecerCentral } = await import("./numeroDoCentral");

function cenario(p: { central?: "conectado" | "desconectado" | null; ligado?: boolean; ativo?: boolean }) {
  banco.atual = bancoFalso({
    central_da_plataforma: p.central === null ? [] : [{ instance_name: "astro-central", telefone: "5511968671127", status_conexao: p.central ?? "conectado", created_at: "x" }],
    corretores: [{ id: "c1", nome: "Ramos Silva", whatsapp: "5511990024407", ativo: p.ativo ?? true, grupo_id: "g1" }],
    grupos: [{ id: "g1", central_whatsapp_ativo: p.ligado ?? true }],
    corretor_whatsapp_instancias: [{ id: "i1", corretor_id: "c1", aviso_queda_enviado_em: "2026-10-30T10:00:00Z" }],
  });
  esquecerCentral();
  enviados.length = 0;
}

const AVISO = {
  tipo: "caiu" as const,
  gravidade: "perigo" as const,
  titulo: "Seu WhatsApp saiu do ar",
  detalhe: "A conexão caiu em 30/10 às 14h20. Motivo informado pelo WhatsApp: o aparelho foi desconectado da conta.",
  acao: "Reconectar meu número",
  mereceEmail: true,
};

describe("textos", () => {
  it("o aviso de queda usa o título e a explicação do e-mail, e o caminho para reconectar", () => {
    expect(montarWhatsappDeQueda(AVISO, { nome: "Ramos Silva", urlPainel: "https://www.nexthomeimoveis.com/" })).toBe(
      "Ramos, *Seu WhatsApp saiu do ar*\n" +
        "A conexão caiu em 30/10 às 14h20. Motivo informado pelo WhatsApp: o aparelho foi desconectado da conta.\n\n" +
        "Para reconectar: https://www.nexthomeimoveis.com/corretor/whatsapp",
    );
    expect(montarWhatsappDeVolta("Ramos Silva")).toBe("Ramos, seu WhatsApp voltou a conectar. Está tudo funcionando de novo.");
  });
});

describe("avisarPeloCentral", () => {
  beforeEach(() => cenario({}));

  it("manda pelo central (nunca pela instância do corretor) para o WhatsApp do perfil", async () => {
    expect(await avisarPeloCentral("c1", "teste")).toEqual({ enviado: true });
    expect(enviados).toEqual([{ instanceName: "astro-central", telefone: "5511990024407", texto: "teste" }]);
  });

  it("central desconectado ou sem central: não manda (fica o e-mail)", async () => {
    cenario({ central: "desconectado" });
    expect(await avisarPeloCentral("c1", "teste")).toEqual({ enviado: false });
    cenario({ central: null });
    expect(await avisarPeloCentral("c1", "teste")).toEqual({ enviado: false });
    expect(enviados).toEqual([]);
  });

  it("recurso desligado na imobiliária, ou corretor inativo: não manda", async () => {
    cenario({ ligado: false });
    expect((await avisarPeloCentral("c1", "x")).enviado).toBe(false);
    cenario({ ativo: false });
    expect((await avisarPeloCentral("c1", "x")).enviado).toBe(false);
  });

  it("o texto pode depender do nome", async () => {
    await avisarPeloCentral("c1", montarWhatsappDeVolta);
    expect(enviados[0].texto).toMatch(/^Ramos, seu WhatsApp voltou/);
  });

  it("a volta só é avisada quando houve aviso de queda", async () => {
    expect(await corretorAvisadoDaQueda("i1")).toBe("c1");
    banco.atual.tabelas.corretor_whatsapp_instancias[0].aviso_queda_enviado_em = null;
    expect(await corretorAvisadoDaQueda("i1")).toBeNull();
  });
});

describe("avisoDeQueda.ts usa os dois canais", () => {
  it("a marca sai quando PELO MENOS UM canal saiu, e quem não tem e-mail não sai mais cedo", async () => {
    const { readFileSync } = await import("node:fs");
    const codigo = readFileSync("src/lib/whatsapp/avisoDeQueda.ts", "utf8");
    expect(codigo).toMatch(/if \(enviouEmail \|\| peloCentral\.enviado\)/);
    expect(codigo).not.toMatch(/não tem e-mail[^\n]*\n\s*\);\n\s*return;/);
    expect(codigo).toMatch(/avisarPeloCentral\(\s*data\.corretor_id/);
    // Só queda recente vai pelo central.
    expect(codigo).toMatch(/quedaRecenteParaOCentral\([^)]*\)\s*\n?\s*\?\s*await avisarPeloCentral/);
  });
});

describe("quedaRecenteParaOCentral", () => {
  const agora = new Date("2026-10-30T14:00:00Z");
  it("queda de agora há pouco vai pelo central", () => {
    expect(quedaRecenteParaOCentral("2026-10-30T13:50:00Z", agora)).toBe(true);
    expect(quedaRecenteParaOCentral("2026-10-29T14:00:00Z", agora)).toBe(true);
  });
  it("queda de dias atrás (o aviso que nunca saiu por e-mail) não vai", () => {
    expect(quedaRecenteParaOCentral("2026-10-29T13:59:00Z", agora)).toBe(false);
    expect(quedaRecenteParaOCentral("2026-10-09T23:04:03Z", agora)).toBe(false);
    expect(quedaRecenteParaOCentral(null, agora)).toBe(false);
  });
});
