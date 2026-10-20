// Dados do grupo e LGPD (0202), medidos no banco local (`npm run db:teste`).
//
// - `apagar_dados_do_titular(lead)`: o pedido do titular (LGPD art. 18). Só o
//   gestor do grupo do lead pede; apaga o lead (o cascade leva a conversa) e o
//   que as FKs `set null` deixariam para trás, e grava o evento sem dado
//   pessoal. Venda fica (obrigação fiscal).
// - `apagar_dados_do_grupo(grupo)`: o fim dos 90 dias depois do cancelamento.
//   Só a chave de serviço executa, e o banco recusa antes do prazo, sem a
//   cópia exportada, o grupo da Next Home e grupo já apagado.
//
// Pula sem DB_TESTE_URL. Cada teste roda numa transação desfeita no fim.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql, TransactionSql } from "postgres";
import {
  comoUsuario,
  conectar,
  criarGrupo,
  emTransacaoDesfeita,
  soltarSuite,
  travarSuite,
  type Conexao,
  type GrupoDeTeste,
} from "./apoioDoBanco";
import { GRUPO_NEXT_HOME_ID } from "./grupo";

/**
 * Roda `fn` pela chave de serviço (papel `service_role`, como o PostgREST).
 * Como `comoUsuario`, desfaz o que gravou no fim: o efeito se lê DENTRO de
 * `fn`, depois de `reset role`.
 */
function comoServico<T>(tx: Conexao, userId: string, fn: (s: TransactionSql) => Promise<T>): Promise<T> {
  return comoUsuario(tx, userId, async (eu) => {
    await eu`reset role`;
    await eu`set local role service_role`;
    await eu`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`;
    return fn(eu);
  });
}

type Sobras = { lead: string; conversa: string; venda: string };

/**
 * Um lead com tudo o que fica preso a ele por `set null`: envio antigo,
 * e-mail de portal, item de lista de transmissão, evento de marketing,
 * tentativa de ativação, anotação, interação e correção da IA, e uma venda.
 */
async function semearTitular(sql: Conexao, g: GrupoDeTeste, sufixo: string): Promise<Sobras> {
  const [{ id: lead }] = await sql<{ id: string }[]>`
    insert into public.leads (nome, telefone, corretor_id)
    values (${`Titular ${sufixo}`}, '11988887777', ${g.corretorId}) returning id
  `;
  const [{ id: conversa }] = await sql<{ id: string }[]>`
    insert into public.whatsapp_conversas (corretor_id, lead_id, telefone_cliente)
    values (${g.corretorId}, ${lead}, '5511988887777') returning id
  `;
  await sql`
    insert into public.whatsapp_mensagens (conversa_id, conteudo, remetente)
    values (${conversa}, 'quero apagar meus dados', 'cliente')
  `;
  await sql`
    insert into public.historico_envios (lead_id, corretor_id, mensagem_enviada)
    values (${lead}, ${g.corretorId}, 'Olá, Titular')
  `;
  await sql`insert into public.inbound_logs (lead_id, status, de) values (${lead}, 'sucesso', 'titular@exemplo.com')`;
  const [{ id: campanha }] = await sql<{ id: string }[]>`
    insert into public.whatsapp_campanhas (corretor_id, titulo, mensagem_base)
    values (${g.corretorId}, 'Lista', 'Olá') returning id
  `;
  await sql`
    insert into public.whatsapp_campanhas_fila (campanha_id, lead_id, telefone, mensagem_personalizada)
    values (${campanha}, ${lead}, '5511988887777', 'Olá, Titular')
  `;
  await sql`
    insert into public.marketing_eventos (event_id, tipo, entidade_tipo, entidade_id, lead_id, ocorrido_em)
    values (${`evento-${sufixo}`}, 'lead.qualificado', 'lead', ${lead}, ${lead}, now())
  `;
  await sql`
    insert into public.ativacoes_em_lead_alheio (corretor_id, lead_id, telefone)
    values (${g.gestorId}, ${lead}, '5511988887777')
  `;
  await sql`
    insert into public.anotacoes (corretor_id, destinatario_id, lead_id, texto)
    values (${g.corretorId}, ${g.corretorId}, ${lead}, 'Titular prefere tarde')
  `;
  await sql`
    insert into public.ia_interacoes (conversa_id, origem, prompt_versao)
    values (${conversa}, 'webhook', 'teste-0202')
  `;
  await sql`
    insert into public.ia_correcoes (corretor_id, conversa_id, fala_cliente, resposta_certa)
    values (${g.corretorId}, ${conversa}, 'oi', 'olá')
  `;
  const [{ id: venda }] = await sql<{ id: string }[]>`
    insert into public.vendas (corretor_id, lead_id, valor_venda, data_venda, comissao_valor, imovel_descricao)
    values (${g.corretorId}, ${lead}, 500000, date '2026-10-19', 25000, 'Apartamento') returning id
  `;
  return { lead, conversa, venda };
}

