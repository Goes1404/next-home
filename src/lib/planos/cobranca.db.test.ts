// A cobrança manual (0207), medida no banco local (`npm run db:teste`).
//
// Os pagamentos moram numa tabela que só a chave de serviço toca; o grupo
// novo nasce com o mês do cadastro pago (gatilho) e vencendo no dia do
// cadastro; os grupos que já existiam não nascem em atraso.
//
// Pula sem DB_TESTE_URL. Cada teste roda numa transação desfeita no fim.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import { comoUsuario, conectar, criarGrupo, emTransacaoDesfeita, soltarSuite, travarSuite } from "@/lib/grupos/apoioDoBanco";

describe.skipIf(!process.env.DB_TESTE_URL)("cobrança manual (0207)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("grupo novo vence no dia do cadastro (no máximo 28) e nasce com o mês do cadastro pago", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "cobr-novo" });
      const [g] = await tx<{ dia: number; hoje: number }[]>`
        select dia_do_vencimento as dia,
               least(extract(day from (now() at time zone 'America/Sao_Paulo')), 28)::int as hoje
          from public.grupos where id = ${a.grupoId}
      `;
      expect(g.dia).toBe(g.hoje);

      const pagos = await tx<{ competencia: string; valor: string }[]>`
        select competencia::text, valor::text
          from public.pagamentos_do_grupo where grupo_id = ${a.grupoId}
      `;
      expect(pagos).toHaveLength(1);
      expect(pagos[0].valor).toBe("0.00");
      const [{ mes }] = await tx<{ mes: string }[]>`
        select date_trunc('month', now() at time zone 'America/Sao_Paulo')::date::text as mes
      `;
      expect(pagos[0].competencia).toBe(mes);
    });
  });

  it("os grupos que já existiam não nascem em atraso: o mês corrente está coberto", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const sem = await tx<{ id: string }[]>`
        select g.id from public.grupos g
         where not exists (
           select 1 from public.pagamentos_do_grupo p
            where p.grupo_id = g.id
              and p.competencia = date_trunc('month', now() at time zone 'America/Sao_Paulo')::date
         )
      `;
      expect(sem).toEqual([]);
    });
  });

  it("as regras do banco: dia 1 a 28, valores sem sinal, competência no dia 1º, uma por mês", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "cobr-regras" });
      await tx`update public.grupos set dia_do_vencimento = 28, mensalidade = 299.9 where id = ${a.grupoId}`;
      for (const dia of [0, 29]) {
        await expect(
          tx.savepoint((sp) => sp`update public.grupos set dia_do_vencimento = ${dia} where id = ${a.grupoId}`),
        ).rejects.toThrow(/check/);
      }
      await expect(
        tx.savepoint((sp) => sp`update public.grupos set mensalidade = -1 where id = ${a.grupoId}`),
      ).rejects.toThrow(/check/);

      const inserir = (competencia: string, valor: number) =>
        tx.savepoint(
          (sp) =>
            sp`insert into public.pagamentos_do_grupo (grupo_id, competencia, valor, pago_em)
               values (${a.grupoId}, ${competencia}::date, ${valor}, '2030-01-05')`,
        );
      await inserir("2030-01-01", 250);
      await expect(inserir("2030-01-01", 250)).rejects.toThrow(/unique|duplicate/);
      await expect(inserir("2030-02-15", 250)).rejects.toThrow(/check/);
      await expect(inserir("2030-03-01", -5)).rejects.toThrow(/check/);
    });
  });

  it("o pagamento acompanha o grupo: apagar o grupo apaga os pagamentos", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "cobr-cascata" });
      expect((await tx`select 1 from public.pagamentos_do_grupo where grupo_id = ${a.grupoId}`).length).toBeGreaterThan(0);
      await tx`delete from public.corretores where grupo_id = ${a.grupoId}`;
      await tx`delete from public.grupos where id = ${a.grupoId}`;
      expect(await tx`select 1 from public.pagamentos_do_grupo where grupo_id = ${a.grupoId}`).toHaveLength(0);
    });
  });

  it("ninguém lê nem escreve pagamento pela API, nem o gestor do próprio grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "cobr-api" });
      for (const userId of [a.gestorUserId, a.corretorUserId]) {
        await expect(comoUsuario(tx, userId, (eu) => eu`select * from public.pagamentos_do_grupo`)).rejects.toThrow(
          /permission denied/,
        );
        await expect(
          comoUsuario(
            tx,
            userId,
            (eu) =>
              eu`insert into public.pagamentos_do_grupo (grupo_id, competencia, valor, pago_em)
                 values (${a.grupoId}, '2031-01-01', 1, '2031-01-02')`,
          ),
        ).rejects.toThrow(/permission denied/);
      }

      const [privs] = await tx<{ anon: boolean; logado: boolean; mensalidade: boolean; dia: boolean }[]>`
        select has_table_privilege('anon', 'public.pagamentos_do_grupo', 'select') as anon,
               has_table_privilege('authenticated', 'public.pagamentos_do_grupo', 'select') as logado,
               has_column_privilege('authenticated', 'public.grupos', 'mensalidade', 'select') as mensalidade,
               has_column_privilege('authenticated', 'public.grupos', 'dia_do_vencimento', 'select') as dia
      `;
      expect(privs).toEqual({ anon: false, logado: false, mensalidade: false, dia: false });
    });
  });

  it("o gatilho não é chamável pela API", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const [p] = await tx<{ logado: boolean; anon: boolean }[]>`
        select has_function_privilege('authenticated', 'public.registrar_primeira_mensalidade()', 'execute') as logado,
               has_function_privilege('anon', 'public.registrar_primeira_mensalidade()', 'execute') as anon
      `;
      expect(p).toEqual({ logado: false, anon: false });
    });
  });

  it("admin_eventos aceita as ações da cobrança e continua recusando as desconhecidas", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "cobr-eventos" });
      for (const acao of ["pagamento_registrado", "pagamento_removido", "grupo_suspenso", "grupo_reativado"]) {
        await tx`insert into public.admin_eventos (acao, grupo_id, detalhes) values (${acao}, ${a.grupoId}, '{}'::jsonb)`;
      }
      await expect(
        tx.savepoint(
          (sp) => sp`insert into public.admin_eventos (acao, grupo_id, detalhes) values ('pagamento_inventado', ${a.grupoId}, '{}'::jsonb)`,
        ),
      ).rejects.toThrow(/check/);
    });
  });
});
