import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../../../../test/bancoFalso";

/**
 * A planilha de um grupo baixada pela plataforma (exceção ao §4, 0202):
 *   - só 24 horas depois do cancelamento (sem a espera, cancelar, baixar e
 *     desfazer em um minuto tornaria a regra só disciplina);
 *   - a cópia final guardada, depois dos dados apagados, só sai com um evento
 *     da plataforma gravado antes;
 *   - a cópia vencida (apagada pela rotina) responde com a data.
 */

vi.mock("server-only", () => ({}));

const G = "4f6c2b1e-1111-4222-8333-944455556666";
let banco: BancoFalso;
let linksAssinados: string[];

vi.mock("@/lib/guardas", () => ({ exigirAdminDaPlataformaNaAcao: async () => ({ userId: "operador-1" }) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));

const { GET } = await import("./route");

const pedir = () => GET(new Request(`http://x/plataforma/grupos/${G}/exportar`), { params: Promise.resolve({ id: G }) });
const horasAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

beforeEach(() => {
  linksAssinados = [];
  banco = bancoFalso({
    grupos: [{ id: G, slug: "silva", cancelado_em: null, dados_apagados_em: null, exportacao_final_caminho: null }],
    leads: [],
    empreendimentos: [],
    corretores: [],
    vendas: [],
    admin_eventos: [],
  });
  (banco.cliente as unknown as Record<string, unknown>).storage = {
    from: () => ({
      createSignedUrl: async (caminho: string) => {
        linksAssinados.push(caminho);
        return { data: { signedUrl: `https://storage/${caminho}?token=x` }, error: null };
      },
    }),
  };
});

const grupo = () => banco.tabelas.grupos[0];

describe("planilha do grupo pela plataforma", () => {
  it("antes de 24 horas do cancelamento, recusa e diz quando libera", async () => {
    grupo().cancelado_em = horasAtras(1);
    const r = await pedir();
    expect(r.status).toBe(403);
    expect(await r.text()).toMatch(/24 horas/);
    expect(banco.tabelas.admin_eventos).toEqual([]);
  });

  it("depois de 24 horas, entrega e registra no grupo", async () => {
    grupo().cancelado_em = horasAtras(25);
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(banco.tabelas.admin_eventos.map((e) => e.acao)).toEqual(["dados_do_grupo_exportados"]);
  });

  it("a cópia guardada só sai com um evento da plataforma, gravado antes", async () => {
    Object.assign(grupo(), {
      cancelado_em: "2026-05-01T00:00:00Z",
      dados_apagados_em: "2026-08-01T00:00:00Z",
      exportacao_final_caminho: `${G}/final-2026-08-01.xlsx`,
    });
    const r = await pedir();
    expect(r.status).toBe(302);
    expect(linksAssinados).toEqual([`${G}/final-2026-08-01.xlsx`]);
    expect(banco.tabelas.admin_eventos).toEqual([
      expect.objectContaining({
        grupo_id: null,
        acao: "copia_final_baixada",
        ator_plataforma_user_id: "operador-1",
        detalhes: { origem: "plataforma", slug: "silva" },
      }),
    ]);
  });

  it("a cópia já apagada pela rotina responde 410 com a data", async () => {
    Object.assign(grupo(), {
      cancelado_em: "2026-05-01T00:00:00Z",
      dados_apagados_em: "2026-08-01T00:00:00Z",
      exportacao_final_caminho: null,
      copia_final_apagada_em: "2026-08-31T12:00:00Z",
    });
    const r = await pedir();
    expect(r.status).toBe(410);
    expect(await r.text()).toMatch(/31\/08\/2026/);
    expect(linksAssinados).toEqual([]);
  });
});