/** Quantas linhas ainda apontam para o lead ou a conversa dele. */
async function restosDoTitular(sql: Conexao, s: Sobras): Promise<Record<string, number>> {
  const [r] = await sql<Record<string, number>[]>`
    select
      (select count(*)::int from public.leads where id = ${s.lead}) as leads,
      (select count(*)::int from public.whatsapp_conversas where id = ${s.conversa}) as conversas,
      (select count(*)::int from public.historico_envios where mensagem_enviada = 'Olá, Titular') as historico,
      (select count(*)::int from public.whatsapp_campanhas_fila where mensagem_personalizada = 'Olá, Titular') as fila,
      (select count(*)::int from public.anotacoes where texto = 'Titular prefere tarde') as anotacoes,
      (select count(*)::int from public.ia_interacoes where prompt_versao = 'teste-0202') as interacoes,
      (select count(*)::int from public.ia_correcoes where fala_cliente = 'oi' and resposta_certa = 'olá') as correcoes,
      (select count(*)::int from public.ativacoes_em_lead_alheio where telefone = '5511988887777') as ativacoes
  `;
  return r;
}

/** Linhas do grupo em toda tabela do `public` com `grupo_id`, menos `grupos`. */
async function linhasDoGrupo(sql: Conexao, grupoId: string): Promise<Record<string, number>> {
  const tabelas = await sql<{ relname: string }[]>`
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'grupo_id' and not a.attisdropped
     where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname <> 'grupos'
  `;
  const saida: Record<string, number> = {};
  for (const { relname } of tabelas) {
    const [{ n }] = await sql.unsafe<{ n: number }[]>(
      `select count(*)::int as n from public."${relname}" where grupo_id = $1`,
      [grupoId],
    );
    if (n > 0) saida[relname] = n;
  }
  return saida;
}

async function cancelar(sql: Conexao, grupoId: string, diasAtras: number, comCopia = true) {
  await sql`
    update public.grupos
       set cancelado_em = now() - make_interval(days => ${diasAtras}),
           situacao = 'encerrado',
           exportacao_final_caminho = ${comCopia ? `${grupoId}/final.xlsx` : null},
           exportacao_final_em = ${comCopia ? new Date(Date.now() + 60_000) : null}
     where id = ${grupoId}
  `;
}

