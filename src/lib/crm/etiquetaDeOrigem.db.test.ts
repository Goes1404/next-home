// A etiqueta de origem do lead e a devolução dos leads da imobiliária (0200),
// medidas no banco local (`npm run db:teste`). Pula sem DB_TESTE_URL; cada
// teste roda numa transação desfeita no fim.
//
// O que a migration promete e só o banco prova: o gatilho decide a etiqueta
// (o valor mandado é ignorado), ninguém a edita depois, o repasse da gestão a
// torna da imobiliária, e a devolução na saída só move o que é da
// imobiliária, só dentro do grupo, só pela mão de um gestor.

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
} from "@/lib/grupos/apoioDoBanco";

type Lead = { origem: string; atribuicao?: string | null; metaAdId?: string | null };

async function novoLead(tx: Conexao, corretorId: string | null, grupoId: string, l: Lead, trazidoPor?: string) {
  const [{ id }] = await tx<{ id: string }[]>`
    insert into public.leads (nome, telefone, origem, origem_atribuicao, meta_ad_id, corretor_id, grupo_id, trazido_por)
    values ('Fulano', '5511999990000', ${l.origem}, ${l.atribuicao ?? null}, ${l.metaAdId ?? null},
      ${corretorId}, ${grupoId}, ${trazidoPor ?? null})
    returning id
  `;
  return id;
}

async function etiqueta(tx: Conexao, id: string): Promise<string> {
  const [{ trazido_por }] = await tx<{ trazido_por: string }[]>`select trazido_por from public.leads where id = ${id}`;
  return trazido_por;
}

async function novoCorretor(tx: Conexao, grupoId: string, slug: string) {
  const userId = await criarUsuario(tx, `${slug}@saida.teste`);
  const [{ id }] = await tx<{ id: string }[]>`
    insert into public.corretores (nome, creci, whatsapp, slug, papel, user_id, grupo_id)
    values (${`Corretor ${slug}`}, ${`TESTE-${slug}`}, '5511900000000', ${slug}, 'corretor', ${userId}, ${grupoId})
    returning id
  `;
  return id;
}

