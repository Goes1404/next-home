import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * A 0245 (portais, aviso de match e vitrine, 29/10/2026) segue o molde das
 * tabelas de grupo: carimbo da 0191, policy restritiva da 0193, nada para o
 * `anon`, e as credenciais (token do portal) sem grant nenhum para o painel.
 * `isolamento.db.test.ts` confere no banco; esta guarda lê o texto.
 */

const SQL = readFileSync(join(process.cwd(), "supabase/migrations/0245_portais_e_vitrine.sql"), "utf8");
const TABELAS = ["integracoes_de_portais", "portais_recebimentos", "avisos_de_match", "vitrine_visualizacoes"];

describe("0245: tabelas de grupo", () => {
  for (const t of TABELAS) {
    it(`${t}: grupo obrigatório, carimbo, isolamento e nada para o anon`, () => {
      expect(SQL).toMatch(new RegExp(`create table if not exists public\\.${t} \\([\\s\\S]*?grupo_id\\s+uuid not null references public\\.grupos`));
      expect(SQL).toContain(`create trigger ${t}_00_grupo`);
      expect(SQL).toMatch(new RegExp(`create trigger ${t}_00_grupo[\\s\\S]*?execute function public\\.carimbar_grupo\\(`));
      expect(SQL).toContain(`create trigger ${t}_zz_grupo_update`);
      expect(SQL).toMatch(new RegExp(`create policy isolamento_por_grupo on public\\.${t} as restrictive for all to authenticated`));
      expect(SQL).toContain(`revoke all on public.${t} from anon;`);
      expect(SQL).toContain(`alter table public.${t} enable row level security;`);
    });
  }

  it("o token do portal e os recibos não têm grant para o painel (só a chave de serviço)", () => {
    for (const t of ["integracoes_de_portais", "portais_recebimentos", "avisos_de_match"]) {
      expect(SQL).not.toMatch(new RegExp(`grant [^;]* on public\\.${t} to authenticated`));
    }
    // As visualizações a ficha lê pela sessão: só leitura, dono ou gestor.
    expect(SQL).toContain("grant select on public.vitrine_visualizacoes to authenticated;");
    expect(SQL).not.toMatch(/grant (insert|update|delete|all)[^;]* on public\.vitrine_visualizacoes to authenticated/);
    expect(SQL).toMatch(/for select to authenticated\s+using \(corretor_id = \(select public\.corretor_atual\(\)\) or \(select public\.eh_gestor\(\)\)\)/);
  });

  it("a 0245 não cria função security definer (nada para funcoesSeguras)", () => {
    expect(SQL).not.toMatch(/security definer/i);
  });

  it("a migration não depende da 0244 (grupos.ramo, outra frente)", () => {
    const semComentarios = SQL.replace(/--.*$/gm, "");
    expect(semComentarios).not.toMatch(/\bramo\b/);
  });
});

describe("visualização da vitrine: grava só o que o token validou", () => {
  it("lead e corretor do link, sem IP; robô não grava; repetição do dia é silenciosa", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    const inseridos: Record<string, unknown>[] = [];
    let erro: { code: string; message: string } | null = null;
    const supabase = {
      from: (tabela: string) => ({
        insert: async (linha: Record<string, unknown>) => {
          expect(tabela).toBe("vitrine_visualizacoes");
          inseridos.push(linha);
          return { error: erro };
        },
      }),
    };
    process.env.SUPABASE_SECRET_KEY ??= "segredo-de-teste";
    const { registrarVisualizacaoDaVitrine } = await import("@/lib/crm/visualizacoesDaVitrine");
    const pessoa = new Headers({ "x-forwarded-for": "187.10.20.30", "user-agent": "Mozilla/5.0 (Android 14) Chrome/126" });
    const base = { token: "tok", leadId: "lead-1", corretorId: "cor-1", empreendimentoId: "imovel-1" };

    await registrarVisualizacaoDaVitrine(supabase as never, { ...base, headers: pessoa });
    expect(inseridos).toHaveLength(1);
    expect(inseridos[0]).toMatchObject({ token: "tok", lead_id: "lead-1", corretor_id: "cor-1", empreendimento_id: "imovel-1" });
    expect(Object.keys(inseridos[0]).sort()).toEqual(["corretor_id", "dia", "empreendimento_id", "lead_id", "token", "visitante"]);
    expect(JSON.stringify(inseridos[0])).not.toContain("187.10");
    // O grupo NÃO vai do código: o carimbo pelo token decide (0191).
    expect(inseridos[0]).not.toHaveProperty("grupo_id");

    await registrarVisualizacaoDaVitrine(supabase as never, {
      ...base,
      headers: new Headers({ "user-agent": "facebookexternalhit/1.1" }),
    });
    expect(inseridos).toHaveLength(1);

    const aviso = vi.spyOn(console, "warn").mockImplementation(() => {});
    erro = { code: "23505", message: "duplicate key" };
    await registrarVisualizacaoDaVitrine(supabase as never, { ...base, headers: pessoa });
    expect(aviso).not.toHaveBeenCalled();
    aviso.mockRestore();
  });
});
