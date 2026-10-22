// Os contadores de artes, vídeos e mensagens de lista (0214), medidos no banco
// local (`npm run db:teste`).
//
// O contador mora no banco, em gatilhos sobre as tabelas que já registram cada
// geração: soma no grupo da linha e no mês de São Paulo, não devolve a cota a
// quem apaga a arte, e tira só o que de fato não foi gasto (vídeo em erro,
// mensagem em erro). Ninguém pela API lê nem escreve o contador nem o teto.
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
  type GrupoDeTeste,
} from "@/lib/grupos/apoioDoBanco";

type Uso = { artes: number; videos: number; mensagens_lista: number; respostas: number };

async function usoDo(tx: Conexao, grupoId: string, mes: string): Promise<Uso> {
  const linhas = await tx<Uso[]>`
    select artes, videos, mensagens_lista, respostas from public.uso_da_ia
     where grupo_id = ${grupoId} and mes = ${mes}::date
  `;
  return linhas[0] ?? { artes: 0, videos: 0, mensagens_lista: 0, respostas: 0 };
}

async function arte(tx: Conexao, g: GrupoDeTeste, criadaEm = new Date().toISOString()): Promise<string> {
  const [{ id }] = await tx<{ id: string }[]>`
    insert into public.imagens_geradas (corretor_id, prompt, modelo, url, created_at)
    values (${g.corretorId}, 'fachada', 'teste', 'https://exemplo/a.png', ${criadaEm})
    returning id
  `;
  return id;
}

async function video(tx: Conexao, g: GrupoDeTeste, criadoEm = new Date().toISOString()): Promise<string> {
  const [{ id }] = await tx<{ id: string }[]>`
    insert into public.video_jobs (corretor_id, created_at) values (${g.corretorId}, ${criadoEm}) returning id
  `;
  return id;
}

async function lista(tx: Conexao, g: GrupoDeTeste, mensagens: number): Promise<string[]> {
  const [{ id: campanha }] = await tx<{ id: string }[]>`
    insert into public.whatsapp_campanhas (corretor_id, titulo, mensagem_base)
    values (${g.corretorId}, 'Lista', 'Oi')
    returning id
  `;
  const ids: string[] = [];
  for (let i = 0; i < mensagens; i++) {
    const [{ id }] = await tx<{ id: string }[]>`
      insert into public.whatsapp_campanhas_fila (campanha_id, telefone, mensagem_personalizada)
      values (${campanha}, ${`551190000${String(i).padStart(4, "0")}`}, 'Oi')
      returning id
    `;
    ids.push(id);
  }
  return ids;
}

const MES = new Date().toISOString().slice(0, 7) + "-01";

