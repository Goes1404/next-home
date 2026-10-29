// Isolamento entre grupos, medido no banco local (`npm run db:teste`).
//
// Pula sem DB_TESTE_URL, para `npm test` continuar rodando sem Docker. Cada
// teste roda numa transação desfeita no fim (ver apoioDoBanco.ts).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql, TransactionSql } from "postgres";
import {
  comoUsuario,
  conectar,
  criarGrupo,
  criarUsuario,
  emTransacaoDesfeita,
  soltarSuite,
  travarSuite,
  type Conexao,
  type GrupoDeTeste,
} from "./apoioDoBanco";
import { GRUPO_NEXT_HOME_ID } from "./grupo";
import { CHAVES_UNICAS_GLOBAIS, TABELAS_GLOBAIS } from "./tabelasDoGrupo";

/** Um lead do corretor, gravado como `postgres` (a chave de serviço). */
async function criarLead(sql: Conexao, corretorId: string, nome = "Lead de teste"): Promise<string> {
  const [{ id }] = await sql<{ id: string }[]>`
    insert into public.leads (nome, corretor_id) values (${nome}, ${corretorId}) returning id
  `;
  return id;
}

/** Um imóvel do grupo, gravado como `postgres`. */
async function criarImovel(sql: Conexao, grupoId: string, slug: string): Promise<string> {
  const [{ id }] = await sql<{ id: string }[]>`
    insert into public.empreendimentos (slug, nome, cidade, bairro, grupo_id)
    values (${slug}, 'Imóvel de teste', 'Barueri', 'Centro', ${grupoId})
    returning id
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

/** Uma instância de WhatsApp conectada do corretor, pronta para o porteiro. */
async function conectarNumero(sql: Conexao, corretorId: string, telefone: string): Promise<void> {
  await sql`
    insert into public.corretor_whatsapp_instancias
      (corretor_id, instance_name, status_conexao, conectado_em, telefone_conectado)
    values (${corretorId}, ${`teste-${telefone}`}, 'conectado', now(), ${telefone})
  `;
}

/** Uma pessoa com login no grupo da Next Home (grupo 1), gravada como `postgres`. */
async function criarPessoaDoGrupo1(
  sql: Conexao,
  papel: "gestor" | "corretor",
): Promise<{ userId: string; id: string }> {
  const userId = await criarUsuario(sql, `${papel}-nh-0193@next-home.teste`);
  const [{ id }] = await sql<{ id: string }[]>`
    insert into public.corretores (nome, creci, whatsapp, slug, papel, user_id, grupo_id)
    values (${`${papel} nh 0193`}, ${`TESTE-nh-0193-${papel}`}, '5511900000000',
            ${`nh-0193-${papel}`}, ${papel}, ${userId}, ${GRUPO_NEXT_HOME_ID})
    returning id
  `;
  return { userId, id };
}

/** Sentinela para desfazer o savepoint de `semAPolicy`. */
class DesfazerSavepoint extends Error {}

/**
 * Roda `fn` num savepoint em que a policy `isolamento_por_grupo` das tabelas
 * pedidas não existe, e desfaz no fim: é o "antes da 0193" medido no mesmo
 * banco. Sem `if exists` de propósito: sem a policy, este teste não mede nada.
 */
async function semAPolicy<T>(
  tx: TransactionSql,
  tabelas: string[],
  fn: (c: Conexao) => Promise<T>,
): Promise<T> {
  let resultado!: T;
  await tx
    .savepoint(async (sp) => {
      for (const t of tabelas) await sp.unsafe(`drop policy isolamento_por_grupo on public."${t}"`);
      resultado = await fn(sp);
      throw new DesfazerSavepoint();
    })
    .catch((e) => {
      if (!(e instanceof DesfazerSavepoint)) throw e;
    });
  return resultado;
}

/** Ids do que `semearGrupo` gravou. */
type Semente = {
  lead: string;
  conversa: string;
  mensagem: string;
  imovel: string;
  imovelSlug: string;
  midia: string;
  venda: string;
  anotacao: string;
  interacao: string;
};

/**
 * Um pouco de tudo num grupo, como `postgres`: lead, conversa com mensagem do
 * cliente, imóvel com mídia, venda com participante, anotação, interação da
 * IA, meta e evento de auditoria. É o que as telas do gestor e as views leem.
 */
async function semearGrupo(sql: Conexao, g: GrupoDeTeste, sufixo: string): Promise<Semente> {
  const lead = await criarLead(sql, g.corretorId, `Lead ${sufixo}`);
  const conversa = await criarConversa(sql, g.corretorId, lead);
  const [{ id: mensagem }] = await sql<{ id: string }[]>`
    insert into public.whatsapp_mensagens (conversa_id, conteudo, remetente)
    values (${conversa}, 'oi', 'cliente') returning id
  `;
  const imovelSlug = `imovel-0193-${sufixo}`;
  const imovel = await criarImovel(sql, g.grupoId, imovelSlug);
  const [{ id: midia }] = await sql<{ id: string }[]>`
    insert into public.midias (empreendimento_id, url) values (${imovel}, ${`https://exemplo/${sufixo}.jpg`})
    returning id
  `;
  const venda = await criarVenda(sql, g.corretorId, lead);
  await sql`
    insert into public.venda_participantes (venda_id, corretor_id, parte_percentual, repasse_valor)
    values (${venda}, ${g.corretorId}, 100, 1000)
  `;
  const [{ id: anotacao }] = await sql<{ id: string }[]>`
    insert into public.anotacoes (corretor_id, destinatario_id, texto)
    values (${g.corretorId}, ${g.gestorId}, ${`Anotação ${sufixo}`}) returning id
  `;
  const [{ id: interacao }] = await sql<{ id: string }[]>`
    insert into public.ia_interacoes (conversa_id, origem, prompt_versao)
    values (${conversa}, 'webhook', 'teste-0193') returning id
  `;
  await sql`
    insert into public.metas_corretor (corretor_id, mes, meta_comissao)
    values (${g.corretorId}, date '2026-10-01', 50000)
  `;
  await sql`
    insert into public.admin_eventos (acao, alvo_corretor_id, detalhes)
    values ('corretor_desativado', ${g.corretorId}, '{}'::jsonb)
  `;
  return { lead, conversa, mensagem, imovel, imovelSlug, midia, venda, anotacao, interacao };
}

/**
 * Tabelas com `grupo_id` que o `authenticated` consegue ler pela coluna. As
 * que ficam de fora não podem ter leitura nenhuma (senão seriam um caminho
 * que o laço não mede).
 */
async function tabelasLegiveisComGrupo(sql: Conexao): Promise<{ legiveis: string[]; semColuna: string[] }> {
  const linhas = await sql<{ tabela: string; grupo: boolean; alguma: boolean }[]>`
    with t as materialized (
      select c.oid, c.relname
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attname = 'grupo_id' and not a.attisdropped
       where n.nspname = 'public' and c.relkind in ('r', 'p')
    )
    select relname as tabela,
           has_column_privilege('authenticated', oid, 'grupo_id', 'SELECT') as grupo,
           has_any_column_privilege('authenticated', oid, 'SELECT') as alguma
      from t
     order by relname
  `;
  return {
    legiveis: linhas.filter((l) => l.grupo).map((l) => l.tabela),
    semColuna: linhas.filter((l) => !l.grupo && l.alguma).map((l) => l.tabela),
  };
}

/** Uma consulta por tabela ou view: quantas linhas de outro grupo (ou sem grupo) aparecem. */
async function linhasDeFora(eu: Conexao, relacoes: string[], grupoId: string): Promise<string[]> {
  const vazadas: string[] = [];
  for (const r of relacoes) {
    const [{ n }] = await eu.unsafe<{ n: number }[]>(
      `select count(*)::int as n from public."${r}" where grupo_id is distinct from $1`,
      [grupoId],
    );
    if (n > 0) vazadas.push(`${r} (${n})`);
  }
  return vazadas;
}

describe.skipIf(!process.env.DB_TESTE_URL)("isolamento entre grupos", () => {
  let sql: Sql;

  // A trava existe por causa de realtime.db.test.ts, que precisa GRAVAR de
  // verdade (o Realtime lê o WAL, que não vê transação desfeita) e por alguns
  // segundos deixa um segundo grupo no banco. Os testes "com um grupo só"
  // daqui veriam esse grupo se rodassem ao mesmo tempo.
  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
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
  // painel, admin/acoes.ts, pela chave de serviço). A 0190 tem de deixá-lo
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
      // `garantir_gestor_remanescente` conta os gestores do grupo (0192), e o
      // gestor de B é o único de B: sem outro gestor ativo no grupo,
      // desativá-lo seria recusado antes de medir alguma coisa.
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
  // grupo_id em toda tabela (0191)
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

  // Review Focus 3, pela roleta. `leads_distribuir` roda DEPOIS do carimbo:
  // a 0191 recusava o lead quando a roleta global escolhia gente de outro
  // grupo. Desde a 0192 ela só escolhe no grupo do lead e, sem ninguém
  // elegível nele, deixa o lead sem dono DENTRO do grupo — nunca falha,
  // nunca atravessa.
  it("a roleta só escolhe corretor do grupo do lead", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      // O corretor de A tem o número no ar: na roleta global ele ganharia
      // de qualquer um de B, que não tem.
      await conectarNumero(tx, a.corretorId, "5511911110001");
      const deB = [b.gestorId, b.corretorId];

      for (let i = 0; i < 3; i++) {
        const [lead] = await tx<{ corretor_id: string | null; grupo_id: string }[]>`
          insert into public.leads (nome, grupo_id) values ('Lead de B', ${b.grupoId})
          returning corretor_id, grupo_id
        `;
        expect(lead.grupo_id).toBe(b.grupoId);
        expect(deB).toContain(lead.corretor_id);
      }

      // O outro sentido: lead de A fica em A, com quem tem o número no ar.
      const [deA] = await tx<{ corretor_id: string | null; origem_atribuicao: string }[]>`
        insert into public.leads (nome, grupo_id) values ('Lead de A', ${a.grupoId})
        returning corretor_id, origem_atribuicao
      `;
      expect(deA).toEqual({ corretor_id: a.corretorId, origem_atribuicao: "roleta" });
    });
  });

  it("sem ninguém elegível no grupo, o lead fica sem dono dentro dele", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      await conectarNumero(tx, a.corretorId, "5511911110001");
      // Ninguém de B pode receber: a roleta global só acharia gente de A.
      await tx`update public.corretores set em_pausa = true where grupo_id = ${b.grupoId}`;
      const [lead] = await tx<{ corretor_id: string | null; grupo_id: string; origem_atribuicao: string | null }[]>`
        insert into public.leads (nome, grupo_id) values ('Lead de B sem dono', ${b.grupoId})
        returning corretor_id, grupo_id, origem_atribuicao
      `;
      expect(lead).toEqual({ corretor_id: null, grupo_id: b.grupoId, origem_atribuicao: null });
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
        create function pg_temp.teste_0191_troca_grupo() returns trigger language plpgsql as $$
        begin
          new.grupo_id := '${a.grupoId}';
          return new;
        end $$
      `);
      await tx`
        create trigger whatsapp_mensagens_zz_teste before insert on public.whatsapp_mensagens
          for each row execute function pg_temp.teste_0191_troca_grupo()
      `;
      await expect(
        tx.savepoint((s) => s`
          insert into public.whatsapp_mensagens (conversa_id, conteudo, remetente)
          values (${conversa}, 'Oi', 'cliente')
        `),
      ).rejects.toThrow(/grupo da linha difere do grupo de whatsapp_conversas/);

      // No UPDATE, o SET nem cita a mãe: quem a muda é o gatilho.
      await tx.unsafe(`
        create function pg_temp.teste_0191_troca_dono() returns trigger language plpgsql as $$
        begin
          new.corretor_id := '${a.corretorId}';
          return new;
        end $$
      `);
      await tx`
        create trigger leads_zz_teste before update on public.leads
          for each row execute function pg_temp.teste_0191_troca_dono()
      `;
      await expect(
        tx.savepoint((s) => s`update public.leads set nome = 'Outro nome' where id = ${leadDeB}`),
      ).rejects.toThrow(/grupo da linha difere do grupo de corretores/);

      await tx`drop trigger leads_zz_teste on public.leads`;
      await tx.unsafe(`
        create function pg_temp.teste_0191_troca_grupo_upd() returns trigger language plpgsql as $$
        begin
          new.grupo_id := '${a.grupoId}';
          return new;
        end $$
      `);
      await tx`
        create trigger leads_zz_teste before update on public.leads
          for each row execute function pg_temp.teste_0191_troca_grupo_upd()
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
        values (date '2026-10-19', 'teste-0191-campanha', 'Campanha de teste', ${b.grupoId})
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
        values ('Imóvel de A', 'teste-0191-imovel-a', 'Centro', 'Barueri', ${a.grupoId})
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
        create policy "teste 0191: transferidor" on public.leads
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
        update public.vendas
           set status = 'distratada', distratada_em = now(),
               distrato_motivo = 'teste', distrato_parcelas = 'cancelar'
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
        select public.travar_disparo('teste-0191', 'dono-de-teste', 60) as travou
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

  // A marca não vale para `postgres` (0192): dentro de qualquer função
  // security definer chamada por um logado o papel é `postgres`, e a marca
  // viraria um jeito de gravar evento sem grupo, invisível ao gestor.
  it("a marca da plataforma só vale sem mãe e para a chave de serviço ou o administrador", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const comoServico = <T,>(fn: (s: TransactionSql) => Promise<T>) =>
        comoUsuario(tx, b.gestorUserId, async (eu) => {
          await eu`reset role`;
          await eu`set local role service_role`;
          await eu`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`;
          return fn(eu);
        });

      // Com mãe, o evento é do grupo dela, mesmo com a marca.
      await expect(
        comoServico((s) => s`
          insert into public.admin_eventos (acao, alvo_corretor_id, detalhes)
          values ('papel_alterado', ${b.corretorId}, '{"origem":"plataforma"}'::jsonb)
          returning grupo_id
        `),
      ).resolves.toEqual([{ grupo_id: b.grupoId }]);

      // `postgres` direto, com dois grupos: não decide sozinho.
      await expect(
        tx.savepoint(
          (s) => s`insert into public.admin_eventos (acao, detalhes) values ('conta_criada', '{"origem":"plataforma"}'::jsonb)`,
        ),
      ).rejects.toThrow(/grupo_id obrigatório em admin_eventos/);

      // Função security definer chamada por um logado: o evento fica no
      // grupo de quem chamou, nunca sem grupo.
      await tx.unsafe(`
        create function pg_temp.teste_0192_evento() returns uuid
        language sql security definer as $$
          insert into public.admin_eventos (acao, detalhes)
          values ('conta_criada', '{"origem":"plataforma"}'::jsonb)
          returning grupo_id
        $$
      `);
      await expect(
        comoUsuario(tx, b.gestorUserId, (eu) => eu`select pg_temp.teste_0192_evento() as grupo_id`),
      ).resolves.toEqual([{ grupo_id: b.grupoId }]);
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
    // `grupos` é a exceção: cada logado lê a linha do próprio grupo (0190).
    // `parametros_fiscais` também: é lei federal (IRRF, INSS), igual para
    // todo grupo, e o fiscal de cada um lê pela sessão (0232). Escrever, não.
    const daPlataforma = TABELAS_GLOBAIS.filter((t) => t !== "grupos" && t !== "parametros_fiscais");
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
          values ('teste', 'ref-0191', 'Lançamento de teste', ${grupo})
        `;
      }
      const [{ n }] = await tx<{ n: number }[]>`
        select count(*)::int as n from public.catalogo_candidatos where ref_externa = 'ref-0191'
      `;
      expect(n).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // Chaves únicas por grupo (0192)
  // -------------------------------------------------------------------------

  it("toda chave única de tabela com grupo inclui o grupo ou uma linha-mãe", async () => {
    // A chave conta como escopada quando uma das colunas é `grupo_id` ou tem
    // FK para outra tabela com grupo (a mãe já é de um grupo só). A primária
    // `id` uuid é sorteada e não é dado de negócio.
    const linhas = await sql<{ indice: string; escopada: boolean; id_sorteado: boolean }[]>`
      with tabelas as (
        select c.oid, c.relname
          from pg_class c
         where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
           and exists (select 1 from pg_attribute a
                        where a.attrelid = c.oid and a.attname = 'grupo_id' and not a.attisdropped)
      )
      select i.relname as indice,
             exists (
               select 1 from unnest(x.indkey::int2[]) k(attnum)
                join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum
               where a.attname = 'grupo_id'
                  or exists (
                    select 1 from pg_constraint f
                      join tabelas m on m.oid = f.confrelid
                     where f.contype = 'f' and f.conrelid = t.oid and k.attnum = any (f.conkey)
                  )
             ) as escopada,
             (x.indisprimary and x.indnatts = 1 and exists (
               select 1 from pg_attribute a
                where a.attrelid = t.oid and a.attnum = x.indkey[0]
                  and a.attname = 'id' and a.atttypid = 'uuid'::regtype
             )) as id_sorteado
        from pg_index x
        join tabelas t on t.oid = x.indrelid
        join pg_class i on i.oid = x.indexrelid
       where x.indisunique
       order by 1
    `;
    const declaradas = new Set(Object.keys(CHAVES_UNICAS_GLOBAIS));
    const globais = linhas.filter((l) => !l.escopada && !l.id_sorteado).map((l) => l.indice);
    const fora = globais.filter((g) => !declaradas.has(g));
    expect(fora, `chave única global fora de CHAVES_UNICAS_GLOBAIS: ${fora.join(", ")}`).toEqual([]);
    // E o contrário: entrada declarada que sumiu ou passou a ser escopada é
    // comentário velho.
    const velhas = [...declaradas].filter((d) => !globais.includes(d));
    expect(velhas, `CHAVES_UNICAS_GLOBAIS cita chave que não é global: ${velhas.join(", ")}`).toEqual([]);
  });

  // Review Focus 5. O índice de dedup já era por imóvel desde a 0042 (passa
  // de primeira); o teste fica para a chave não voltar a ser global.
  it("o mesmo arquivo pode existir em dois grupos", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      for (const grupo of [a, b]) {
        const imovel = await criarImovel(tx, grupo.grupoId, `imovel-${grupo.grupoId}`);
        await tx`
          insert into public.midias (empreendimento_id, url, hash_conteudo)
          values (${imovel}, ${`https://exemplo/${grupo.grupoId}.jpg`}, 'hash-0192')
        `;
      }
      const [{ n }] = await tx<{ n: number }[]>`
        select count(*)::int as n from public.midias where hash_conteudo = 'hash-0192'
      `;
      expect(n).toBe(2);
    });
  });

  it("o mesmo CRECI pode existir em dois grupos, e não duas vezes no mesmo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      for (const grupo of [a, b]) {
        await tx`
          insert into public.corretores (nome, creci, whatsapp, slug, grupo_id)
          values ('Mesmo CRECI', 'CRECI-0192', '5511900000003', ${`creci-${grupo.grupoId}`}, ${grupo.grupoId})
        `;
      }
      await expect(
        tx`
          insert into public.corretores (nome, creci, whatsapp, slug, grupo_id)
          values ('Repetido', 'CRECI-0192', '5511900000004', 'creci-repetido', ${a.grupoId})
        `,
      ).rejects.toThrow(/duplicate key/);
    });
  });

  it("cada grupo tem os próprios itens de lazer", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      for (const grupo of [a.grupoId, b.grupoId]) {
        await tx`insert into public.lazer_itens (nome, grupo_id) values ('Piscina 0192', ${grupo})`;
      }
      const [{ n }] = await tx<{ n: number }[]>`
        select count(*)::int as n from public.lazer_itens where nome = 'Piscina 0192'
      `;
      expect(n).toBe(2);
    });
  });

  it("a mesma campanha da Meta vira uma campanha canônica em cada grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      // Dias diferentes: a métrica é por (dia, campanha) até a fase 7.
      const dias = { [a.grupoId]: "2026-10-18", [b.grupoId]: "2026-10-19" };
      for (const grupo of [a.grupoId, b.grupoId]) {
        await tx`
          insert into public.meta_ads_metricas (dia, campanha_id, campanha_nome, grupo_id)
          values (${dias[grupo]}::date, 'campanha-0192', 'Campanha de teste', ${grupo})
        `;
      }
      const campanhas = await tx<{ grupo_id: string }[]>`
        select grupo_id from public.marketing_campanhas where external_id = 'campanha-0192'
      `;
      expect(new Set(campanhas.map((c) => c.grupo_id))).toEqual(new Set([a.grupoId, b.grupoId]));
      const [{ ligadas }] = await tx<{ ligadas: number }[]>`
        select count(*)::int as ligadas
          from public.meta_ads_metricas m
          join public.marketing_campanhas c on c.id = m.marketing_campanha_id
         where m.campanha_id = 'campanha-0192' and c.grupo_id = m.grupo_id
      `;
      expect(ligadas).toBe(2);
    });
  });

  it("o mesmo evento de marketing pode existir em dois grupos", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      for (const grupo of [a.grupoId, b.grupoId]) {
        await tx`
          insert into public.marketing_eventos (event_id, tipo, entidade_tipo, entidade_id, ocorrido_em, grupo_id)
          values ('evento-0192', 'lead.criado', 'lead', gen_random_uuid(), now(), ${grupo})
        `;
      }
      const [{ n }] = await tx<{ n: number }[]>`
        select count(*)::int as n from public.marketing_eventos where event_id = 'evento-0192'
      `;
      expect(n).toBe(2);
    });
  });

  it("cada grupo fecha o próprio mês", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      for (const grupo of [a, b]) {
        await tx`
          insert into public.meses_fechados (mes, arquivo_path, fechado_por)
          values (date '2026-09-01', ${`${grupo.grupoId}/2026-09.xlsx`}, ${grupo.gestorId})
        `;
      }
      await expect(
        tx`
          insert into public.meses_fechados (mes, arquivo_path, fechado_por)
          values (date '2026-09-01', 'repetido.xlsx', ${a.gestorId})
        `,
      ).rejects.toThrow(/duplicate key/);
    });
  });

  it("cada grupo tem a própria configuração fiscal, uma só", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "b" });
      await tx`insert into public.fiscal_config (grupo_id) values (${b.grupoId})`;
      const grupos = await tx<{ grupo_id: string }[]>`select grupo_id from public.fiscal_config`;
      expect(new Set(grupos.map((g) => g.grupo_id))).toEqual(new Set([GRUPO_NEXT_HOME_ID, b.grupoId]));
      await expect(tx`insert into public.fiscal_config (grupo_id) values (${b.grupoId})`).rejects.toThrow(
        /duplicate key/,
      );
    });
  });

  it("o mesmo código legado pode existir em dois grupos", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      for (const grupo of [a.grupoId, b.grupoId]) {
        await tx`
          insert into public.empreendimentos (slug, nome, cidade, bairro, codigo_legado, grupo_id)
          values (${`legado-${grupo}`}, 'Legado', 'Barueri', 'Centro', 'LEG-0192', ${grupo})
        `;
      }
      const [{ n }] = await tx<{ n: number }[]>`
        select count(*)::int as n from public.empreendimentos where codigo_legado = 'LEG-0192'
      `;
      expect(n).toBe(2);
    });
  });

  // Mensagem de um corretor para outro: o id do WhatsApp é o mesmo nos dois
  // aparelhos. Com a chave global, a cópia do grupo B era tomada por
  // reentrega e sumia.
  it("a mesma mensagem do WhatsApp entra em dois grupos, e a reentrega continua recusada", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const conversas: string[] = [];
      for (const grupo of [a, b]) {
        const lead = await criarLead(tx, grupo.corretorId);
        const conversa = await criarConversa(tx, grupo.corretorId, lead);
        conversas.push(conversa);
        await tx`
          insert into public.whatsapp_mensagens (conversa_id, remetente, conteudo, provider_message_id)
          values (${conversa}, 'cliente', 'Oi', 'WAID-0192')
        `;
      }
      await expect(
        tx`
          insert into public.whatsapp_mensagens (conversa_id, remetente, conteudo, provider_message_id)
          values (${conversas[0]}, 'cliente', 'Oi', 'WAID-0192')
        `,
      ).rejects.toThrow(/duplicate key/);
    });
  });

  // L30: a fase 5 recupera a origem de quem foi repassado por aqui.
  it("o repasse de lead fica registrado com tipo próprio", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const lead = await criarLead(tx, a.corretorId);
      const [{ tipo }] = await tx<{ tipo: string }[]>`
        insert into public.lead_interacoes (lead_id, corretor_id, tipo, conteudo, detalhes)
        values (${lead}, ${a.gestorId}, 'repasse', 'Repasse', '{"origem_anterior":"roleta"}'::jsonb)
        returning tipo
      `;
      expect(tipo).toBe("repasse");
    });
  });

  // L27: com a policy restritiva da Task 6, a sessão só vê o próprio grupo;
  // a unicidade é global e precisa de quem enxerga todos.
  it("slug do outro grupo aparece como ocupado", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const [r] = await comoUsuario(tx, b.gestorUserId, (eu) =>
        eu<{ ocupado: boolean; livre: boolean }[]>`
          select not public.slug_de_corretor_livre('a-corretor') as ocupado,
                 public.slug_de_corretor_livre('ninguem-tem-este-slug') as livre
        `,
      );
      expect(r).toEqual({ ocupado: true, livre: true });
    });
  });

  it("e-mail de acesso do outro grupo aparece como ocupado", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      await tx`update public.corretores set email = 'ficha@a.teste' where slug = 'a-corretor'`;
      const [r] = await comoUsuario(tx, b.gestorUserId, (eu) =>
        eu<{ login: boolean; ficha: boolean; livre: boolean }[]>`
          select not public.email_de_acesso_livre('Gestor@A.teste') as login,
                 not public.email_de_acesso_livre('ficha@a.teste') as ficha,
                 public.email_de_acesso_livre('ninguem@lugar.teste') as livre
        `,
      );
      expect(r).toEqual({ login: true, ficha: true, livre: true });
    });
  });

  it("só gestor consulta slug e e-mail livres, e a chave pública não executa", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "b" });
      await expect(
        comoUsuario(tx, b.corretorUserId, (eu) => eu`select public.slug_de_corretor_livre('x')`),
      ).rejects.toThrow(/restrit/);
      await expect(
        comoUsuario(tx, b.corretorUserId, (eu) => eu`select public.email_de_acesso_livre('x@y.z')`),
      ).rejects.toThrow(/restrit/);
      for (const funcao of ["slug_de_corretor_livre", "email_de_acesso_livre"]) {
        const [{ pode }] = await tx<{ pode: boolean }[]>`
          select has_function_privilege('anon', ${`public.${funcao}(text)`}, 'execute') as pode
        `;
        expect(pode, funcao).toBe(false);
      }
    });
  });

  // Achado B da revisão final: `empreendimentos.slug` é global, e o
  // corretor que cria imóvel só enxerga o próprio grupo pela sessão. Quem
  // confere é `slug_de_imovel_livre`, que olha todos os grupos.
  it("slug de imóvel do outro grupo aparece como ocupado para corretor de B", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      await tx`
        insert into public.empreendimentos (slug, nome, cidade, bairro, grupo_id)
        values ('imovel-do-grupo-a', 'Imóvel do grupo A', 'Barueri', 'Centro', ${a.grupoId})
      `;
      for (const userId of [b.corretorUserId, b.gestorUserId]) {
        const [r] = await comoUsuario(tx, userId, (eu) =>
          eu<{ visto: number; ocupado: boolean; livre: boolean }[]>`
            select (select count(*)::int from public.empreendimentos where slug = 'imovel-do-grupo-a') as visto,
                   not public.slug_de_imovel_livre('imovel-do-grupo-a') as ocupado,
                   public.slug_de_imovel_livre('ninguem-tem-este-imovel') as livre
          `,
        );
        // Pela sessão o imóvel de A não aparece (0193); pela função, aparece.
        expect(r).toEqual({ visto: 0, ocupado: true, livre: true });
      }
    });
  });

  it("só corretor ativo consulta slug de imóvel livre, e a chave pública não executa", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "b" });
      await tx`update public.corretores set ativo = false where id = ${b.corretorId}`;
      await expect(
        comoUsuario(tx, b.corretorUserId, (eu) => eu`select public.slug_de_imovel_livre('x')`),
      ).rejects.toThrow(/restrit/);
      const [{ anon, logado }] = await tx<{ anon: boolean; logado: boolean }[]>`
        select has_function_privilege('anon', 'public.slug_de_imovel_livre(text)', 'execute') as anon,
               has_function_privilege('authenticated', 'public.slug_de_imovel_livre(text)', 'execute') as logado
      `;
      expect({ anon, logado }).toEqual({ anon: false, logado: true });
    });
  });

  // Portas de entrada (Task 12): o porteiro `/wa` sorteia dentro do grupo do
  // site, e a indicação do parceiro não atravessa grupos.
  it("o porteiro sem imóvel só sorteia no grupo pedido", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      await conectarNumero(tx, a.corretorId, "5511911110001");
      // Em B ninguém está conectado: o clique vai para o escape, nunca para A.
      const deB = await tx`select * from public.sortear_corretor_whatsapp(p_grupo => ${b.grupoId})`;
      expect(deB).toEqual([]);
      const deA = await tx<{ corretor_id: string }[]>`
        select corretor_id from public.sortear_corretor_whatsapp(p_grupo => ${a.grupoId})
      `;
      expect(deA.map((l) => l.corretor_id)).toEqual([a.corretorId]);
    });
  });

  it("preferido de outro grupo não ganha a vez", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      await conectarNumero(tx, a.corretorId, "5511911110001");
      await conectarNumero(tx, b.corretorId, "5511911110002");
      for (let i = 0; i < 5; i++) {
        const linhas = await tx<{ corretor_id: string }[]>`
          select corretor_id
            from public.sortear_corretor_whatsapp(${b.grupoId}::uuid, null::uuid, ${a.corretorId}::uuid)
        `;
        expect(linhas.map((l) => l.corretor_id)).toEqual([b.corretorId]);
      }
    });
  });

  it("imóvel de outro grupo não entra no sorteio", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      await conectarNumero(tx, a.corretorId, "5511911110001");
      const imovelDeB = await criarImovel(tx, b.grupoId, "imovel-de-b");
      const linhas = await tx`
        select * from public.sortear_corretor_whatsapp(${a.grupoId}::uuid, ${imovelDeB}::uuid, null::uuid)
      `;
      expect(linhas).toEqual([]);
    });
  });

  it("só a chave de serviço sorteia, e o sorteio sem grupo não existe para a API", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      for (const papel of ["anon", "authenticated"]) {
        const [{ pode }] = await tx<{ pode: boolean }[]>`
          select has_function_privilege(${papel}, 'public.sortear_corretor_whatsapp(uuid, uuid, uuid)', 'execute') as pode
        `;
        expect(pode, papel).toBe(false);
      }
      const [{ pode }] = await tx<{ pode: boolean }[]>`
        select has_function_privilege('service_role', 'public.sortear_corretor_whatsapp(uuid, uuid, uuid)', 'execute') as pode
      `;
      expect(pode).toBe(true);
    });
  });

  // 0194, pós-deploy: a assinatura antiga (sorteio fixo no grupo 1, que a 0192
  // manteve para o código anterior ao deploy) deixa de existir, e chamada
  // sem grupo não casa com mais nada.
  // 0194, pós-deploy: o formulário e o clique do site gravam pelo servidor,
  // com o grupo do site. A chave pública, que vai no bundle, não escolhe
  // mais em que grupo o lead cai.
  it("depois da 0194 a chave pública não grava lead nem clique, e a chave de serviço grava", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const [privilegios] = await tx<{ lead: boolean; clique: boolean }[]>`
        select has_table_privilege('anon', 'public.leads', 'INSERT')
                 or has_any_column_privilege('anon', 'public.leads', 'INSERT') as lead,
               has_table_privilege('anon', 'public.cliques_whatsapp', 'INSERT')
                 or has_any_column_privilege('anon', 'public.cliques_whatsapp', 'INSERT') as clique
      `;
      expect(privilegios).toEqual({ lead: false, clique: false });

      await expect(
        tx.savepoint(async (s) => {
          await s`set local role anon`;
          await s`insert into public.leads (nome, grupo_id) values ('Do site', ${a.grupoId})`;
        }),
      ).rejects.toThrow(/permission denied/);
      await expect(
        tx.savepoint(async (s) => {
          await s`set local role anon`;
          await s`insert into public.cliques_whatsapp (corretor_id, origem) values (${a.corretorId}, 'site')`;
        }),
      ).rejects.toThrow(/permission denied/);

      const gravados = await tx.savepoint(async (s) => {
        await s`set local role service_role`;
        const [lead] = await s<{ grupo_id: string }[]>`
          insert into public.leads (nome, corretor_id) values ('Do site', ${a.corretorId}) returning grupo_id
        `;
        const [clique] = await s<{ grupo_id: string }[]>`
          insert into public.cliques_whatsapp (corretor_id, origem) values (${a.corretorId}, 'site') returning grupo_id
        `;
        return [lead.grupo_id, clique.grupo_id];
      });
      expect(gravados).toEqual([a.grupoId, a.grupoId]);

      // O logado continua cadastrando lead pela sessão (importar, indicação).
      const [lead] = await comoUsuario(tx, a.corretorUserId, (eu) =>
        eu<{ grupo_id: string }[]>`
          insert into public.leads (nome, corretor_id) values ('Importado', ${a.corretorId}) returning grupo_id
        `,
      );
      expect(lead.grupo_id).toBe(a.grupoId);
    });
  });

  it("depois da 0194 a assinatura antiga do sorteio não existe", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const assinaturas = await tx<{ args: string }[]>`
        select pg_get_function_identity_arguments(p.oid) as args
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'sortear_corretor_whatsapp'
      `;
      expect(assinaturas.map((a) => a.args)).toEqual([
        "p_grupo uuid, p_empreendimento uuid, preferido uuid",
      ]);
      await expect(tx.savepoint((s) => s`select * from public.sortear_corretor_whatsapp()`)).rejects.toThrow(
        /does not exist/,
      );
    });
  });

  it("indicação do parceiro de A para imóvel de B é recusada", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const [{ id: parceiro }] = await tx<{ id: string }[]>`
        insert into public.parceiros (nome, grupo_id) values ('Parceiro de A', ${a.grupoId}) returning id
      `;
      const imovelDeB = await criarImovel(tx, b.grupoId, "imovel-de-b");
      // O parceiro é a mãe que manda: o imóvel é que diverge dele.
      await expect(
        tx.savepoint(
          (s) => s`insert into public.leads (nome, parceiro_id, empreendimento_id) values ('Indicado', ${parceiro}, ${imovelDeB})`,
        ),
      ).rejects.toThrow(/grupo da linha difere do grupo de empreendimentos/);
      // Sem imóvel, o lead nasce no grupo do parceiro.
      const [lead] = await tx<{ grupo_id: string }[]>`
        insert into public.leads (nome, parceiro_id, corretor_id) values ('Indicado', ${parceiro}, ${a.corretorId})
        returning grupo_id
      `;
      expect(lead.grupo_id).toBe(a.grupoId);
    });
  });

  // Funções security definer (Task 5): a RLS não vale dentro delas, então
  // cada uma confere o grupo explicitamente.
  it("o porteiro só sorteia corretor do grupo do imóvel", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      // A é a Next Home, o grupo que já existe no banco.
      const [{ id: deA }] = await tx<{ id: string }[]>`
        insert into public.corretores (nome, creci, whatsapp, slug, grupo_id)
        values ('Corretor da Next Home', 'TESTE-nh', '5511900000009', 'corretor-nh', ${GRUPO_NEXT_HOME_ID})
        returning id
      `;
      await conectarNumero(tx, deA, "5511911110001");
      const b = await criarGrupo(tx, { slug: "b" });
      const imovelDeB = await criarImovel(tx, b.grupoId, "imovel-de-b");

      // Ninguém de B conectado: o clique do imóvel de B não vai para A, nem
      // pedindo o sorteio no grupo de A.
      expect(await tx`select * from public.sortear_corretor_whatsapp(${b.grupoId}::uuid, ${imovelDeB}::uuid, null::uuid)`).toEqual([]);
      expect(
        await tx`select * from public.sortear_corretor_whatsapp(${GRUPO_NEXT_HOME_ID}::uuid, ${imovelDeB}::uuid, null::uuid)`,
      ).toEqual([]);
      // O lado positivo: sem imóvel, o grupo de A sorteia o conectado dele.
      expect(
        (
          await tx<{ corretor_id: string }[]>`
            select corretor_id from public.sortear_corretor_whatsapp(${GRUPO_NEXT_HOME_ID}::uuid, null::uuid, null::uuid)
          `
        ).map((l) => l.corretor_id),
      ).toEqual([deA]);

      await conectarNumero(tx, b.corretorId, "5511911110002");
      for (let i = 0; i < 3; i++) {
        const linhas = await tx<{ corretor_id: string }[]>`
          select corretor_id from public.sortear_corretor_whatsapp(${b.grupoId}::uuid, ${imovelDeB}::uuid, null::uuid)
        `;
        expect(linhas.map((l) => l.corretor_id)).toEqual([b.corretorId]);
      }
    });
  });

  // Review Focus 4.
  it("gestor de B não muda o papel de corretor de A", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      await expect(
        comoUsuario(tx, b.gestorUserId, (eu) =>
          eu`select public.definir_papel_corretor(${a.corretorId}::uuid, 'gestor')`,
        ),
      ).rejects.toThrow(/não é da sua imobiliária/);
      const [{ papel }] = await tx<{ papel: string }[]>`select papel from corretores where id = ${a.corretorId}`;
      expect(papel).toBe("corretor");

      // No próprio grupo, continua valendo. (`comoUsuario` desfaz tudo no
      // fim, então a leitura é lá dentro.)
      const deB = await comoUsuario(tx, b.gestorUserId, async (eu) => {
        await eu`select public.definir_papel_corretor(${b.corretorId}::uuid, 'gestor')`;
        return eu<{ papel: string }[]>`select papel from public.corretores where id = ${b.corretorId}`;
      });
      expect(deB).toEqual([{ papel: "gestor" }]);
    });
  });

  it("o último gestor é contado por grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      await tx`update corretores set papel = 'gestor' where id = ${b.corretorId}`;
      // B tem dois gestores; A, um só. Os de B não seguram A.
      await expect(
        tx.savepoint((s) => s`update corretores set ativo = false where id = ${a.gestorId}`),
      ).rejects.toThrow(/sem nenhum gestor ativo/);
      await expect(
        tx.savepoint((s) => s`update corretores set papel = 'corretor' where id = ${a.gestorId}`),
      ).rejects.toThrow(/sem nenhum gestor ativo/);
      // B, com outro gestor ativo no próprio grupo, pode.
      await tx`update corretores set ativo = false where id = ${b.gestorId}`;
    });
  });

  it("ranking só mostra o próprio grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const venda = await criarVenda(tx, a.corretorId, null);
      await tx`
        insert into public.venda_participantes (venda_id, corretor_id, parte_percentual, repasse_valor)
        values (${venda}, ${a.corretorId}, 100, 10000)
      `;
      const ranking = await comoUsuario(tx, b.gestorUserId, (eu) =>
        eu<{ corretor_id: string }[]>`select corretor_id from public.ranking_vgv(date '2026-10-01', date '2026-10-31')`,
      );
      expect(ranking.map((l) => l.corretor_id).sort()).toEqual([b.gestorId, b.corretorId].sort());
    });
  });

  it("as taxas da equipe só contam o próprio grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const leadDeA = await criarLead(tx, a.corretorId);
      await criarVenda(tx, a.corretorId, leadDeA);
      const [taxas] = await comoUsuario(tx, b.gestorUserId, (eu) =>
        eu<{ leads: number; vendas: number }[]>`
          select leads::int, vendas::int from public.taxas_da_equipe(date '2026-01-01')
        `,
      );
      expect(taxas).toEqual({ leads: 0, vendas: 0 });
    });
  });

  it("gestor de B não marca pagamento de venda de A", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const venda = await criarVenda(tx, a.corretorId, null);
      await tx`
        insert into public.venda_participantes (venda_id, corretor_id, parte_percentual, repasse_valor)
        values (${venda}, ${a.corretorId}, 100, 10000)
      `;
      const [{ id: parcela }] = await tx<{ id: string }[]>`
        insert into public.venda_parcelas (venda_id, numero, valor) values (${venda}, 1, 25000) returning id
      `;
      const [r] = await comoUsuario(tx, b.gestorUserId, (eu) =>
        eu<{ comissao: boolean; repasse: boolean }[]>`
          select public.marcar_parcela_recebida(${parcela}::uuid, date '2026-10-19') as comissao,
                 public.marcar_repasse_pago(${venda}::uuid, ${a.corretorId}::uuid, date '2026-10-19') as repasse
        `,
      );
      expect(r).toEqual({ comissao: false, repasse: false });
      const [linha] = await tx<{ recebida: string | null; pago: string | null }[]>`
        select pc.recebida_em as recebida, p.repasse_pago_em as pago
          from venda_parcelas pc join venda_participantes p on p.venda_id = pc.venda_id
         where pc.venda_id = ${venda}
      `;
      expect(linha).toEqual({ recebida: null, pago: null });
    });
  });

  it("gestor de B não muda a preferência de contato de lead de A", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const leadDeA = await criarLead(tx, a.corretorId);
      const [{ ok }] = await comoUsuario(tx, b.gestorUserId, (eu) =>
        eu<{ ok: boolean }[]>`select public.definir_preferencia_contato(${leadDeA}::uuid, 'whatsapp', false) as ok`,
      );
      expect(ok).toBe(false);
      const [{ ok: doDono }] = await comoUsuario(tx, a.gestorUserId, (eu) =>
        eu<{ ok: boolean }[]>`select public.definir_preferencia_contato(${leadDeA}::uuid, 'whatsapp', false) as ok`,
      );
      expect(doDono).toBe(true);
    });
  });

  // Review Focus 9 (L20): id de outra pessoa no parâmetro.
  it("usuário logado não reserva crédito de vídeo de outro", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      await expect(
        comoUsuario(tx, b.corretorUserId, (eu) => eu`select public.reservar_credito_video(${a.corretorId}::uuid)`),
      ).rejects.toThrow(/permission denied/);
      await expect(
        comoUsuario(tx, b.corretorUserId, (eu) =>
          eu`select public.devolver_credito_video(${a.corretorId}::uuid, 'cota')`,
        ),
      ).rejects.toThrow(/permission denied/);
      const leadDeA = await criarLead(tx, a.corretorId);
      await expect(
        comoUsuario(tx, b.corretorUserId, (eu) =>
          eu`select public.reservar_horario_visita(${leadDeA}::uuid, now() + interval '1 day')`,
        ),
      ).rejects.toThrow(/permission denied/);
      // A chave de serviço (a fila de vídeo e a IA) continua executando.
      for (const assinatura of [
        "public.reservar_credito_video(uuid)",
        "public.devolver_credito_video(uuid, text)",
        "public.reservar_horario_visita(uuid, timestamptz)",
      ]) {
        const [{ pode }] = await tx<{ pode: boolean }[]>`
          select has_function_privilege('service_role', ${assinatura}, 'execute') as pode
        `;
        expect(pode, assinatura).toBe(true);
      }
    });
  });

  it("venda com participante de outro grupo é recusada com mensagem legível", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const dados = {
        data_venda: "2026-10-19",
        valor_venda: "500000",
        comissao_valor: "25000",
        imovel_descricao: "Apartamento de teste",
      };
      const participantes = [
        { corretor_id: a.corretorId, parte_percentual: 50, repasse_valor: 5000 },
        { corretor_id: b.corretorId, parte_percentual: 50, repasse_valor: 5000 },
      ];
      await expect(
        comoUsuario(tx, a.corretorUserId, (eu) =>
          eu`select public.salvar_venda(null, ${eu.json(dados)}, ${eu.json(participantes)}, ${eu.json([{ numero: 1, valor: 25000 }])})`,
        ),
      ).rejects.toThrow(/participante_de_outro_grupo/);
    });
  });

  // ---------------------------------------------------------------------
  // 0193: a policy restritiva por grupo, as views, o Storage e a defesa
  // em profundidade no carimbo.
  // ---------------------------------------------------------------------

  it("nenhuma tabela mostra linha de outro grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      await semearGrupo(tx, a, "a");
      await semearGrupo(tx, b, "b");
      // Evento da plataforma, sem grupo, pela chave de serviço (fora de
      // `comoUsuario`, que desfaria o insert): nenhum logado o vê (0193).
      await tx`set local role service_role`;
      await tx`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`;
      await tx`insert into public.admin_eventos (acao, detalhes) values ('conta_criada', '{"origem":"plataforma"}'::jsonb)`;
      await tx`reset role`;
      await tx`select set_config('request.jwt.claims', '', true)`;
      // A semente gravou mesmo, senão a contagem zero não provaria nada.
      const [{ total }] = await tx<{ total: number }[]>`
        select (select count(*) from public.leads where grupo_id = ${a.grupoId})
             + (select count(*) from public.admin_eventos where grupo_id is null) as total
      `;
      expect(Number(total)).toBeGreaterThanOrEqual(2);

      const { legiveis, semColuna } = await tabelasLegiveisComGrupo(tx);
      expect(semColuna, "tabela que o logado lê sem poder filtrar grupo_id").toEqual([]);
      expect(legiveis.length).toBeGreaterThan(40);

      for (const [quem, userId] of [
        ["gestor de B", b.gestorUserId],
        ["corretor de B", b.corretorUserId],
      ] as const) {
        const vazadas = await comoUsuario(tx, userId, (eu) => linhasDeFora(eu, legiveis, b.grupoId));
        expect(vazadas, `${quem} lê linha de outro grupo em`).toEqual([]);
      }
    });
  });

  it("toda tabela com grupo_id tem a policy restritiva isolamento_por_grupo", async () => {
    const faltando = await sql<{ tabela: string }[]>`
      select c.relname as tabela
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attname = 'grupo_id' and not a.attisdropped
       where n.nspname = 'public' and c.relkind in ('r', 'p')
         and not exists (
           select 1 from pg_policies p
            where p.schemaname = 'public' and p.tablename = c.relname
              and p.policyname = 'isolamento_por_grupo'
              and p.permissive = 'RESTRICTIVE'
              and p.cmd = 'ALL'
              and p.roles = '{authenticated}'
              and p.qual like '%grupo_atual()%'
              and p.with_check like '%grupo_atual()%'
         )
       order by 1
    `;
    expect(faltando.map((f) => f.tabela)).toEqual([]);
  });

  it("não escreve em linha de outro grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const leadDeA = await criarLead(tx, a.corretorId);

      const mudou = await comoUsuario(tx, b.gestorUserId, (eu) =>
        eu`update public.leads set nome = 'x' where id = ${leadDeA} returning id`,
      );
      expect(mudou).toEqual([]);
      const apagou = await comoUsuario(tx, b.gestorUserId, (eu) =>
        eu`delete from public.leads where id = ${leadDeA} returning id`,
      );
      expect(apagou).toEqual([]);

      await expect(
        comoUsuario(tx, b.gestorUserId, (eu) =>
          eu`insert into public.leads (nome, grupo_id) values ('Lead em A', ${a.grupoId})`,
        ),
      ).rejects.toThrow();
      await expect(
        comoUsuario(tx, b.gestorUserId, (eu) =>
          eu`insert into public.empreendimentos (slug, nome, cidade, bairro, grupo_id)
             values ('imovel-de-b-em-a', 'Imóvel', 'Barueri', 'Centro', ${a.grupoId})`,
        ),
      ).rejects.toThrow();

      const [{ nome }] = await tx<{ nome: string }[]>`select nome from public.leads where id = ${leadDeA}`;
      expect(nome).toBe("Lead de teste");
    });
  });

  // Defesa em profundidade (revisão de segurança da 0191): mesmo que a policy
  // restritiva suma, o carimbo recusa logado gravando no grupo de outro.
  it("o carimbo recusa logado gravando em outro grupo, mesmo sem a policy", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      await tx`drop policy if exists isolamento_por_grupo on public.empreendimentos`;
      await tx`drop policy if exists isolamento_por_grupo on public.leads`;

      // Tabela sem mãe: o grupo informado.
      await expect(
        comoUsuario(tx, b.gestorUserId, (eu) =>
          eu`insert into public.empreendimentos (slug, nome, cidade, bairro, grupo_id)
             values ('imovel-de-b-em-a', 'Imóvel', 'Barueri', 'Centro', ${a.grupoId})`,
        ),
      ).rejects.toThrow(/grupo da linha difere do grupo de quem grava/);
      // Tabela com mãe: o grupo vem do corretor de A.
      await expect(
        comoUsuario(tx, b.gestorUserId, (eu) =>
          eu`insert into public.leads (nome, corretor_id) values ('Lead em A', ${a.corretorId})`,
        ),
      ).rejects.toThrow(/grupo da linha difere do grupo de quem grava/);

      // No próprio grupo segue gravando.
      const [{ grupo_id }] = await comoUsuario(tx, b.gestorUserId, (eu) =>
        eu<{ grupo_id: string }[]>`
          insert into public.empreendimentos (slug, nome, cidade, bairro)
          values ('imovel-de-b', 'Imóvel', 'Barueri', 'Centro')
          returning grupo_id
        `,
      );
      expect(grupo_id).toBe(b.grupoId);
    });
  });

  it("a chave de serviço continua informando o grupo de qualquer linha", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const [{ grupo_id }] = await comoUsuario(tx, b.gestorUserId, async (eu) => {
        await eu`reset role`;
        await eu`set local role service_role`;
        await eu`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`;
        return eu<{ grupo_id: string }[]>`
          insert into public.empreendimentos (slug, nome, cidade, bairro, grupo_id)
          values ('imovel-de-a-pelo-servico', 'Imóvel', 'Barueri', 'Centro', ${a.grupoId})
          returning grupo_id
        `;
      });
      expect(grupo_id).toBe(a.grupoId);
    });
  });

  it("views respeitam o grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      await semearGrupo(tx, a, "a");
      await semearGrupo(tx, b, "b");

      const views = await tx<{ view: string; tem_grupo: boolean }[]>`
        select v.viewname as view,
               exists (
                 select 1 from information_schema.columns c
                  where c.table_schema = 'public' and c.table_name = v.viewname and c.column_name = 'grupo_id'
               ) as tem_grupo
          from pg_views v
         where v.schemaname = 'public'
         order by 1
      `;
      expect(views.length).toBeGreaterThanOrEqual(6);
      expect(views.filter((v) => !v.tem_grupo).map((v) => v.view), "view sem grupo_id").toEqual([]);

      // As views leem do grupo A (sem isso o zero abaixo não provaria nada).
      const nomes = views.map((v) => v.view);
      const [{ n: deA }] = await tx.unsafe<{ n: number }[]>(
        `select count(*)::int as n from public.pessoas_do_corretor where grupo_id = $1`,
        [a.grupoId],
      );
      expect(deA).toBeGreaterThan(0);

      for (const [quem, userId] of [
        ["gestor de B", b.gestorUserId],
        ["corretor de B", b.corretorUserId],
      ] as const) {
        const vazadas = await comoUsuario(tx, userId, (eu) => linhasDeFora(eu, nomes, b.grupoId));
        expect(vazadas, `${quem} lê linha de outro grupo na view`).toEqual([]);
      }
      const proprias = await comoUsuario(tx, b.corretorUserId, (eu) =>
        eu<{ n: number }[]>`select count(*)::int as n from public.pessoas_do_corretor where grupo_id = ${b.grupoId}`,
      );
      expect(proprias[0].n).toBeGreaterThan(0);
    });
  });

  it("não grava no Storage de outro grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const imovelDeA = await criarImovel(tx, a.grupoId, "imovel-storage-a");
      const imovelDeB = await criarImovel(tx, b.grupoId, "imovel-storage-b");
      const gravar = (caminho: string) =>
        comoUsuario(tx, b.corretorUserId, (eu) =>
          eu`insert into storage.objects (bucket_id, name) values ('empreendimentos', ${caminho}) returning name`,
        );

      await expect(gravar(`${imovelDeA}/x.jpg`)).rejects.toThrow(/row-level security/);
      await expect(gravar(`corretores/${a.corretorId}/x.jpg`)).rejects.toThrow(/row-level security/);
      // O próprio grupo continua gravando pelos dois caminhos.
      await expect(gravar(`${imovelDeB}/x.jpg`)).resolves.toEqual([{ name: `${imovelDeB}/x.jpg` }]);
      await expect(gravar(`corretores/${b.corretorId}/x.jpg`)).resolves.toEqual([
        { name: `corretores/${b.corretorId}/x.jpg` },
      ]);
    });
  });

  // O teste acima passaria só pela RLS de `empreendimentos` (a subconsulta
  // da policy a atravessa). Este cobra a regra escrita na própria policy do
  // Storage, nos dois caminhos e nas duas cláusulas.
  it("as policies do Storage conferem o grupo do caminho", async () => {
    const policies = await sql<{ policyname: string; qual: string; with_check: string }[]>`
      select policyname, qual, with_check from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and 'authenticated' = any(roles)
       order by policyname
    `;
    expect(policies.map((p) => p.policyname)).toEqual([
      "corretor gerencia a propria pasta de midia",
      "corretor gerencia midia de empreendimento",
    ]);
    for (const p of policies) {
      expect(p.qual, `${p.policyname} (using)`).toMatch(/grupo_id = \( SELECT grupo_atual\(\)/);
      expect(p.with_check, `${p.policyname} (with check)`).toMatch(/grupo_id = \( SELECT grupo_atual\(\)/);
    }
  });

  it("a Next Home continua vendo o que via", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const [{ todos }] = await tx<{ todos: number }[]>`select count(*)::int as todos from grupos`;
      expect(todos).toBe(1);

      const gestor = await criarPessoaDoGrupo1(tx, "gestor");
      const outro = await criarPessoaDoGrupo1(tx, "corretor");
      for (const dono of [gestor.id, outro.id]) {
        const lead = await criarLead(tx, dono);
        await criarConversa(tx, dono, lead);
      }
      await criarImovel(tx, GRUPO_NEXT_HOME_ID, "imovel-nh-0193");

      const contar = (c: Conexao) =>
        comoUsuario(c, gestor.userId, (eu) =>
          eu<{ leads: number; conversas: number; imoveis: number }[]>`
            select (select count(*)::int from public.leads) as leads,
                   (select count(*)::int from public.whatsapp_conversas) as conversas,
                   (select count(*)::int from public.empreendimentos) as imoveis
          `,
        );
      const [depois] = await contar(tx);
      expect(depois.leads).toBeGreaterThanOrEqual(2);
      expect(depois.imoveis).toBeGreaterThanOrEqual(1);

      // "Antes da 0193" = as mesmas permissivas sem a restritiva.
      const [antes] = await semAPolicy(tx, ["leads", "whatsapp_conversas", "empreendimentos"], contar);
      expect(depois).toEqual(antes);
    });
  });

  // Leituras feitas pela sessão do gestor que a Task 7 deixou para a 0193
  // (getEquipeAtiva, getAgregadoDaEquipe, financeiro/dados.ts,
  // getEmpreendimentoDoPainel): as mesmas tabelas e colunas, como gestor de B.
  it("as leituras do gestor pela sessão não trazem o outro grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "a" });
      const b = await criarGrupo(tx, { slug: "b" });
      const sa = await semearGrupo(tx, a, "a");
      const sb = await semearGrupo(tx, b, "b");
      const idsDeA = new Set<string>([a.gestorId, a.corretorId, ...Object.values(sa)]);

      const lido = await comoUsuario(tx, b.gestorUserId, async (eu) => ({
        // getEquipeAtiva
        equipe: await eu<{ id: string }[]>`
          select id, nome, em_pausa from public.corretores where ativo and slug is not null`,
        // getAgregadoDaEquipe
        agregado: await eu<{ id: string }[]>`
          select id, etapa, etapa_alterada_em, created_at, origem_atribuicao, corretor_id
            from public.leads where arquivado_em is null`,
        // financeiro/dados.ts
        vendas: await eu<{ id: string }[]>`select id from public.vendas`,
        participantes: await eu<{ id: string }[]>`select venda_id as id from public.venda_participantes`,
        metas: await eu<{ id: string }[]>`select corretor_id as id from public.metas_corretor`,
        imoveis: await eu<{ id: string }[]>`select id, nome, construtora from public.empreendimentos`,
        primeiraResposta: await eu<{ id: string }[]>`
          select conversa_id as id from public.whatsapp_primeira_resposta`,
        // getEmpreendimentoDoPainel (rota de imagens), pelo slug do imóvel de A
        doPainel: await eu<{ id: string }[]>`
          select id from public.empreendimentos where slug = ${sa.imovelSlug}`,
      }));

      const vazou = Object.entries(lido)
        .filter(([, linhas]) => linhas.some((l) => idsDeA.has(l.id)))
        .map(([nome]) => nome);
      expect(vazou).toEqual([]);
      // E o gestor de B vê o próprio grupo (senão "nada de A" seria vácuo).
      expect(lido.agregado.map((l) => l.id)).toContain(sb.lead);
      expect(lido.vendas.map((l) => l.id)).toContain(sb.venda);
      expect(lido.equipe.map((l) => l.id)).toContain(b.corretorId);
    });
  });

  it("a chave pública não executa definir_preferencia_contato", async () => {
    const [p] = await sql<{ anon: boolean; logado: boolean; servico: boolean }[]>`
      select has_function_privilege('anon', 'public.definir_preferencia_contato(uuid, text, boolean)', 'execute') as anon,
             has_function_privilege('authenticated', 'public.definir_preferencia_contato(uuid, text, boolean)', 'execute') as logado,
             has_function_privilege('service_role', 'public.definir_preferencia_contato(uuid, text, boolean)', 'execute') as servico
    `;
    expect(p).toEqual({ anon: false, logado: true, servico: true });
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
