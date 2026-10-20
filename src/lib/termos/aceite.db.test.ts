// O aceite dos termos de uso (0198), medido no banco local (`npm run db:teste`).
// Quem aceita é o próprio corretor; o grupo e a data são do banco; aceite não
// se desfaz; um grupo não lê o aceite do outro.
//
// Pula sem DB_TESTE_URL. Cada teste roda numa transação desfeita no fim.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import {
  comoUsuario,
  conectar,
  criarGrupo,
  emTransacaoDesfeita,
  soltarSuite,
  travarSuite,
  type Conexao,
} from "@/lib/grupos/apoioDoBanco";

async function recusa(tx: Conexao, fn: (t: Conexao) => Promise<unknown>): Promise<string | null> {
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp);
    });
    return null;
  } catch (erro) {
    return (erro as Error).message;
  }
}

describe.skipIf(!process.env.DB_TESTE_URL)("aceite dos termos de uso (0198)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("o corretor grava o próprio aceite, com o grupo e a data do banco", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "termos-a" });
      await comoUsuario(tx, a.corretorUserId, async (u) => {
        await u`insert into public.aceites_de_termos (corretor_id, versao) values (${a.corretorId}, 'v-teste')`;
        const linhas = await u<{ grupo_id: string; aceito_em: Date }[]>`
          select grupo_id, aceito_em from public.aceites_de_termos where corretor_id = ${a.corretorId}
        `;
        expect(linhas).toHaveLength(1);
        expect(linhas[0].grupo_id).toBe(a.grupoId);
        expect(linhas[0].aceito_em).toBeInstanceOf(Date);
      });
    });
  });

  it("ninguém aceita em nome de outro, nem escolhe a data, nem desfaz", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "termos-outro" });
      const emNomeDoGestor = await recusa(tx, (t) =>
        comoUsuario(t, a.corretorUserId, (u) => u`
          insert into public.aceites_de_termos (corretor_id, versao) values (${a.gestorId}, 'v-teste')
        `),
      );
      expect(emNomeDoGestor).toMatch(/row-level security/);

      const comData = await recusa(tx, (t) =>
        comoUsuario(t, a.corretorUserId, (u) => u`
          insert into public.aceites_de_termos (corretor_id, versao, aceito_em)
          values (${a.corretorId}, 'v-teste', '2020-01-01')
        `),
      );
      expect(comData).toMatch(/permission denied/);

      await tx`insert into public.aceites_de_termos (corretor_id, versao) values (${a.corretorId}, 'v-x')`;
      const apagar = await recusa(tx, (t) =>
        comoUsuario(t, a.corretorUserId, (u) => u`delete from public.aceites_de_termos where corretor_id = ${a.corretorId}`),
      );
      expect(apagar).toMatch(/permission denied/);
    });
  });

  it("um grupo não lê o aceite do outro; o gestor lê os da equipe", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "termos-iso-a" });
      const b = await criarGrupo(tx, { slug: "termos-iso-b" });
      await tx`insert into public.aceites_de_termos (corretor_id, versao) values (${a.corretorId}, 'v-teste')`;

      const gestorA = await comoUsuario(tx, a.gestorUserId, (u) =>
        u<{ n: number }[]>`select count(*)::int as n from public.aceites_de_termos`,
      );
      const gestorB = await comoUsuario(tx, b.gestorUserId, (u) =>
        u<{ n: number }[]>`select count(*)::int as n from public.aceites_de_termos`,
      );
      expect(gestorA[0].n).toBe(1);
      expect(gestorB[0].n).toBe(0);

      const anon = await recusa(tx, async (t) => {
        await t`set local role anon`;
        await t`select 1 from public.aceites_de_termos`;
      });
      expect(anon).toMatch(/permission denied/);
    });
  });
});