describe.skipIf(!process.env.DB_TESTE_URL)("limites do plano (0214)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("conta artes, vídeos e mensagens de lista no grupo da linha, sem misturar grupos", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "lim-a" });
      const b = await criarGrupo(tx, { slug: "lim-b" });
      await arte(tx, a);
      await arte(tx, a);
      await video(tx, a);
      await lista(tx, a, 3);
      await arte(tx, b);

      const ua = await usoDo(tx, a.grupoId, MES);
      expect([ua.artes, ua.videos, ua.mensagens_lista]).toEqual([2, 1, 3]);
      const ub = await usoDo(tx, b.grupoId, MES);
      expect([ub.artes, ub.videos, ub.mensagens_lista]).toEqual([1, 0, 0]);
    });
  });

  it("apagar a arte ou o vídeo NÃO devolve a cota", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "lim-apaga" });
      const imagem = await arte(tx, a);
      const job = await video(tx, a);
      await tx`delete from public.imagens_geradas where id = ${imagem}`;
      await tx`delete from public.video_jobs where id = ${job}`;
      const u = await usoDo(tx, a.grupoId, MES);
      expect([u.artes, u.videos]).toEqual([1, 1]);
    });
  });

  it("vídeo que termina em erro (crédito devolvido) e mensagem em erro saem da conta, uma vez só", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "lim-erro" });
      const job = await video(tx, a);
      await video(tx, a);
      const mensagens = await lista(tx, a, 3);

      await tx`update public.video_jobs set status = 'renderizando' where id = ${job}`;
      expect((await usoDo(tx, a.grupoId, MES)).videos).toBe(2);
      await tx`update public.video_jobs set status = 'erro' where id = ${job}`;
      await tx`update public.video_jobs set erro_motivo = 'x' where id = ${job}`;
      await tx`update public.video_jobs set status = 'erro' where id = ${job}`;
      expect((await usoDo(tx, a.grupoId, MES)).videos).toBe(1);

      await tx`update public.whatsapp_campanhas_fila set status = 'enviado' where id = ${mensagens[0]}`;
      await tx`update public.whatsapp_campanhas_fila set status = 'erro' where id = ${mensagens[1]}`;
      await tx`update public.whatsapp_campanhas_fila set erro_motivo = 'sem WhatsApp' where id = ${mensagens[1]}`;
      expect((await usoDo(tx, a.grupoId, MES)).mensagens_lista).toBe(2);
    });
  });

  it("o mês é o de São Paulo: 22h do dia 31 ainda conta no mês que acaba", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "lim-fuso" });
      await arte(tx, a, "2026-11-01T01:00:00Z");
      await arte(tx, a, "2026-11-01T04:00:00Z");
      await video(tx, a, "2026-11-01T01:00:00Z");
      expect((await usoDo(tx, a.grupoId, "2026-10-01")).artes).toBe(1);
      expect((await usoDo(tx, a.grupoId, "2026-11-01")).artes).toBe(1);
      expect((await usoDo(tx, a.grupoId, "2026-10-01")).videos).toBe(1);
    });
  });

  it("não mexe nas respostas da IA (0197) e o piso é zero", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "lim-resp" });
      await tx`
        insert into public.ia_interacoes (grupo_id, corretor_id, origem, prompt_versao, acao)
        values (${a.grupoId}, ${a.corretorId}, 'webhook', 'teste', 'respondida')
      `;
      await arte(tx, a);
      const u = await usoDo(tx, a.grupoId, MES);
      expect([u.respostas, u.artes]).toEqual([1, 1]);

      // Contador zerado à mão + uma falha tardia: não fica negativo.
      await tx`update public.uso_da_ia set videos = 0 where grupo_id = ${a.grupoId}`;
      const job = await video(tx, a);
      await tx`update public.uso_da_ia set videos = 0 where grupo_id = ${a.grupoId}`;
      await tx`update public.video_jobs set status = 'erro' where id = ${job}`;
      expect((await usoDo(tx, a.grupoId, MES)).videos).toBe(0);
    });
  });

  it("ninguém lê nem escreve o contador nem o teto pela API; o gatilho não é chamável", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "lim-api" });
      await arte(tx, a);
      for (const userId of [a.gestorUserId, a.corretorUserId]) {
        await expect(
          comoUsuario(tx, userId, (eu) => eu`select artes from public.uso_da_ia`),
        ).rejects.toThrow(/permission denied/);
        await expect(
          comoUsuario(tx, userId, (eu) => eu`update public.uso_da_ia set artes = 0`),
        ).rejects.toThrow(/permission denied/);
      }
      const [p] = await tx<{ anon: boolean; logado: boolean; t1: boolean; t2: boolean; t3: boolean; f1: boolean; f2: boolean }[]>`
        select has_function_privilege('anon', 'public.contar_uso_de_recurso()', 'execute') as anon,
               has_function_privilege('authenticated', 'public.contar_uso_de_recurso()', 'execute') as logado,
               has_column_privilege('authenticated', 'public.grupos', 'teto_artes', 'select') as t1,
               has_column_privilege('authenticated', 'public.grupos', 'teto_videos', 'select') as t2,
               has_column_privilege('authenticated', 'public.grupos', 'teto_mensagens_lista', 'select') as t3,
               has_column_privilege('anon', 'public.grupos', 'teto_artes', 'select') as f1,
               has_column_privilege('authenticated', 'public.grupos', 'teto_artes', 'update') as f2
      `;
      expect(p).toEqual({ anon: false, logado: false, t1: false, t2: false, t3: false, f1: false, f2: false });
    });
  });

  it("a plataforma ajusta os tetos, e teto negativo é recusado", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "lim-teto" });
      await tx`update public.grupos set teto_artes = 5, teto_videos = 0, teto_mensagens_lista = 300 where id = ${a.grupoId}`;
      const [g] = await tx<{ teto_artes: number; teto_videos: number; teto_mensagens_lista: number }[]>`
        select teto_artes, teto_videos, teto_mensagens_lista from public.grupos where id = ${a.grupoId}
      `;
      expect(g).toEqual({ teto_artes: 5, teto_videos: 0, teto_mensagens_lista: 300 });
      for (const coluna of ["teto_artes", "teto_videos", "teto_mensagens_lista"]) {
        await expect(
          tx.savepoint((sp) => sp.unsafe(`update public.grupos set ${coluna} = -1 where id = '${a.grupoId}'`)),
        ).rejects.toThrow(/check/);
      }
    });
  });
});
