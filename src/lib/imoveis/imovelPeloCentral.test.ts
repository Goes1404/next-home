import { describe, expect, it, vi } from "vitest";
import { bancoFalso } from "@/lib/central/bancoFalso";

vi.mock("server-only", () => ({}));

const { mudarPrecoPeloCentral, desfazerPrecoPeloCentral, mudarUnidadePeloCentral, desfazerUnidadePeloCentral } = await import("./imovelPeloCentral");

/*
 * As escritas do central no catálogo rodam pela chave de serviço: o grupo
 * filtrado aqui é a única coisa entre um id e o catálogo de outra empresa.
 */
function banco() {
  return bancoFalso({
    empreendimentos: [{ id: "x1", grupo_id: "g2", nome: "De Outra Casa", preco_a_partir: "300000" }],
    tipologias: [{ id: "tx", grupo_id: "g2", empreendimento_id: "x1", preco: "300000" }],
    unidades: [{ id: "ux", grupo_id: "g2", empreendimento_id: "x1", identificacao: "32", status: "disponivel", reservada_ate: null, atualizado_em: "2026-10-01" }],
    historico_precos_lotes: [],
    historico_precos_itens: [],
  });
}

describe("imovelPeloCentral: o grupo em toda escrita", () => {
  it("preço de imóvel ou planta de outro grupo não é mudado nem desfeito", async () => {
    const b = banco();
    const imovel = { tipo: "imovel" as const, empreendimentoId: "x1" };
    const planta = { tipo: "planta" as const, empreendimentoId: "x1", tipologiaId: "tx" };
    for (const alvo of [imovel, planta]) {
      expect(await mudarPrecoPeloCentral(b.cliente, { grupoId: "g1", gestorId: "g", alvo, antes: 300000, depois: 1, nomeDoImovel: "x" })).toEqual({
        desfecho: "nao_achou",
      });
      expect(await desfazerPrecoPeloCentral(b.cliente, { grupoId: "g1", registro: { alvo, antes: 1, depois: 300000, loteId: null } })).toEqual({
        desfecho: "nao_achou",
      });
    }
    expect(b.escritas).toEqual([]);
  });

  it("unidade de outro grupo não muda de status nem volta", async () => {
    const b = banco();
    expect(await mudarUnidadePeloCentral(b.cliente, { grupoId: "g1", unidadeId: "ux", antes: "disponivel", depois: "vendida" })).toEqual({
      desfecho: "nao_achou",
    });
    const registro = { unidadeId: "ux", antes: { status: "vendida" as const, reservadaAte: null }, depois: "disponivel" as const, atualizadoEm: "2026-10-01" };
    expect(await desfazerUnidadePeloCentral(b.cliente, { grupoId: "g1", registro })).toEqual({ desfecho: "nao_achou" });
    expect(b.escritas).toEqual([]);
  });
});
