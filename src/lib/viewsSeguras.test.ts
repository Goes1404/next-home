import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda das views: nenhuma pode nascer legível sem login.
 *
 * ## O defeito que já aconteceu
 *
 * Revisão de segurança em 01/09/2026: `whatsapp_funil_metricas` e
 * `whatsapp_resposta_metricas` estavam legíveis pelo papel `anon` — a chave
 * pública do Supabase, que por desenho vai no bundle JavaScript do site.
 * Provado com `set local role anon`: as duas devolviam linha. Vazava o
 * retrato da operação (conversas, atendimento da IA, mediana de resposta,
 * degraus do funil).
 *
 * Duas causas somadas, e as duas se repetem sozinhas:
 *
 * 1. View criada sem `revoke` herda os privilégios padrão do schema
 *    `public` do Supabase, que incluem `anon`. Vale para toda view nova —
 *    e `drop view` + `create view` REPÕE o problema, porque recriar zera o
 *    que havia (foi assim que a 0072 desfez sem querer).
 * 2. View em Postgres roda com os privilégios de quem a CRIOU, não de quem
 *    consulta: ela atravessa a RLS das tabelas de baixo.
 *    `security_invoker = on` devolve a RLS para quem consulta.
 *
 * Este teste lê as migrations e cobra as duas coisas de toda view do schema
 * `public`. É a mesma classe de guarda que `migrations.test.ts` e
 * `escalaDoPainel.test.ts`: a regressão falharia CALADA — o build passa, a
 * tela funciona, e só um `curl` com a chave pública revelaria.
 */

const DIR = join(process.cwd(), "supabase", "migrations");

function sqlDeTodasAsMigrations(): string {
  return readdirSync(DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) => readFileSync(join(DIR, n), "utf8"))
    .join("\n");
}

/** Os nomes de view criados em qualquer migration. */
function viewsCriadas(sql: string): string[] {
  const nomes = [...sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+public\.(\w+)/gi)].map(
    (m) => m[1],
  );
  return [...new Set(nomes)];
}

describe("nenhuma view fica legível sem login", () => {
  const sql = sqlDeTodasAsMigrations();
  const views = viewsCriadas(sql);

  it("há views para conferir — se este teste quebrar, o regex parou de casar", () => {
    expect(views.length).toBeGreaterThan(0);
  });

  it.each(viewsCriadas(sqlDeTodasAsMigrations()))(
    "%s tem o SELECT revogado de anon",
    (view) => {
      const temRevoke = new RegExp(
        `revoke\\s+select\\s+on\\s+public\\.${view}\\s+from\\s+[^;]*\\banon\\b`,
        "i",
      ).test(sql);
      expect(temRevoke).toBe(true);
    },
  );

  it.each(viewsCriadas(sqlDeTodasAsMigrations()))(
    "%s roda com a RLS de quem consulta (security_invoker)",
    (view) => {
      const temInvoker = new RegExp(
        `alter\\s+view\\s+public\\.${view}\\s+set\\s*\\(\\s*security_invoker\\s*=\\s*on`,
        "i",
      ).test(sql);
      expect(temInvoker).toBe(true);
    },
  );
});
