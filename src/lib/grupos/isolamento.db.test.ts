// Isolamento entre grupos, medido no banco local (`npm run db:teste`).
//
// Pula sem DB_TESTE_URL, para `npm test` continuar rodando sem Docker. Cada
// teste roda numa transação desfeita no fim (ver apoioDoBanco.ts).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql, TransactionSql } from "postgres";
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

  // O código no ar insere corretor sem grupo_id (cadastrar corretor pelo
  // painel, admin/acoes.ts, pela chave de serviço). A 0181 tem de deixá-lo
  // funcionando sozinha, sem esperar a migration seguinte.
  it("cadastro de corretor sem grupo, com um grupo só, cai nele", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const [{ todos }] = await tx<{ todos: number }[]>`select count(*)::int as todos from grupos`;
      expect(todos).toBe(1);

      const [{ grupo_id }] = await tx<{ grupo_id: string }[]>`
        insert into public.corretores (nome, creci, whatsapp, slug, ativo)
        values ('Corretor sem grupo', 'TESTE-sem-grupo', '5511900000001', 'corretor-sem-grupo', true)
        returning grupo_id
      `;
      expect(grupo_id).toBe(GRUPO_NEXT_HOME_ID);
    });
  });

  it("sem login e com dois grupos, cadastro de corretor sem grupo falha", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      await criarGrupo(tx, { slug: "b" });
      await expect(
        tx`
          insert into public.corretores (nome, creci, whatsapp, slug, ativo)
          values ('Corretor sem grupo', 'TESTE-sem-grupo', '5511900000001', 'corretor-sem-grupo', true)
        `,
      ).rejects.toThrow(/grupo_id obrigatório em corretores/);
    });
  });

  it("com login, o corretor novo nasce no grupo de quem cadastra", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "b" });
      // Papel continua postgres (só ele insere em corretores); o que muda é
      // a sessão, que é de onde `grupo_atual()` tira o grupo.
      await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: b.gestorUserId, role: "authenticated" })}, true)`;
      const [{ grupo_id }] = await tx<{ grupo_id: string }[]>`
        insert into public.corretores (nome, creci, whatsapp, slug, ativo)
        values ('Corretor de B', 'TESTE-b-novo', '5511900000002', 'b-novo', true)
        returning grupo_id
      `;
      expect(grupo_id).toBe(b.grupoId);
    });
  });

  it("corretor desativado perde o grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "b" });
      // `garantir_gestor_remanescente` (0030) ainda conta gestores do banco
      // inteiro, e no banco de teste o gestor de B é o único: sem outro
      // gestor ativo, desativá-lo seria recusado antes de medir alguma coisa.
      // O corretor de B vira gestor e serve também de contraste: ativo, ele
      // continua com grupo e com papel.
      await tx`update corretores set papel = 'gestor' where id = ${b.corretorId}`;
      await tx`update corretores set ativo = false where id = ${b.gestorId}`;

      const desativado = await comoUsuario(tx, b.gestorUserId, (eu) =>
        eu<{ grupo: string | null; corretor: string | null; gestor: boolean }[]>`
          select public.grupo_atual() as grupo, public.corretor_atual() as corretor,
                 public.eh_gestor() as gestor
        `,
      );
      expect(desativado).toEqual([{ grupo: null, corretor: null, gestor: false }]);

      const ativo = await comoUsuario(tx, b.corretorUserId, (eu) =>
        eu<{ grupo: string | null; corretor: string | null; gestor: boolean }[]>`
          select public.grupo_atual() as grupo, public.corretor_atual() as corretor,
                 public.eh_gestor() as gestor
        `,
      );
      expect(ativo).toEqual([{ grupo: b.grupoId, corretor: b.corretorId, gestor: true }]);
    });
  });

  it("a chave pública não executa grupo_atual", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      await tx`set local role anon`;
      await expect(tx`select public.grupo_atual()`).rejects.toThrow(/permission denied/);
    });
  });

  it("administrador da plataforma: só a tabela decide, e ninguém a lê pela API", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "b" });
      const antes = await comoUsuario(tx, b.gestorUserId, (eu) =>
        eu<{ admin: boolean }[]>`select public.eh_admin_da_plataforma() as admin`,
      );
      // Gestor de grupo não é administrador da plataforma.
      expect(antes).toEqual([{ admin: false }]);

      await tx`insert into public.administradores_da_plataforma (user_id) values (${b.gestorUserId})`;
      const depois = await comoUsuario(tx, b.gestorUserId, (eu) =>
        eu<{ admin: boolean }[]>`select public.eh_admin_da_plataforma() as admin`,
      );
      expect(depois).toEqual([{ admin: true }]);

      await expect(
        comoUsuario(tx, b.gestorUserId, (eu) => eu`select user_id from public.administradores_da_plataforma`),
      ).rejects.toThrow(/permission denied/);
      await tx`set local role anon`;
      await expect(tx`select user_id from public.administradores_da_plataforma`).rejects.toThrow(
        /permission denied/,
      );
    });
  });

  it("gestor muda só as taxas do próprio grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "b" });
      // Grupo novo nasce com a cópia das taxas da Next Home na fase 2; aqui
      // a cópia é feita à mão.
      await tx`
        insert into public.parametros_credito (
          grupo_id, faixas, teto_fgts_imovel, taxa_sbpe_anual, prazo_maximo_meses,
          comprometimento_maximo, itbi_por_cidade, conferido_em
        )
        select ${b.grupoId}, faixas, teto_fgts_imovel, taxa_sbpe_anual, prazo_maximo_meses,
               comprometimento_maximo, itbi_por_cidade, conferido_em
          from public.parametros_credito where grupo_id = ${GRUPO_NEXT_HOME_ID}
      `;
      const nextHomeAntes = await tx`
        select * from public.parametros_credito where grupo_id = ${GRUPO_NEXT_HOME_ID}
      `;
      expect(nextHomeAntes).toHaveLength(1);

      const atualizar = (eu: TransactionSql) => eu<{ ok: boolean }[]>`
        select public.atualizar_parametros_credito(
          '[{"nome":"Faixa 1","rendaMax":3000,"subsidioMaximo":50000,"taxaAnual":0.05}]'::jsonb,
          400000, 0.1300, 360, 0.30, '{"Barueri":0.02}'::jsonb, date '2026-10-19'
        ) as ok
      `;
      // `comoUsuario` desfaz tudo no fim, então o efeito é lido lá dentro,
      // depois de voltar a `postgres` (que enxerga as duas linhas).
      const { gravou, deB, nextHomeDepois } = await comoUsuario(tx, b.gestorUserId, async (eu) => {
        const gravou = await atualizar(eu);
        await eu`reset role`;
        const [deB] = await eu<{ taxa: string; conferido_por: string }[]>`
          select taxa_sbpe_anual::text as taxa, conferido_por
            from public.parametros_credito where grupo_id = ${b.grupoId}
        `;
        const nextHomeDepois = await eu`
          select * from public.parametros_credito where grupo_id = ${GRUPO_NEXT_HOME_ID}
        `;
        return { gravou, deB, nextHomeDepois };
      });
      expect(gravou).toEqual([{ ok: true }]);
      expect(deB).toEqual({ taxa: "0.1300", conferido_por: b.gestorId });
      expect(nextHomeDepois).toEqual(nextHomeAntes);

      await expect(comoUsuario(tx, b.corretorUserId, atualizar)).rejects.toThrow(
        /gestor ativo do grupo/,
      );
    });
  });

  it("logado lê só as taxas do próprio grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "b" });
      await tx`
        insert into public.parametros_credito (
          grupo_id, faixas, teto_fgts_imovel, taxa_sbpe_anual, prazo_maximo_meses,
          comprometimento_maximo, itbi_por_cidade, conferido_em
        )
        select ${b.grupoId}, faixas, teto_fgts_imovel, taxa_sbpe_anual, prazo_maximo_meses,
               comprometimento_maximo, itbi_por_cidade, conferido_em
          from public.parametros_credito where grupo_id = ${GRUPO_NEXT_HOME_ID}
      `;
      const visiveis = await comoUsuario(tx, b.corretorUserId, (eu) =>
        eu<{ grupo_id: string }[]>`select grupo_id from public.parametros_credito`,
      );
      expect(visiveis).toEqual([{ grupo_id: b.grupoId }]);
    });
  });

  it("o aviso do grupo único chega a quem pede os avisos", async () => {
    const avisos: string[] = [];
    const comAvisos = conectar({ avisos });
    try {
      await emTransacaoDesfeita(comAvisos, async (tx) => {
        await tx`
          insert into public.corretores (nome, creci, whatsapp, slug, ativo)
          values ('Corretor sem grupo', 'TESTE-aviso', '5511900000003', 'corretor-aviso', true)
        `;
      });
    } finally {
      await comAvisos.end();
    }
    expect(avisos).toContain("grupo_id inferido pelo grupo único em corretores");
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