describe.skipIf(!process.env.DB_TESTE_URL)("dados do grupo e LGPD (0202)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  describe("apagar_dados_do_titular", () => {
    it("o gestor do grupo apaga o lead, a conversa e as sobras; a venda fica sem o lead", async () => {
      await emTransacaoDesfeita(sql, async (tx) => {
        const g = await criarGrupo(tx, { slug: "titular-a" });
        const s = await semearTitular(tx, g, "a");

        const { resposta, restos, venda } = await comoUsuario(tx, g.gestorUserId, async (eu) => {
          const [{ r }] = await eu<{ r: { apagados: Record<string, number> } }[]>`
            select public.apagar_dados_do_titular(${s.lead}) as r
          `;
          await eu`reset role`;
          const [v] = await eu<{ lead_id: string | null }[]>`select lead_id from public.vendas where id = ${s.venda}`;
          return { resposta: r, restos: await restosDoTitular(eu, s), venda: v };
        });
        expect(resposta.apagados.historico_envios).toBe(1);

        expect(restos).toEqual({
          leads: 0,
          conversas: 0,
          historico: 0,
          fila: 0,
          anotacoes: 0,
          interacoes: 0,
          correcoes: 0,
          ativacoes: 0,
        });
        expect(venda.lead_id).toBeNull();
      });
    });

    it("grava o evento no grupo, com o gestor e sem nome nem telefone", async () => {
      await emTransacaoDesfeita(sql, async (tx) => {
        const g = await criarGrupo(tx, { slug: "titular-b" });
        const s = await semearTitular(tx, g, "b");
        const eventos = await comoUsuario(tx, g.gestorUserId, async (eu) => {
          await eu`select public.apagar_dados_do_titular(${s.lead})`;
          await eu`reset role`;
          return eu<{ grupo_id: string; ator_id: string; detalhes: unknown }[]>`
            select grupo_id, ator_id, detalhes from public.admin_eventos
             where acao = 'titular_apagado' and grupo_id = ${g.grupoId}
          `;
        });
        expect(eventos).toHaveLength(1);
        expect(eventos[0].ator_id).toBe(g.gestorId);
        const texto = JSON.stringify(eventos[0].detalhes);
        expect(texto).not.toContain("Titular");
        expect(texto).not.toContain("988887777");
        expect(texto).not.toContain(s.lead);
      });
    });

    it("corretor que não é gestor é recusado e nada é apagado", async () => {
      await emTransacaoDesfeita(sql, async (tx) => {
        const g = await criarGrupo(tx, { slug: "titular-c" });
        const s = await semearTitular(tx, g, "c");
        await expect(
          comoUsuario(tx, g.corretorUserId, (eu) => eu`select public.apagar_dados_do_titular(${s.lead})`),
        ).rejects.toThrow(/sem_permissao/);
        expect((await restosDoTitular(tx, s)).leads).toBe(1);
      });
    });

    it("gestor de outro grupo não alcança o lead", async () => {
      await emTransacaoDesfeita(sql, async (tx) => {
        const a = await criarGrupo(tx, { slug: "titular-d" });
        const b = await criarGrupo(tx, { slug: "titular-e" });
        const s = await semearTitular(tx, a, "d");
        await expect(
          comoUsuario(tx, b.gestorUserId, (eu) => eu`select public.apagar_dados_do_titular(${s.lead})`),
        ).rejects.toThrow(/lead_nao_encontrado/);
        expect((await restosDoTitular(tx, s)).leads).toBe(1);
      });
    });

    it("apaga também as outras fichas da mesma pessoa no grupo (mesmo telefone ou e-mail), e só elas", async () => {
      await emTransacaoDesfeita(sql, async (tx) => {
        const a = await criarGrupo(tx, { slug: "titular-f" });
        const b = await criarGrupo(tx, { slug: "titular-g" });
        const s = await semearTitular(tx, a, "f");
        await tx`update public.leads set email = 'Titular@Exemplo.com' where id = ${s.lead}`;
        const ficha = async (g: GrupoDeTeste, nome: string, telefone: string, email: string | null, corretor = g.corretorId) => {
          const [{ id }] = await tx<{ id: string }[]>`
            insert into public.leads (nome, telefone, email, corretor_id)
            values (${nome}, ${telefone}, ${email}, ${corretor}) returning id
          `;
          return id;
        };
        // Reimportada pelo outro corretor do grupo, com o mesmo número.
        const mesmoTelefone = await ficha(a, "Titular dup", "11988887777", null, a.gestorId);
        // Outro número, mesmo e-mail com caixa e espaço diferentes.
        const mesmoEmail = await ficha(a, "Titular mail", "11911112222", "  titular@exemplo.COM ");
        // Outra pessoa do grupo, e a mesma pessoa em OUTRA imobiliária.
        const outraPessoa = await ficha(a, "Outra", "11933334444", "outra@exemplo.com");
        const outroGrupo = await ficha(b, "Titular B", "11988887777", "titular@exemplo.com");

        const { resposta, sobraram } = await comoUsuario(tx, a.gestorUserId, async (eu) => {
          const [{ r }] = await eu<{ r: { apagados: { fichas: number }; leads: string[] } }[]>`
            select public.apagar_dados_do_titular(${s.lead}) as r
          `;
          await eu`reset role`;
          const linhas = await eu<{ id: string }[]>`
            select id from public.leads
             where id in (${s.lead}, ${mesmoTelefone}, ${mesmoEmail}, ${outraPessoa}, ${outroGrupo})
          `;
          return { resposta: r, sobraram: linhas.map((l) => l.id).sort() };
        });
        expect(resposta.apagados.fichas).toBe(3);
        expect([...resposta.leads].sort()).toEqual([s.lead, mesmoTelefone, mesmoEmail].sort());
        expect(sobraram).toEqual([outraPessoa, outroGrupo].sort());
      });
    });

    it("o anon não executa", async () => {
      const [{ pode }] = await sql<{ pode: boolean }[]>`
        select has_function_privilege('anon', 'public.apagar_dados_do_titular(uuid)', 'EXECUTE') as pode
      `;
      expect(pode).toBe(false);
    });
  });

  describe("apagar_dados_do_grupo", () => {
    it("só a chave de serviço executa", async () => {
      const [r] = await sql<{ autenticado: boolean; anon: boolean; servico: boolean }[]>`
        select has_function_privilege('authenticated', 'public.apagar_dados_do_grupo(uuid)', 'EXECUTE') as autenticado,
               has_function_privilege('anon', 'public.apagar_dados_do_grupo(uuid)', 'EXECUTE') as anon,
               has_function_privilege('service_role', 'public.apagar_dados_do_grupo(uuid)', 'EXECUTE') as servico
      `;
      expect(r).toEqual({ autenticado: false, anon: false, servico: true });
    });

    it("recusa antes dos 90 dias, sem cancelamento e sem a cópia exportada", async () => {
      await emTransacaoDesfeita(sql, async (tx) => {
        const g = await criarGrupo(tx, { slug: "apagar-a" });
        const tentar = () =>
          tx.savepoint((sp) => comoServico(sp, g.gestorUserId, (s) => s`select public.apagar_dados_do_grupo(${g.grupoId})`));

        await expect(tentar()).rejects.toThrow(/prazo_nao_venceu/);
        await cancelar(tx, g.grupoId, 89);
        await expect(tentar()).rejects.toThrow(/prazo_nao_venceu/);
        await cancelar(tx, g.grupoId, 91, false);
        await expect(tentar()).rejects.toThrow(/sem_copia/);
        expect(Object.keys(await linhasDoGrupo(tx, g.grupoId)).length).toBeGreaterThan(0);
      });
    });

    it("recusa se entrou lead ou venda depois da cópia (o que entrou não está nela)", async () => {
      await emTransacaoDesfeita(sql, async (tx) => {
        const g = await criarGrupo(tx, { slug: "apagar-d" });
        await cancelar(tx, g.grupoId, 91);
        await tx`
          update public.grupos set exportacao_final_em = now() - interval '1 hour' where id = ${g.grupoId}
        `;
        await semearTitular(tx, g, "dep");
        await expect(
          tx.savepoint((sp) => comoServico(sp, g.gestorUserId, (s) => s`select public.apagar_dados_do_grupo(${g.grupoId})`)),
        ).rejects.toThrow(/entrou_dado_depois_da_copia/);
        expect(Object.keys(await linhasDoGrupo(tx, g.grupoId))).toContain("leads");
      });
    });

    it("o grupo da Next Home não pode ser cancelado nem apagado", async () => {
      await emTransacaoDesfeita(sql, async (tx) => {
        await expect(
          tx.savepoint((sp) => sp`update public.grupos set cancelado_em = now() where id = ${GRUPO_NEXT_HOME_ID}`),
        ).rejects.toThrow(/grupos_next_home_nao_cancela/);
        await expect(
          tx.savepoint((sp) => sp`select public.apagar_dados_do_grupo(${GRUPO_NEXT_HOME_ID})`),
        ).rejects.toThrow(/grupo_protegido/);
      });
    });

    it("depois de 90 dias e com a cópia, apaga tudo do grupo e não toca no vizinho", async () => {
      await emTransacaoDesfeita(sql, async (tx) => {
        const a = await criarGrupo(tx, { slug: "apagar-b" });
        const b = await criarGrupo(tx, { slug: "apagar-c" });
        for (const [g, sufixo] of [
          [a, "ga"],
          [b, "gb"],
        ] as const) {
          await semearTitular(tx, g, sufixo);
          await tx`
            insert into public.empreendimentos (slug, nome, cidade, bairro, grupo_id)
            values (${`imovel-0202-${sufixo}`}, 'Imóvel', 'Barueri', 'Centro', ${g.grupoId})
          `;
          await tx`
            insert into public.corretor_whatsapp_instancias (corretor_id, instance_name, status_conexao)
            values (${g.corretorId}, ${`teste-0202-${sufixo}`}, 'desconectado')
          `;
        }
        const vizinhoAntes = await linhasDoGrupo(tx, b.grupoId);
        await cancelar(tx, a.grupoId, 91);

        await comoServico(tx, a.gestorUserId, async (s) => {
          const [{ r }] = await s<{ r: { linhas: number } }[]>`select public.apagar_dados_do_grupo(${a.grupoId}) as r`;
          expect(r.linhas).toBeGreaterThan(0);
          await s`reset role`;

          expect(await linhasDoGrupo(s, a.grupoId)).toEqual({});
          expect(await linhasDoGrupo(s, b.grupoId)).toEqual(vizinhoAntes);
          const [grupo] = await s<{ dados_apagados_em: Date | null }[]>`
            select dados_apagados_em from public.grupos where id = ${a.grupoId}
          `;
          expect(grupo.dados_apagados_em).not.toBeNull();

          await expect(s.savepoint((sp) => sp`select public.apagar_dados_do_grupo(${a.grupoId})`)).rejects.toThrow(
            /ja_apagado/,
          );
        });
      });
    });
  });
});
