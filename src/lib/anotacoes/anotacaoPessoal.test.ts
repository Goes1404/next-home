import { describe, expect, it, vi } from "vitest";
import { bancoFalso } from "@/lib/central/bancoFalso";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));

const { apagarAnotacaoPessoal, criarAnotacaoPessoal } = await import("./anotacaoPessoal");

describe("anotação pessoal pelo central", () => {
  it("é do próprio autor, no grupo dele, sem lead e sem lembrete", async () => {
    const banco = bancoFalso({ anotacoes: [] });
    const r = await criarAnotacaoPessoal({ grupoId: "g1", corretorId: "c1", texto: "  ligar pro cartório " }, banco.cliente);
    expect(r.id).toBeTruthy();
    expect(banco.tabelas.anotacoes).toEqual([
      expect.objectContaining({
        grupo_id: "g1",
        corretor_id: "c1",
        destinatario_id: "c1",
        lead_id: null,
        texto: "ligar pro cartório",
        lembrete_em: null,
        lembrete_whatsapp: false,
      }),
    ]);
  });

  it("texto vazio não grava", async () => {
    const banco = bancoFalso({ anotacoes: [] });
    expect(await criarAnotacaoPessoal({ grupoId: "g1", corretorId: "c1", texto: "  " }, banco.cliente)).toEqual({
      erro: "O que é para anotar?",
    });
    expect(banco.escritas).toEqual([]);
  });

  it("apagar (o desfazer): só a do autor, no grupo dele", async () => {
    const banco = bancoFalso({
      anotacoes: [
        { id: "a1", grupo_id: "g1", corretor_id: "c1", texto: "minha" },
        { id: "a2", grupo_id: "g1", corretor_id: "c2", texto: "de outro" },
      ],
    });
    expect(await apagarAnotacaoPessoal({ grupoId: "g1", corretorId: "c1", anotacaoId: "a2" }, banco.cliente)).toEqual({
      erro: "Essa anotação não existe mais.",
    });
    expect(await apagarAnotacaoPessoal({ grupoId: "outro", corretorId: "c1", anotacaoId: "a1" }, banco.cliente)).toMatchObject({
      erro: expect.any(String),
    });
    expect(await apagarAnotacaoPessoal({ grupoId: "g1", corretorId: "c1", anotacaoId: "a1" }, banco.cliente)).toEqual({});
    expect(banco.tabelas.anotacoes.map((a) => a.id)).toEqual(["a2"]);
  });
});
