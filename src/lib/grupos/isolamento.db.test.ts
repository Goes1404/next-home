// Isolamento entre grupos, medido no banco local (`npm run db:teste`).
//
// Pula sem DB_TESTE_URL, para `npm test` continuar rodando sem Docker. Cada
// teste roda numa transação desfeita no fim (ver apoioDoBanco.ts).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql, TransactionSql } from "postgres";
import { comoUsuario, conectar, criarGrupo, emTransacaoDesfeita, type Conexao } from "./apoioDoBanco";
import { GRUPO_NEXT_HOME_ID } from "./grupo";
import { TABELAS_GLOBAIS } from "./tabelasDoGrupo";

/** Um lead do corretor, gravado como `postgres` (a chave de serviço). */
async function criarLead(sql: Conexao, corretorId: string, nome = "Lead de teste"): Promise<string> {
  const [{ id }] = await sql<{ id: string }[]>`
    insert into public.leads (nome, corretor_id) values (${nome}, ${corretorId}) returning id
  `;
  return id;
}

/** Uma conversa de WhatsApp do lead, no corretor dono dele. */
async function criarConversa(sql: Conexao, corretorId: string, leadId: string): Promise<string> {
  const [{ id }] = await sql<{ id: string }[]>`
    insert into public.whatsapp_conversas (corretor_id, lead_id, telefone_cliente)
    values (${corretorId}, ${leadId}, '5511988887777')
    returning id
  `;
  return id;
}

