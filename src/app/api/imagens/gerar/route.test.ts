import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../../../test/bancoFalso";

/**
 * A foto do catálogo usada como base vem por `midiaId`, um id escolhido no
 * navegador, e é lida pela chave de serviço, que enxerga todos os grupos.
 * Sem conferir o grupo, o corretor do grupo B mandaria ao modelo a foto de
 * um imóvel do grupo A e ligaria a arte ao imóvel dele (L16).
 */

const GRUPO_A = "00000000-0000-0000-0000-00000000000a";
const GRUPO_B = "00000000-0000-0000-0000-00000000000b";

let banco: BancoFalso;
const gerarImagem = vi.fn(async () => ({ ok: false, motivo: "erro_api", detalhe: "parado no teste" }));

vi.mock("@/lib/corretorSessao", () => ({
  getCorretorLogado: async () => ({ id: "corretor-b", papel: "corretor", grupoId: GRUPO_B }),
}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/imagens/gerarImagem", () => ({
  imagensConfiguradas: () => true,
  gerarImagem: (...args: unknown[]) => gerarImagem(...(args as [])),
}));
vi.mock("@/lib/imagens/galeria", () => ({
  getTetoDeHoje: async () => ({ usadasHoje: 0, teto: 20 }),
  registrarImagem: async () => ({ id: "x" }),
}));
let limiteEsgotado = false;
const conferirLimite = vi.fn(async () =>
  limiteEsgotado
    ? { ok: false as const, erro: "Seu plano tem 30 artes por mês e elas acabaram. Voltam no dia 1º.", situacao: {} }
    : { ok: true as const, situacao: {} },
);
vi.mock("@/lib/planos/usoDaIa", () => ({ conferirLimite: (...args: unknown[]) => conferirLimite(...(args as [])) }));
vi.mock("@/lib/imoveis/catalogoDoPainel", () => ({ getEmpreendimentoDoPainel: async () => null }));
vi.mock("@/lib/imagens/carimbo", () => ({ carimbarRessalva: async () => ({}) }));
vi.mock("@/lib/imoveis/imagemDerivada", () => ({ medirImagem: async () => ({}) }));

const { POST } = await import("./route");

const pedir = (midiaId: string) =>
  POST(
    new NextRequest("http://localhost/api/imagens/gerar", {
      method: "POST",
      body: JSON.stringify({ prompt: "fachada ao pôr do sol", midiaId }),
    }),
  );

describe("/api/imagens/gerar", () => {
  const fetchOriginal = globalThis.fetch;
  beforeEach(() => {
    gerarImagem.mockClear();
    conferirLimite.mockClear();
    limiteEsgotado = false;
    globalThis.fetch = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } }));
    banco = bancoFalso({
      midias: [
        { id: "midia-a", url: "https://exemplo/a.jpg", empreendimento_id: "imovel-a", grupo_id: GRUPO_A },
        { id: "midia-b", url: "https://exemplo/b.jpg", empreendimento_id: "imovel-b", grupo_id: GRUPO_B },
      ],
    });
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  it("/api/imagens/gerar não usa mídia de outro grupo", async () => {
    const resposta = await pedir("midia-a");
    expect(resposta.status).toBe(400);
    expect(gerarImagem).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("a mídia do próprio grupo vai ao modelo (o teste acima não passa por acaso)", async () => {
    await pedir("midia-b");
    expect(gerarImagem).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).toHaveBeenCalledWith("https://exemplo/b.jpg");
  });

  it("arte do mês esgotada: recusa com a mensagem do plano ANTES de chamar o modelo", async () => {
    limiteEsgotado = true;
    const resposta = await pedir("midia-b");
    expect(resposta.status).toBe(429);
    expect((await resposta.json()).erro).toContain("Seu plano tem 30 artes por mês e elas acabaram. Voltam no dia 1º.");
    expect(conferirLimite).toHaveBeenCalledWith(GRUPO_B, "arte");
    expect(gerarImagem).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
