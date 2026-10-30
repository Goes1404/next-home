import { describe, expect, it, vi } from "vitest";
import { bancoFalso } from "@/lib/central/bancoFalso";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));

const { arquivarLeadCadastradoPeloCentral, atualizarFichaPeloCentral, desfazerAtualizacaoPeloCentral, ondeEstaOTelefone } =
  await import("./leadPeloCentral");

/*
 * As escritas do número central rodam pela chave de serviço: o grupo e o dono
 * conferidos aqui são a única coisa entre um id e a ficha de outra empresa.
 */
const G = "g1";

function banco() {
  return bancoFalso({
    corretores: [{ id: "c9", nome: "Zé de Outra Casa", grupo_id: "g2" }],
    leads: [
      { id: "l1", grupo_id: G, corretor_id: "c1", nome: "Lia", etapa: "novo", arquivado_em: null, renda_mensal: null, campos_do_corretor: [] },
      { id: "x1", grupo_id: "g2", corretor_id: "c9", nome: "Xavier", etapa: "novo", arquivado_em: null, renda_mensal: null, telefone_e164: "5511987654321" },
    ],
    lead_interacoes: [],
  });
}

describe("leadPeloCentral: grupo e dono em toda escrita", () => {
  it("lead de outro grupo não é atualizado, nem pelo gestor", async () => {
    const b = banco();
    const r = await atualizarFichaPeloCentral(b.cliente, {
      grupoId: G,
      leadId: "x1",
      autorId: "gestor",
      soDoCorretor: null,
      mudancas: { renda_mensal: 1 },
      anotacao: "x",
    });
    expect(r).toEqual({ desfecho: "nao_achou" });
    expect(b.escritas).toEqual([]);
  });

  it("o desfaz do cadastro não arquiva lead de outro grupo nem de outro dono", async () => {
    const b = banco();
    expect(await arquivarLeadCadastradoPeloCentral(b.cliente, { grupoId: G, corretorId: "c9", leadId: "x1" })).toEqual({ ok: false });
    expect(await arquivarLeadCadastradoPeloCentral(b.cliente, { grupoId: G, corretorId: "c2", leadId: "l1" })).toEqual({ ok: false });
    expect(b.tabelas.leads.every((l) => l.arquivado_em === null)).toBe(true);
  });

  it("o desfaz da ficha não alcança lead de outro grupo", async () => {
    const b = banco();
    const r = await desfazerAtualizacaoPeloCentral(b.cliente, {
      grupoId: G,
      autorId: "gestor",
      soDoCorretor: null,
      registro: { leadId: "x1", antes: { etapa: "perdido" }, depois: { etapa: "novo" }, etapaAlteradaEmAntes: null, marcasAcrescentadas: [], notaId: null },
    });
    expect(r).toEqual({ desfecho: "nao_achou" });
  });

  it("telefone de lead de outro grupo é número novo, sem dizer de quem é", async () => {
    const b = banco();
    expect(await ondeEstaOTelefone(b.cliente, { grupoId: G, corretorId: "c1", telefoneE164: "5511987654321" })).toEqual({
      onde: "em_nenhuma",
    });
  });
});