/** Uma venda do corretor, ligada ao lead quando ele vem. */
async function criarVenda(sql: Conexao, corretorId: string, leadId: string | null): Promise<string> {
  const [{ id }] = await sql<{ id: string }[]>`
    insert into public.vendas (corretor_id, lead_id, valor_venda, data_venda, comissao_valor, imovel_descricao)
    values (${corretorId}, ${leadId}, 500000, date '2026-10-19', 25000, 'Apartamento de teste')
    returning id
  `;
  return id;
}

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

  // -------------------------------------------------------------------------
  // grupo_id em toda tabela (0182)
  // -------------------------------------------------------------------------

  it("toda tabela do public tem grupo_id ou está em TABELAS_GLOBAIS", async () => {
    const linhas = await sql<{ tabela: string; tem: boolean }[]>`
      select c.relname as tabela,
             exists (
               select 1 from pg_attribute a
                where a.attrelid = c.oid and a.attname = 'grupo_id' and not a.attisdropped
             ) as tem
        from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
       order by 1
    `;
    const globais = new Set<string>(TABELAS_GLOBAIS);
    const faltam = linhas.filter((l) => !l.tem && !globais.has(l.tabela)).map((l) => l.tabela);
    expect(faltam, `sem grupo_id e fora de TABELAS_GLOBAIS: ${faltam.join(", ")}`).toEqual([]);
    // E o contrário: tabela declarada global não pode ter ganhado grupo, nem
    // ter deixado de existir (lista que cita tabela morta é comentário velho).
    const existentes = new Map(linhas.map((l) => [l.tabela, l.tem]));
    for (const global of TABELAS_GLOBAIS) {
      expect(existentes.get(global), `TABELAS_GLOBAIS cita ${global}`).toBe(false);
    }
  });

  it("toda tabela com grupo_id tem o gatilho <tabela>_00_grupo e a conferência final", async () => {
    // O carimbo antes, e a conferência da linha final depois de todos os
    // gatilhos `before`, com os MESMOS argumentos (as mães): conferências
    // com listas diferentes divergiriam calado. A de INSERT só existe em
    // tabela com mãe (sem mãe não há o que conferir na linha final).
    const faltas = await sql<{ tabela: string; falta: string }[]>`
      with tabelas as (
        select c.oid, c.relname
          from pg_class c
          join pg_attribute a on a.attrelid = c.oid and a.attname = 'grupo_id' and not a.attisdropped
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
      ), gatilhos as (
        select tb.relname, t.tgname, p.proname, t.tgnargs, t.tgargs
          from tabelas tb
          join pg_trigger t on t.tgrelid = tb.oid and not t.tgisinternal
          join pg_proc p on p.oid = t.tgfoid
      ), carimbo as (
        select * from gatilhos where tgname = relname || '_00_grupo' and proname = 'carimbar_grupo'
      )
      select tb.relname as tabela, f.falta
        from tabelas tb
        left join carimbo k on k.relname = tb.relname
        cross join lateral (
          select '_00_grupo' as falta where k.relname is null
          union all
          select '_zz_grupo_update' where not exists (
            select 1 from gatilhos g
             where g.relname = tb.relname and g.tgname = tb.relname || '_zz_grupo_update'
               and g.proname = 'conferir_grupo_final' and g.tgargs = k.tgargs
          )
          union all
          select '_zz_grupo_insert' where k.tgnargs > 0 and not exists (
            select 1 from gatilhos g
             where g.relname = tb.relname and g.tgname = tb.relname || '_zz_grupo_insert'
               and g.proname = 'conferir_grupo_final' and g.tgargs = k.tgargs
          )
        ) f
       order by 1, 2
    `;
    expect(faltas.map((l) => `${l.tabela}${l.falta}`)).toEqual([]);
  });

  it("lead criado pelo corretor do grupo B nasce no grupo B", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "b" });
      const [{ grupo_id }] = await comoUsuario(tx, b.corretorUserId, (eu) =>
        eu<{ grupo_id: string }[]>`
          insert into public.leads (nome, corretor_id) values ('Lead de B', ${b.corretorId})
          returning grupo_id
        `,
      );
      expect(grupo_id).toBe(b.grupoId);
    });
  });

  it("mensagem herda o grupo da conversa", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "b" });
      const conversa = await criarConversa(tx, b.corretorId, await criarLead(tx, b.corretorId));
      const [{ grupo_id }] = await tx<{ grupo_id: string }[]>`
        insert into public.whatsapp_mensagens (conversa_id, conteudo, remetente)
        values (${conversa}, 'Oi', 'cliente')
        returning grupo_id
      `;
      expect(grupo_id).toBe(b.grupoId);
    });
  });

  it("recusa grupo divergente da linha-mãe", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const leadDeA = await criarLead(tx, a.corretorId);
      await expect(
        tx`
          insert into public.inbound_logs (lead_id, status, grupo_id)
          values (${leadDeA}, 'sucesso', ${b.grupoId})
        `,
      ).rejects.toThrow(/grupo da linha difere do grupo de leads/);
    });
  });

  // Review Focus 2.
  it("mudar o dono para alguém de outro grupo é recusado", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const leadDeB = await criarLead(tx, b.corretorId);
      await expect(
        tx`update public.leads set corretor_id = ${a.corretorId} where id = ${leadDeB}`,
      ).rejects.toThrow(/grupo da linha difere do grupo de corretores/);
    });
  });

  // Review Focus 2, pela roleta. `leads_distribuir` roda DEPOIS do carimbo e
  // escolhe o dono entre todos os corretores: sem a conferência da linha
  // final, o lead de B nasceria com o dono de A. A Task 5 faz a roleta olhar
  // o grupo (o lead fica sem dono dentro dele); até lá, a linha é recusada.
  it("a roleta não dá a um lead o dono de outro grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      // Ninguém de B pode receber: a roleta só acha gente de fora.
      await tx`update public.corretores set em_pausa = true where grupo_id = ${b.grupoId}`;
      await expect(
        tx`insert into public.leads (nome, grupo_id) values ('Lead de B sem dono', ${b.grupoId})`,
      ).rejects.toThrow(/grupo da linha difere do grupo de corretores/);
    });
  });

  it("com um grupo só, a roleta segue distribuindo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const [{ id: corretor }] = await tx<{ id: string }[]>`
        insert into public.corretores (nome, creci, whatsapp, slug, ativo)
        values ('Corretor da roleta', 'TESTE-roleta', '5511900000003', 'corretor-roleta', true)
        returning id
      `;
      const [lead] = await tx<{ corretor_id: string; origem_atribuicao: string; grupo_id: string }[]>`
        insert into public.leads (nome) values ('Lead da roleta')
        returning corretor_id, origem_atribuicao, grupo_id
      `;
      expect(lead).toEqual({ corretor_id: corretor, origem_atribuicao: "roleta", grupo_id: GRUPO_NEXT_HOME_ID });
    });
  });

  // A mesma brecha da roleta, para qualquer gatilho `before` que venha
  // depois do carimbo: escrever o grupo ou uma mãe não passa.
  it("gatilho posterior ao carimbo não troca o grupo nem a mãe", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const leadDeB = await criarLead(tx, b.corretorId);
      const conversa = await criarConversa(tx, b.corretorId, leadDeB);

      await tx.unsafe(`
        create function pg_temp.teste_0182_troca_grupo() returns trigger language plpgsql as $$
        begin
          new.grupo_id := '${a.grupoId}';
          return new;
        end $$
      `);
      await tx`
        create trigger whatsapp_mensagens_zz_teste before insert on public.whatsapp_mensagens
          for each row execute function pg_temp.teste_0182_troca_grupo()
      `;
      await expect(
        tx.savepoint((s) => s`
          insert into public.whatsapp_mensagens (conversa_id, conteudo, remetente)
          values (${conversa}, 'Oi', 'cliente')
        `),
      ).rejects.toThrow(/grupo da linha difere do grupo de whatsapp_conversas/);

      // No UPDATE, o SET nem cita a mãe: quem a muda é o gatilho.
      await tx.unsafe(`
        create function pg_temp.teste_0182_troca_dono() returns trigger language plpgsql as $$
        begin
          new.corretor_id := '${a.corretorId}';
          return new;
        end $$
      `);
      await tx`
        create trigger leads_zz_teste before update on public.leads
          for each row execute function pg_temp.teste_0182_troca_dono()
      `;
      await expect(
        tx.savepoint((s) => s`update public.leads set nome = 'Outro nome' where id = ${leadDeB}`),
      ).rejects.toThrow(/grupo da linha difere do grupo de corretores/);

      await tx`drop trigger leads_zz_teste on public.leads`;
      await tx.unsafe(`
        create function pg_temp.teste_0182_troca_grupo_upd() returns trigger language plpgsql as $$
        begin
          new.grupo_id := '${a.grupoId}';
          return new;
        end $$
      `);
      await tx`
        create trigger leads_zz_teste before update on public.leads
          for each row execute function pg_temp.teste_0182_troca_grupo_upd()
      `;
      await expect(
        tx.savepoint((s) => s`update public.leads set nome = 'Outro nome' where id = ${leadDeB}`),
      ).rejects.toThrow(/grupo_id de leads não muda/);
    });
  });

  // Review Focus 1.
  it("sem linha-mãe e com dois grupos, o insert falha", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      await criarGrupo(tx, { slug: "a" });
      await criarGrupo(tx, { slug: "b" });
      await expect(
        tx`insert into public.inbound_logs (assunto, status) values ('Lead do portal', 'sucesso')`,
      ).rejects.toThrow(/grupo_id obrigatório em inbound_logs/);
    });
  });

  it("com um grupo só, o insert sem grupo cai nele", async () => {
    const avisos: string[] = [];
    const comAvisos = conectar({ avisos });
    try {
      await emTransacaoDesfeita(comAvisos, async (tx) => {
        const [{ todos }] = await tx<{ todos: number }[]>`select count(*)::int as todos from grupos`;
        expect(todos).toBe(1);
        const [{ grupo_id }] = await tx<{ grupo_id: string }[]>`
          insert into public.inbound_logs (assunto, status) values ('Lead do portal', 'sucesso')
          returning grupo_id
        `;
        expect(grupo_id).toBe(GRUPO_NEXT_HOME_ID);
      });
    } finally {
      await comAvisos.end();
    }
    expect(avisos).toContain("grupo_id inferido pelo grupo único em inbound_logs");
  });

  // Review Focus 6.
  it("lead inserido pela chave de serviço com dois grupos gera evento no grupo dele", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const lead = await criarLead(tx, b.corretorId);
      const [{ grupo_id: doLead }] = await tx<{ grupo_id: string }[]>`
        select grupo_id from public.leads where id = ${lead}
      `;
      expect(doLead).toBe(b.grupoId);
      const eventos = await tx<{ grupo_id: string }[]>`
        select grupo_id from public.marketing_eventos where lead_id = ${lead}
      `;
      expect(eventos).toEqual([{ grupo_id: b.grupoId }]);
      const saidas = await tx<{ grupo_id: string }[]>`
        select o.grupo_id from public.event_outbox o
          join public.marketing_eventos e on e.id = o.marketing_evento_id
         where e.lead_id = ${lead}
      `;
      expect(saidas.length).toBeGreaterThan(0);
      expect(new Set(saidas.map((s) => s.grupo_id))).toEqual(new Set([b.grupoId]));
    });
  });

  it("métrica da Meta com grupo explícito cria campanha canônica no mesmo grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const [{ marketing_campanha_id, grupo_id }] = await tx<
        { marketing_campanha_id: string; grupo_id: string }[]
      >`
        insert into public.meta_ads_metricas (dia, campanha_id, campanha_nome, grupo_id)
        values (date '2026-10-19', 'teste-0182-campanha', 'Campanha de teste', ${b.grupoId})
        returning marketing_campanha_id, grupo_id
      `;
      expect(grupo_id).toBe(b.grupoId);
      const [campanha] = await tx<{ grupo_id: string }[]>`
        select grupo_id from public.marketing_campanhas where id = ${marketing_campanha_id}
      `;
      expect(campanha).toEqual({ grupo_id: b.grupoId });
    });
  });

  it("mensagem do estúdio herda o grupo da conversa do estúdio", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const [{ id: conversa }] = await tx<{ id: string }[]>`
        insert into public.estudio_conversas (corretor_id, tipo) values (${b.corretorId}, 'arte')
        returning id
      `;
      const [{ grupo_id }] = await tx<{ grupo_id: string }[]>`
        insert into public.estudio_mensagens (conversa_id, papel, conteudo)
        values (${conversa}, 'corretor', 'Uma arte do decorado')
        returning grupo_id
      `;
      expect(grupo_id).toBe(b.grupoId);
    });
  });

  // Review Focus 7: todas as mães são conferidas, não só a primeira.
  it("FK secundária de outro grupo é recusada", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });

      // Cada recusa num savepoint: erro aborta a transação, e a próxima
      // conferência rodaria numa transação morta.
      await expect(
        tx.savepoint((sp) => sp`
          insert into public.anotacoes (corretor_id, destinatario_id, texto)
          values (${b.corretorId}, ${a.corretorId}, 'Liga para o cliente')
        `),
      ).rejects.toThrow(/grupo da linha difere do grupo de corretores/);

      const vendaDeB = await criarVenda(tx, b.corretorId, null);
      await expect(
        tx.savepoint((sp) => sp`
          insert into public.venda_participantes (venda_id, corretor_id, parte_percentual, repasse_valor)
          values (${vendaDeB}, ${a.corretorId}, 50, 0)
        `),
      ).rejects.toThrow(/grupo da linha difere do grupo de corretores/);

      const [{ id: imovelDeA }] = await tx<{ id: string }[]>`
        insert into public.empreendimentos (nome, slug, bairro, cidade, grupo_id)
        values ('Imóvel de A', 'teste-0182-imovel-a', 'Centro', 'Barueri', ${a.grupoId})
        returning id
      `;
      const leadDeB = await criarLead(tx, b.corretorId);
      await expect(
        tx`update public.leads set empreendimento_id = ${imovelDeA} where id = ${leadDeB}`,
      ).rejects.toThrow(/grupo da linha difere do grupo de empreendimentos/);
    });
  });

  it("UPDATE que não mexe na mãe não reconfere", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const leadDeB = await criarLead(tx, b.corretorId);
      const vendaDeB = await criarVenda(tx, b.corretorId, leadDeB);

      // A fase 5 dá à role a função de saída do corretor; aqui ela ganha, só
      // dentro desta transação, o mínimo para mudar o grupo de um lead.
      await tx`grant transferidor_de_grupo to postgres with set true`;
      await tx`grant select, update on public.leads to transferidor_de_grupo`;
      await tx`
        create policy "teste 0182: transferidor" on public.leads
          for all to transferidor_de_grupo using (true) with check (true)
      `;
      await tx`set local role transferidor_de_grupo`;
      await tx`update public.leads set grupo_id = ${a.grupoId} where id = ${leadDeB}`;
      await tx`reset role`;

      const [{ grupo_id }] = await tx<{ grupo_id: string }[]>`
        select grupo_id from public.leads where id = ${leadDeB}
      `;
      expect(grupo_id).toBe(a.grupoId);

      // A venda segue no grupo B com o lead já no A: só a coluna que muda é
      // conferida, e o status não é coluna-mãe.
      const [venda] = await tx<{ status: string; grupo_id: string }[]>`
        update public.vendas set status = 'distratada', distratada_em = now()
         where id = ${vendaDeB}
        returning status, grupo_id
      `;
      expect(venda).toEqual({ status: "distratada", grupo_id: b.grupoId });
    });
  });

  it("ninguém troca grupo por variável de sessão", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const leadDeB = await criarLead(tx, b.corretorId);
      await tx`select set_config('nexthome.transferindo_grupo', 'on', true)`;
      await expect(
        tx`update public.leads set grupo_id = ${a.grupoId} where id = ${leadDeB}`,
      ).rejects.toThrow(/grupo_id de leads não muda/);
    });
  });

  it("trava de disparo funciona com dois grupos", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      await criarGrupo(tx, { slug: "a" });
      await criarGrupo(tx, { slug: "b" });
      const [{ travou }] = await tx<{ travou: boolean }[]>`
        select public.travar_disparo('teste-0182', 'dono-de-teste', 60) as travou
      `;
      expect(travou).toBe(true);
    });
  });

  it("linha-mãe inexistente é recusada", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      await expect(
        tx`
          insert into public.whatsapp_mensagens (conversa_id, conteudo, remetente)
          values (gen_random_uuid(), 'Oi', 'cliente')
        `,
      ).rejects.toThrow(/linha-mãe inexistente em whatsapp_mensagens\.conversa_id/);
    });
  });

  it("evento da plataforma fica sem grupo só com a marca, e o de um corretor herda o dele", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });

      const [{ grupo_id: daPlataforma }] = await tx<{ grupo_id: string | null }[]>`
        insert into public.admin_eventos (acao, detalhes)
        values ('conta_criada', '{"origem":"plataforma"}'::jsonb)
        returning grupo_id
      `;
      expect(daPlataforma).toBeNull();

      const [{ grupo_id: doCorretor }] = await tx<{ grupo_id: string | null }[]>`
        insert into public.admin_eventos (acao, alvo_corretor_id, detalhes)
        values ('corretor_desativado', ${b.corretorId}, '{}'::jsonb)
        returning grupo_id
      `;
      expect(doCorretor).toBe(b.grupoId);

      await expect(
        tx.savepoint(
          (sp) => sp`insert into public.admin_eventos (acao, detalhes) values ('conta_criada', '{}'::jsonb)`,
        ),
      ).rejects.toThrow(/grupo_id obrigatório em admin_eventos/);

      // Pela chave de serviço (papel `service_role`, como o PostgREST a
      // roda), a marca vale do mesmo jeito.
      await expect(
        comoUsuario(tx, b.gestorUserId, async (eu) => {
          await eu`reset role`;
          await eu`set local role service_role`;
          await eu`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`;
          return eu`
            insert into public.admin_eventos (acao, detalhes)
            values ('conta_criada', '{"origem":"plataforma"}'::jsonb)
            returning grupo_id
          `;
        }),
      ).resolves.toEqual([{ grupo_id: null }]);
    });
  });

  it("a role que troca grupo não tem login nem quem a use", async () => {
    const [role] = await sql<{ login: boolean }[]>`
      select rolcanlogin as login from pg_roles where rolname = 'transferidor_de_grupo'
    `;
    expect(role).toEqual({ login: false });
    // O Postgres 16+ dá ADMIN da role a quem a cria (postgres), mas sem SET
    // nem INHERIT: ninguém age como ela sem um grant explícito.
    const usam = await sql<{ membro: string }[]>`
      select m.member::regrole::text as membro
        from pg_auth_members m
       where m.roleid = 'transferidor_de_grupo'::regrole
         and (m.set_option or m.inherit_option)
    `;
    expect(usam).toEqual([]);
  });

  it("tabelas da plataforma não são lidas pela API", async () => {
    // `grupos` é a exceção: cada logado lê a linha do próprio grupo (0181).
    const daPlataforma = TABELAS_GLOBAIS.filter((t) => t !== "grupos");
    const privilegios = await sql<{ tabela: string; papel: string; le: boolean }[]>`
      select t as tabela, r as papel, has_table_privilege(r, 'public.' || t, 'select') as le
        from unnest(${daPlataforma}::text[]) t,
             unnest(array['anon', 'authenticated']) r
    `;
    expect(privilegios.filter((p) => p.le)).toEqual([]);
  });

  it("o carimbo do grupo não responde a chamada direta", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "b" });
      const lead = await criarLead(tx, b.corretorId);
      // Fora de um gatilho, a função seria um oráculo: diria a qualquer
      // logado se um id existe e de que grupo ele é.
      await expect(
        comoUsuario(
          tx,
          b.corretorUserId,
          (eu) => eu`
            select public.derivar_grupo_da_linha(
              'public.inbound_logs'::regclass, 'INSERT',
              jsonb_build_object('lead_id', ${lead}::text), null,
              array['lead_id', 'leads', 'id'], 'authenticated'
            )
          `,
        ),
      ).rejects.toThrow(/só roda dentro do gatilho/);
    });
  });

  it("o mesmo candidato de catálogo pode entrar em dois grupos", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      for (const grupo of [a.grupoId, b.grupoId]) {
        await tx`
          insert into public.catalogo_candidatos (fonte, ref_externa, nome, grupo_id)
          values ('teste', 'ref-0182', 'Lançamento de teste', ${grupo})
        `;
      }
      const [{ n }] = await tx<{ n: number }[]>`
        select count(*)::int as n from public.catalogo_candidatos where ref_externa = 'ref-0182'
      `;
      expect(n).toBe(2);
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
