import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../../../../test/bancoFalso";

/**
 * A transparência da visão de suporte (0243, 29/10/2026): o gestor vê os
 * acessos do suporte da Astro à conta DELE, e só à dele. A leitura é pela
 * chave de serviço, filtrada pelo grupo da sessão; corretor comum não vê.
 */

const MEU = "00000000-0000-4000-8000-0000000000a1";
const OUTRO = "00000000-0000-4000-8000-0000000000b2";

let banco: BancoFalso;
let sessao: { papel: string; grupoId: string } | null;

vi.mock("@/lib/corretorSessao", () => ({ getCorretorLogado: async () => sessao }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));

const { AcessosDoSuporte, lerAcessosDoSuporte } = await import("./AcessosDoSuporte");

beforeEach(() => {
  sessao = { papel: "gestor", grupoId: MEU };
  banco = bancoFalso({
    acessos_de_suporte: [
      { id: "1", grupo_alvo_id: MEU, admin_user_id: "u-admin", criado_em: "2026-10-29T14:00:00Z", motivo: "IA não responde" },
      { id: "2", grupo_alvo_id: OUTRO, admin_user_id: "u-admin", criado_em: "2026-10-29T15:00:00Z", motivo: "Segredo do outro" },
    ],
  });
});

describe("acessos do suporte da Astro", () => {
  it("o gestor vê só os acessos à própria conta", async () => {
    expect(await lerAcessosDoSuporte()).toEqual([{ id: "1", criadoEm: "2026-10-29T14:00:00Z", motivo: "IA não responde" }]);
    expect(banco.consultas.every((c) => c.filtros.includes("eq:grupo_alvo_id"))).toBe(true);
  });

  it("mostra 'Equipe Astro', nunca o login do administrador", async () => {
    const html = renderToStaticMarkup((await AcessosDoSuporte())!);
    expect(html).toContain("Equipe Astro");
    expect(html).toContain("IA não responde");
    expect(html).not.toContain("u-admin");
    expect(html).not.toContain("Segredo do outro");
  });

  it("corretor comum e sessão vazia não leem nada", async () => {
    sessao = { papel: "corretor", grupoId: MEU };
    expect(await lerAcessosDoSuporte()).toBeNull();
    sessao = null;
    expect(await AcessosDoSuporte()).toBeNull();
    expect(banco.consultas).toEqual([]);
  });
});
