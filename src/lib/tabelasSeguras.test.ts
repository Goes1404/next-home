import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guarda das tabelas: nenhuma nova pode ficar escrevível pela chave pública.
 *
 * ## O defeito, medido
 *
 * Varredura de 01/09/2026 em `information_schema.table_privileges`: **30
 * das 31 tabelas do schema `public` davam INSERT, UPDATE, DELETE e TRUNCATE
 * ao `anon`** — a chave que vai no bundle JavaScript do site por desenho.
 * `leads` era a única exceção, e só porque a 0022 já tinha feito isso para
 * ela. É o default do Supabase para tabela criada no `public`, o mesmo que
 * a 0077 achou nas views e a 0080 na fila de candidatos.
 *
 * Não era explorável: a RLS segurava, porque as únicas policies de escrita
 * que o `anon` alcança são as duas intencionais (formulário público de lead
 * e clique de WhatsApp). Mas isso deixa UMA linha de defesa — e basta uma
 * policy futura escrita sem `to authenticated` para a porta abrir calada.
 *
 * A 0082 varreu tudo o que existia. Este teste cobra o que vier DEPOIS: a
 * varredura é um laço sobre `pg_tables` no momento em que rodou, então
 * tabela criada em migration posterior herda o default de novo.
 *
 * Mesma classe de `viewsSeguras.test.ts` — a regressão falha calada: build
 * passa, tela funciona, e só um `curl` com a chave pública revelaria.
 */

const DIR = join(process.cwd(), "supabase", "migrations");

/** A migration que varreu os grants de escrita do `anon`. */
const VARREDURA = 82;

/**
 * Escrita pelo `anon` que é o PRODUTO, não descuido: o formulário público
 * de lead e o registro de clique em "falar no WhatsApp". Exceção declarada,
 * pela mesma razão da lista RESERVADOS de `migrations.test.ts`.
 */
const ESCRITA_PUBLICA_INTENCIONAL = new Set(["leads", "cliques_whatsapp"]);

function migrations(): { numero: number; sql: string }[] {
  return readdirSync(DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((n) => ({ numero: Number(n.slice(0, 4)), sql: readFileSync(join(DIR, n), "utf8") }));
}

/** Tabelas criadas depois da varredura — as que herdam o default de novo. */
function tabelasNovas(): string[] {
  const nomes = migrations()
    .filter(({ numero }) => numero > VARREDURA)
    .flatMap(({ sql }) =>
      [...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(\w+)/gi)].map(
        (m) => m[1],
      ),
    );

  return [...new Set(nomes)].filter((t) => !ESCRITA_PUBLICA_INTENCIONAL.has(t));
}

describe("tabela nova não nasce escrevível pela chave pública", () => {
  const sql = migrations()
    .map(({ sql: s }) => s)
    .join("\n");

  it("a varredura da 0082 está no repositório, não só no banco", () => {
    // Sem o arquivo, o teste abaixo passaria por vacuidade e ninguém saberia
    // que a proteção existe só em produção.
    expect(/revoke\s+insert,\s*update,\s*delete,\s*truncate\s+on\s+public\.%I\s+from\s+anon/i.test(sql)).toBe(
      true,
    );
  });

  const novas = tabelasNovas();

  it.each(novas.length > 0 ? novas : [["(nenhuma tabela nova ainda)"]].flat())(
    "%s revoga a escrita do anon",
    (tabela) => {
      if (tabela.startsWith("(")) return; // nada criado depois da varredura ainda

      const temRevoke = new RegExp(
        `revoke[^;]*\\bon\\s+public\\.${tabela}\\b[^;]*from[^;]*\\banon\\b`,
        "i",
      ).test(sql);

      expect(
        temRevoke,
        `A tabela "${tabela}" foi criada depois da varredura da 0082 e herda o grant ` +
          `padrão do Supabase para o papel anon. Acrescente à migration: ` +
          `revoke all on public.${tabela} from anon; — e, se ela for mesmo de ` +
          `escrita pública, declare a exceção em ESCRITA_PUBLICA_INTENCIONAL.`,
      ).toBe(true);
    },
  );
});

/**
 * Grant por COLUNA só vale se o grant de TABELA sair antes (0116).
 *
 * O Supabase dá ao `authenticated`, por privilégio padrão, ALL em toda
 * tabela nova. Grant de tabela cobre todas as colunas, então um
 * `grant update (a, b)` sem `revoke ... from authenticated` antes é
 * decorativo: a 0114 "protegia" `comissao_recebida_em` assim, e medido no
 * banco o corretor podia marcar a própria comissão como recebida.
 */
describe("grant por coluna vem com o revoke da tabela", () => {
  const instrucoes = migrations().flatMap(({ sql: s }) =>
    s
      .replace(/--[^\n]*/g, "")
      .split(";")
      .map((st) => st.replace(/\s+/g, " ").trim()),
  );

  const comGrantPorColuna = [
    ...new Set(
      instrucoes.flatMap((st) => {
        const m = /grant\s+(?:insert|update)\s*\([^)]*\)\s*on\s+(?:table\s+)?(?:public\.)?(\w+)\s+to\s+[^;]*\bauthenticated\b/i.exec(st);
        return m ? [m[1]] : [];
      }),
    ),
  ];

  it("encontra as tabelas com grant por coluna (a guarda não está cega)", () => {
    expect(comGrantPorColuna).toEqual(expect.arrayContaining(["leads", "vendas", "venda_participantes", "metas_corretor"]));
  });

  it.each(comGrantPorColuna)("%s retira do authenticated o grant de tabela", (tabela) => {
    const revoga = instrucoes.some((st) =>
      new RegExp(
        `^revoke\\b.*\\b(update|all)\\b.*\\bon\\s+(?:table\\s+)?(?:public\\.)?${tabela}\\b.*\\bfrom\\b.*\\bauthenticated\\b`,
        "i",
      ).test(st),
    );
    expect(
      revoga,
      `"${tabela}" concede insert/update por coluna ao authenticated, mas nenhuma migration ` +
        `revoga o grant de TABELA que o Supabase dá por padrão. Sem isso o grant por coluna ` +
        `não restringe nada. Acrescente: revoke all on public.${tabela} from authenticated; ` +
        `antes dos grants.`,
    ).toBe(true);
  });
});
