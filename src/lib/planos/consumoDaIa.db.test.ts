// O livro do consumo da IA (0233), medido no banco local (`npm run db:teste`):
// o grupo sai do corretor, o logado não lê nem escreve, e a soma do mês junta
// o livro com a telemetria antiga só ANTES da primeira linha do livro. Pula
// sem DB_TESTE_URL.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import { comoUsuario, conectar, criarGrupo, emTransacaoDesfeita, soltarSuite, travarSuite } from "@/lib/grupos/apoioDoBanco";

type Linha = {
  grupo_id: string;
  finalidade: string;
  modelo: string;
  chamadas: string;
  tokens_entrada: string;
  tokens_saida: string;
  segundos_de_audio: string;
};

describe.skipIf(!process.env.DB_TESTE_URL)("livro do consumo da IA (0233)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("o grupo vem do corretor; grupo informado diferente do dele é recusado", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "consumo-a" });
      const b = await criarGrupo(tx, { slug: "consumo-b" });
      const [linha] = await tx<{ grupo_id: string }[]>`
        insert into public.ia_consumo (corretor_id, finalidade, modelo, tokens_entrada, tokens_saida)
        values (${a.corretorId}, 'dossie', 'gpt-4.1-mini', 100, 10)
        returning grupo_id
      `;
      expect(linha.grupo_id).toBe(a.grupoId);

      await expect(
        tx.savepoint((s) => s`
          insert into public.ia_consumo (grupo_id, corretor_id, finalidade, modelo)
          values (${b.grupoId}, ${a.corretorId}, 'dossie', 'gpt-4.1-mini')
        `),
      ).rejects.toThrow(/grupo da linha difere/);
    });
  });

  it("soma por grupo, finalidade e modelo; a telemetria antiga só conta antes da primeira linha do livro", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "consumo-soma" });
      // O livro começa em 30/09 (primeira linha): dali em diante a telemetria
      // antiga não conta mais, porque a mesma chamada já está no livro.
      await tx`
        insert into public.ia_interacoes (grupo_id, corretor_id, origem, prompt_versao, acao, modelo, tokens_entrada, tokens_saida, created_at)
        values (${a.grupoId}, ${a.corretorId}, 'webhook', 'teste', 'respondida', 'gpt-4.1-mini', 50, 5, '2026-10-02T12:00:00Z'),
               (${a.grupoId}, ${a.corretorId}, 'webhook', 'teste', 'respondida', 'gpt-4.1-mini', 999, 999, '2026-10-20T12:00:00Z')
      `;
      await tx`
        insert into public.ia_consumo (corretor_id, finalidade, modelo, tokens_entrada, tokens_saida, segundos_de_audio, criado_em)
        values (${a.corretorId}, 'atendimento', 'gpt-4.1-mini', 999, 999, null, '2026-10-20T12:00:00Z'),
               (${a.corretorId}, 'dossie', 'gpt-4.1-mini', 300, 30, null, '2026-10-10T12:00:00Z'),
               (${a.corretorId}, 'dossie', 'gpt-4.1-mini', 200, 20, null, '2026-10-11T12:00:00Z'),
               (${a.corretorId}, 'transcricao_audio', 'whisper-large-v3-turbo', null, null, 12.5, '2026-10-12T12:00:00Z'),
               (${a.corretorId}, 'dossie', 'gpt-4.1-mini', 7, 7, null, '2026-09-30T12:00:00Z')
      `;

      const linhas = await tx<Linha[]>`
        select * from public.consumo_da_ia_por_grupo('2026-10-01T03:00:00Z') where grupo_id = ${a.grupoId}
      `;
      const de = (f: string, m: string) => linhas.find((l) => l.finalidade === f && l.modelo === m);
      expect(Number(de("dossie", "gpt-4.1-mini")?.tokens_entrada)).toBe(500);
      expect(Number(de("dossie", "gpt-4.1-mini")?.chamadas)).toBe(2);
      expect(Number(de("transcricao_audio", "whisper-large-v3-turbo")?.segundos_de_audio)).toBe(12.5);
      // Só o livro: a telemetria de outubro (50 e 999) veio depois do começo dele.
      const atendimento = linhas.filter((l) => l.finalidade === "atendimento");
      expect(atendimento.map((l) => Number(l.tokens_entrada))).toEqual([999]);
    });
  });

  it("sem livro nenhum, a soma é a da telemetria (o mês da troca não começa do zero)", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      await tx`delete from public.ia_consumo`;
      const a = await criarGrupo(tx, { slug: "consumo-antes" });
      await tx`
        insert into public.ia_interacoes (grupo_id, corretor_id, origem, prompt_versao, acao, modelo, tokens_entrada, tokens_saida, created_at)
        values (${a.grupoId}, ${a.corretorId}, 'consultor', 'teste', 'respondida', 'gpt-4.1-mini', 40, 4, '2026-10-05T12:00:00Z')
      `;
      const linhas = await tx<Linha[]>`
        select * from public.consumo_da_ia_por_grupo('2026-10-01T03:00:00Z') where grupo_id = ${a.grupoId}
      `;
      expect(linhas.map((l) => [l.finalidade, Number(l.tokens_entrada)])).toEqual([["consultor", 40]]);
    });
  });

  it("o logado não lê o livro nem executa a soma; a chave de serviço executa", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "consumo-rls" });
      await tx`insert into public.ia_consumo (corretor_id, finalidade, modelo) values (${a.corretorId}, 'dossie', 'gpt-4.1-mini')`;
      await expect(
        comoUsuario(tx, a.gestorUserId, (eu) => eu`select count(*) from public.ia_consumo`),
      ).rejects.toThrow(/permission denied/);
    });
    const [r] = await sql<{ auth: boolean; anon: boolean; servico: boolean }[]>`
      select has_function_privilege('authenticated', 'public.consumo_da_ia_por_grupo(timestamptz)', 'execute') as auth,
             has_function_privilege('anon', 'public.consumo_da_ia_por_grupo(timestamptz)', 'execute') as anon,
             has_function_privilege('service_role', 'public.consumo_da_ia_por_grupo(timestamptz)', 'execute') as servico
    `;
    expect(r).toEqual({ auth: false, anon: false, servico: true });
  });
});