describe.skipIf(!process.env.DB_TESTE_URL)("etiqueta de origem e saída do corretor (0200)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("classifica cada caminho de entrada", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "et-a" });
      const casos: [Lead, string][] = [
        [{ origem: "painel/manual", atribuicao: "manual" }, "corretor"],
        [{ origem: "whatsapp/ativado_pelo_corretor", atribuicao: "link" }, "corretor"],
        [{ origem: "indicacao", atribuicao: "manual" }, "corretor"],
        [{ origem: "site/contato", atribuicao: "link" }, "corretor"],
        [{ origem: "meta/ctwa", atribuicao: "link", metaAdId: "123" }, "corretor"],
        [{ origem: "painel/importacao", atribuicao: "manual" }, "corretor"],
        [{ origem: "whatsapp/organico", atribuicao: "link" }, "imobiliaria"],
        [{ origem: "meta/ctwa", atribuicao: "link" }, "imobiliaria"],
        [{ origem: "meta/leadads", atribuicao: "link" }, "imobiliaria"],
        [{ origem: "inbound/zap", atribuicao: "manual" }, "imobiliaria"],
        [{ origem: "parceiro", atribuicao: "link" }, "imobiliaria"],
        [{ origem: "site/contato", atribuicao: "roleta" }, "imobiliaria"],
        [{ origem: "painel/manual", atribuicao: "roleta" }, "imobiliaria"],
      ];
      for (const [lead, esperado] of casos) {
        const id = await novoLead(tx, g.corretorId, g.grupoId, lead);
        expect(await etiqueta(tx, id), JSON.stringify(lead)).toBe(esperado);
      }
    });
  });

  it("lead que nasce sem dono cai na roleta e é da imobiliária", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "et-b" });
      const id = await novoLead(tx, null, g.grupoId, { origem: "site/contato" });
      expect(await etiqueta(tx, id)).toBe("imobiliaria");
    });
  });

  it("importação feita por gestor é da imobiliária; por corretor, dele", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "et-c" });
      const doGestor = await comoUsuario(tx, g.gestorUserId, async (eu) => {
        const [{ id }] = await eu<{ id: string }[]>`
          insert into public.leads (nome, telefone, origem, origem_atribuicao, corretor_id)
          values ('Importado', '5511999990001', 'painel/importacao', 'manual', ${g.gestorId}) returning id`;
        await eu`reset role`;
        return etiqueta(eu, id);
      });
      const doCorretor = await comoUsuario(tx, g.corretorUserId, async (eu) => {
        const [{ id }] = await eu<{ id: string }[]>`
          insert into public.leads (nome, telefone, origem, origem_atribuicao, corretor_id)
          values ('Importado', '5511999990002', 'painel/importacao', 'manual', ${g.corretorId}) returning id`;
        await eu`reset role`;
        return etiqueta(eu, id);
      });
      expect(doGestor).toBe("imobiliaria");
      expect(doCorretor).toBe("corretor");
    });
  });

  it("o valor mandado no insert é ignorado e ninguém edita depois", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "et-d" });
      const id = await novoLead(tx, g.corretorId, g.grupoId, { origem: "meta/leadads", atribuicao: "link" }, "corretor");
      expect(await etiqueta(tx, id)).toBe("imobiliaria");

      // Nem a chave de serviço (postgres) troca a etiqueta à mão.
      await tx`update public.leads set trazido_por = 'corretor' where id = ${id}`;
      expect(await etiqueta(tx, id)).toBe("imobiliaria");

      // O corretor nem tem o privilégio de tentar.
      const recusa = await comoUsuario(tx, g.corretorUserId, async (eu) =>
        eu.savepoint((s) => s`update public.leads set trazido_por = 'corretor' where id = ${id}`).then(
          () => null,
          (e: Error) => e.message,
        ),
      );
      expect(recusa).toMatch(/permission denied/);
    });
  });

  it("repasse da gestão torna o lead da imobiliária", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "et-e" });
      const id = await novoLead(tx, g.corretorId, g.grupoId, { origem: "painel/manual", atribuicao: "manual" });
      expect(await etiqueta(tx, id)).toBe("corretor");
      await tx`update public.leads set corretor_id = ${g.gestorId}, origem_atribuicao = 'manual' where id = ${id}`;
      expect(await etiqueta(tx, id)).toBe("imobiliaria");
    });
  });

  it("a ficha nascida pelo convite e promovida pelo impulsionamento do corretor vira dele", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "et-f" });
      const id = await novoLead(tx, g.corretorId, g.grupoId, { origem: "whatsapp/organico", atribuicao: "link" });
      expect(await etiqueta(tx, id)).toBe("imobiliaria");
      await tx`update public.leads set origem = 'meta/ctwa', meta_ad_id = '999' where id = ${id}`;
      expect(await etiqueta(tx, id)).toBe("corretor");
      // Depois de promovida, outra troca de origem não mexe mais.
      await tx`update public.leads set origem = 'meta/leadads' where id = ${id}`;
      expect(await etiqueta(tx, id)).toBe("corretor");
    });
  });

  describe("devolver_leads_da_imobiliaria", () => {
    const devolver = (eu: TransactionSql, corretor: string, destino: string | null) =>
      eu<{ r: { movidos: number; sem_destino: number } }[]>`
        select public.devolver_leads_da_imobiliaria(${corretor}, ${destino}) as r`;

    it("passa só os leads da imobiliária para o corretor escolhido", async () => {
      await emTransacaoDesfeita(sql, async (tx) => {
        const g = await criarGrupo(tx, { slug: "dv-a" });
        const saindo = await novoCorretor(tx, g.grupoId, "dv-a-saindo");
        const daCasa = await novoLead(tx, saindo, g.grupoId, { origem: "meta/leadads", atribuicao: "link" });
        const dele = await novoLead(tx, saindo, g.grupoId, { origem: "painel/manual", atribuicao: "manual" });

        const { r, donoCasa, donoDele, repasse, evento } = await comoUsuario(tx, g.gestorUserId, async (eu) => {
          const [{ r }] = await devolver(eu, saindo, g.corretorId);
          await eu`reset role`;
          const [{ corretor_id: donoCasa }] = await eu`select corretor_id from public.leads where id = ${daCasa}`;
          const [{ corretor_id: donoDele }] = await eu`select corretor_id from public.leads where id = ${dele}`;
          const [repasse] = await eu`
            select detalhes from public.lead_interacoes where lead_id = ${daCasa} and tipo = 'repasse'`;
          const [evento] = await eu`
            select grupo_id, detalhes from public.admin_eventos
             where acao = 'leads_redistribuidos' and alvo_corretor_id = ${saindo}`;
          return { r, donoCasa, donoDele, repasse, evento };
        });

        expect(r).toEqual({ movidos: 1, sem_destino: 0 });
        expect(donoCasa).toBe(g.corretorId);
        expect(donoDele).toBe(saindo);
        expect(repasse.detalhes).toMatchObject({ origem_anterior: "link", de: saindo, para: g.corretorId });
        expect(evento.grupo_id).toBe(g.grupoId);
        expect(evento.detalhes).toMatchObject({ motivo: "saida_do_corretor", movidos: 1 });
      });
    });

    it("pela roleta, espalha entre a equipe ativa e nunca devolve para quem sai", async () => {
      await emTransacaoDesfeita(sql, async (tx) => {
        const g = await criarGrupo(tx, { slug: "dv-b" });
        const saindo = await novoCorretor(tx, g.grupoId, "dv-b-saindo");
        const outro = await novoCorretor(tx, g.grupoId, "dv-b-outro");
        const desligado = await novoCorretor(tx, g.grupoId, "dv-b-desligado");
        await tx`update public.corretores set ativo = false where id = ${desligado}`;
        for (let i = 0; i < 6; i++) {
          await novoLead(tx, saindo, g.grupoId, { origem: "site/contato", atribuicao: "roleta" });
        }

        const { r, donos } = await comoUsuario(tx, g.gestorUserId, async (eu) => {
          const [{ r }] = await devolver(eu, saindo, null);
          await eu`reset role`;
          const donos = await eu<{ corretor_id: string; n: number }[]>`
            select corretor_id, count(*)::int as n from public.leads
             where grupo_id = ${g.grupoId} group by corretor_id`;
          return { r, donos };
        });

        expect(r.movidos).toBe(6);
        const porDono = Object.fromEntries(donos.map((d) => [d.corretor_id, d.n]));
        expect(porDono[saindo]).toBeUndefined();
        expect(porDono[desligado]).toBeUndefined();
        // Três ativos recebendo seis: dois para cada.
        expect([porDono[g.gestorId], porDono[g.corretorId], porDono[outro]]).toEqual([2, 2, 2]);
      });
    });

    it("recusa corretor comum, corretor de outro grupo e destino de outro grupo", async () => {
      await emTransacaoDesfeita(sql, async (tx) => {
        const a = await criarGrupo(tx, { slug: "dv-c" });
        const b = await criarGrupo(tx, { slug: "dv-d" });
        await novoLead(tx, a.corretorId, a.grupoId, { origem: "meta/leadads", atribuicao: "link" });

        const tentar = (userId: string, corretor: string, destino: string | null) =>
          comoUsuario(tx, userId, async (eu) =>
            eu.savepoint((s) => devolver(s, corretor, destino)).then(
              () => "ok",
              (e: Error) => e.message,
            ),
          );

        expect(await tentar(a.corretorUserId, a.corretorId, a.gestorId)).toMatch(/sem_permissao/);
        expect(await tentar(b.gestorUserId, a.corretorId, b.corretorId)).toMatch(/corretor_nao_encontrado/);
        expect(await tentar(a.gestorUserId, a.corretorId, b.corretorId)).toMatch(/destino_invalido/);
        expect(await tentar(a.gestorUserId, a.corretorId, a.corretorId)).toMatch(/destino_invalido/);

        const [{ corretor_id }] = await tx`select corretor_id from public.leads where grupo_id = ${a.grupoId}`;
        expect(corretor_id).toBe(a.corretorId);
      });
    });

    it("anon não executa", async () => {
      await emTransacaoDesfeita(sql, async (tx) => {
        const [{ pode }] = await tx`
          select has_function_privilege('anon', 'public.devolver_leads_da_imobiliaria(uuid, uuid)', 'execute') as pode`;
        expect(pode).toBe(false);
      });
    });
  });
});
