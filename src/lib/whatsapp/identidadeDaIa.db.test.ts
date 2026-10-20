// A identidade da IA de cada grupo no banco (0199), medida no banco local
// (`npm run db:teste`). Pula sem DB_TESTE_URL; cada teste roda numa
// transação desfeita no fim.
//
// O que a migration promete e só o banco prova: a escrita é do gestor ATIVO,
// sempre no grupo da sessão (nunca de outro grupo), recusa o absurdo, deixa
// rastro em `admin_eventos` no grupo certo, e o logado lê as colunas novas do
// próprio grupo (a 0196 recorta `grupos` por coluna).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql, TransactionSql } from "postgres";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import {
  comoUsuario,
  conectar,
  criarGrupo,
  emTransacaoDesfeita,
  soltarSuite,
  travarSuite,
} from "@/lib/grupos/apoioDoBanco";

describe.skipIf(!process.env.DB_TESTE_URL)("identidade da IA por grupo (0199)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  const gravar = (eu: TransactionSql, casa: string | null, nome: string | null, regiao: string | null, tom: string | null) =>
    eu<{ ok: boolean }[]>`select public.atualizar_identidade_da_ia(${casa}, ${nome}, ${regiao}, ${tom}) as ok`;

  it("o grupo 1 nasce sem configuração (o prompt dele sai igual ao de antes)", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const [g] = await tx`
        select ia_nome_da_casa, ia_nome_assistente, ia_regiao, ia_tom
          from public.grupos where id = ${GRUPO_NEXT_HOME_ID}
      `;
      expect(g).toEqual({ ia_nome_da_casa: null, ia_nome_assistente: null, ia_regiao: null, ia_tom: null });
    });
  });

  it("o gestor grava no próprio grupo, e só nele", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "ia-a", nome: "Casa A" });
      const b = await criarGrupo(tx, { slug: "ia-b", nome: "Casa B" });

      const { ok, linhaA, linhaB, evento } = await comoUsuario(tx, b.gestorUserId, async (eu) => {
        const [{ ok }] = await gravar(eu, "  Horizonte   Imóveis ", "Ana", "Campinas", "formal_direto");
        await eu`reset role`;
        const [linhaB] = await eu`
          select ia_nome_da_casa, ia_nome_assistente, ia_regiao, ia_tom from public.grupos where id = ${b.grupoId}
        `;
        const [linhaA] = await eu`
          select ia_nome_da_casa, ia_nome_assistente, ia_regiao, ia_tom from public.grupos where id = ${a.grupoId}
        `;
        const [evento] = await eu`
          select grupo_id, ator_id, detalhes from public.admin_eventos
           where acao = 'identidade_da_ia_alterada' and ator_id = ${b.gestorId}
        `;
        return { ok, linhaA, linhaB, evento };
      });

      expect(ok).toBe(true);
      expect(linhaB).toEqual({
        ia_nome_da_casa: "Horizonte Imóveis",
        ia_nome_assistente: "Ana",
        ia_regiao: "Campinas",
        ia_tom: "formal_direto",
      });
      expect(linhaA).toEqual({ ia_nome_da_casa: null, ia_nome_assistente: null, ia_regiao: null, ia_tom: null });
      expect(evento.grupo_id).toBe(b.grupoId);
      expect(evento.ator_id).toBe(b.gestorId);
      expect(evento.detalhes).toMatchObject({ nome_da_casa: "Horizonte Imóveis", tom: "formal_direto" });
    });
  });

  it("campo vazio volta a nulo (o padrão do grupo)", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "ia-vazio" });
      const linha = await comoUsuario(tx, b.gestorUserId, async (eu) => {
        await gravar(eu, "Horizonte", "Ana", "Campinas", "formal_direto");
        await gravar(eu, "   ", "", null, "");
        await eu`reset role`;
        const [linha] = await eu`select ia_nome_da_casa, ia_nome_assistente, ia_regiao, ia_tom from public.grupos where id = ${b.grupoId}`;
        return linha;
      });
      expect(linha).toEqual({ ia_nome_da_casa: null, ia_nome_assistente: null, ia_regiao: null, ia_tom: null });
    });
  });

  it("corretor comum é recusado", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "ia-corretor" });
      const erro = await comoUsuario(tx, b.corretorUserId, async (eu) => {
        try {
          await gravar(eu, "Horizonte", null, null, null);
          return null;
        } catch (e) {
          return (e as { code?: string }).code;
        }
      });
      expect(erro).toBe("42501");
    });
  });

  it("recusa o absurdo: tom fora da lista e nome longo demais", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "ia-absurdo" });
      const respostas = await comoUsuario(tx, b.gestorUserId, async (eu) => [
        (await gravar(eu, null, null, null, "gritando"))[0].ok,
        (await gravar(eu, null, "a".repeat(31), null, null))[0].ok,
        (await gravar(eu, "x", null, null, null))[0].ok,
      ]);
      expect(respostas).toEqual([false, false, false]);
    });
  });

  it("o logado lê as colunas da IA do próprio grupo, e não as do vizinho", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "ia-le-a" });
      const b = await criarGrupo(tx, { slug: "ia-le-b" });
      await tx`update public.grupos set ia_nome_assistente = 'Ana' where id = ${a.grupoId}`;
      const linhas = await comoUsuario(tx, b.corretorUserId, (eu) =>
        eu`select id, ia_nome_da_casa, ia_nome_assistente, ia_regiao, ia_tom from public.grupos`,
      );
      expect(linhas.map((l) => l.id)).toEqual([b.grupoId]);
    });
  });

  it("o anônimo não executa a função", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const [{ pode }] = await tx`
        select has_function_privilege('anon', 'public.atualizar_identidade_da_ia(text, text, text, text)', 'execute') as pode
      `;
      expect(pode).toBe(false);
    });
  });
});
