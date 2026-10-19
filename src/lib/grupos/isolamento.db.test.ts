// Isolamento entre grupos, medido no banco local (`npm run db:teste`).
//
// Pula sem DB_TESTE_URL, para `npm test` continuar rodando sem Docker. Cada
// teste roda numa transação desfeita no fim (ver apoioDoBanco.ts).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import { comoUsuario, conectar, criarGrupo, emTransacaoDesfeita } from "./apoioDoBanco";
import { GRUPO_NEXT_HOME_ID } from "./grupo";

describe.skipIf(!process.env.DB_TESTE_URL)("isolamento entre grupos", () => {
  let sql: Sql;

  beforeAll(() => {
    sql = conectar();
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("o grupo da Next Home existe com o id fixo", async () => {
    const linhas = await sql<{ id: string; slug: string; nome: string; tipo: string }[]>`
      select id, slug, nome, tipo from grupos where id = ${GRUPO_NEXT_HOME_ID}
    `;
    expect(linhas).toEqual([
      { id: GRUPO_NEXT_HOME_ID, slug: "next-home", nome: "Next Home", tipo: "imobiliaria" },
    ]);
  });

  it("todo corretor tem grupo", async () => {
    const [{ sem_grupo }] = await sql<{ sem_grupo: number }[]>`
      select count(*)::int as sem_grupo from corretores where grupo_id is null
    `;
    expect(sem_grupo).toBe(0);
  });

  it("grupo_atual devolve o grupo de quem está logado", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "b" });
      const [{ grupo }] = await comoUsuario(tx, b.gestorUserId, (eu) =>
        eu<{ grupo: string | null }[]>`select public.grupo_atual() as grupo`,
      );
      expect(grupo).toBe(b.grupoId);
      expect(grupo).not.toBe(GRUPO_NEXT_HOME_ID);
    });
  });

  it("usuário só enxerga o próprio grupo em grupos", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "b" });
      // Sem o grupo B, a contagem daria 1 por enxergar só a Next Home (ou
      // nada): com dois grupos no banco, 1 só pode ser o recorte da policy.
      const [{ todos }] = await tx<{ todos: number }[]>`select count(*)::int as todos from grupos`;
      expect(todos).toBeGreaterThanOrEqual(2);

      const visiveis = await comoUsuario(tx, b.corretorUserId, (eu) =>
        eu<{ id: string }[]>`select id from grupos`,
      );
      expect(visiveis).toEqual([{ id: b.grupoId }]);
    });
  });

  it("a chave pública não lê grupos", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      await tx`set local role anon`;
      await expect(tx`select id from grupos`).rejects.toThrow(/permission denied/);
    });
  });

  it("o apoio desfaz tudo: papel volta a postgres e o grupo de teste some", async () => {
    // Sem isto, um teste que esquecesse de desfazer o papel rodaria o
    // seguinte como `authenticated`, e o grupo B de um vazaria para o outro.
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "b" });
      await comoUsuario(tx, b.gestorUserId, async () => null);
      const [{ papel }] = await tx<{ papel: string }[]>`select current_user as papel`;
      expect(papel).toBe("postgres");
    });
    const [{ grupos }] = await sql<{ grupos: number }[]>`
      select count(*)::int as grupos from grupos where slug = 'b'
    `;
    expect(grupos).toBe(0);
  });
});
