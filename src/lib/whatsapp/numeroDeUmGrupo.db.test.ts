// Um número de WhatsApp pertence a um grupo só (0198), medido no banco local
// (`npm run db:teste`). A trava é por GRUPO: o mesmo número em duas
// instâncias do mesmo grupo passa (é o colega herdando o número de quem saiu
// sem desconectar), e em instância de outro grupo é recusado.
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
} from "@/lib/grupos/apoioDoBanco";

async function instancia(tx: Conexao, corretorId: string, nome: string, telefone: string | null): Promise<string> {
  const [{ id }] = await tx<{ id: string }[]>`
    insert into public.corretor_whatsapp_instancias (corretor_id, instance_name, status_conexao, telefone_conectado)
    values (${corretorId}, ${nome}, ${telefone ? "conectado" : "desconectado"}, ${telefone})
    returning id
  `;
  return id;
}

async function recusa(tx: TransactionSql, fn: (t: TransactionSql) => Promise<unknown>): Promise<string | null> {
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp);
    });
    return null;
  } catch (erro) {
    return (erro as Error).message;
  }
}

describe.skipIf(!process.env.DB_TESTE_URL)("um número de WhatsApp, um grupo (0198)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("recusa conectar em outro grupo o número que já está num grupo", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "num-a" });
      const b = await criarGrupo(tx, { slug: "num-b" });
      await instancia(tx, a.corretorId, "num-a-1", "5511988887777");
      const idB = await instancia(tx, b.corretorId, "num-b-1", null);

      const erro = await recusa(tx, (t) => t`
        update public.corretor_whatsapp_instancias set telefone_conectado = '5511988887777' where id = ${idB}
      `);
      expect(erro).toContain("numero_em_outro_grupo");

      // As duas formas do nono dígito são o mesmo número.
      const semNove = await recusa(tx, (t) => t`
        update public.corretor_whatsapp_instancias set telefone_conectado = '551188887777' where id = ${idB}
      `);
      expect(semNove).toContain("numero_em_outro_grupo");

      // Insert também.
      const naCriacao = await recusa(tx, (t) => instancia(t, b.gestorId, "num-b-2", "+55 (11) 98888-7777"));
      expect(naCriacao).toContain("numero_em_outro_grupo");
    });
  });

  it("deixa o mesmo número reconectar no mesmo grupo, inclusive em outra instância", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "num-mesmo" });
      const id = await instancia(tx, a.corretorId, "num-mesmo-1", "5511977776666");
      // Reconexão: o webhook regrava o mesmo número.
      await tx`update public.corretor_whatsapp_instancias set telefone_conectado = '5511977776666' where id = ${id}`;
      // O colega do mesmo grupo herda o número de quem saiu sem desconectar.
      await instancia(tx, a.gestorId, "num-mesmo-2", "5511977776666");
      const [{ n }] = await tx<{ n: number }[]>`
        select count(*)::int as n from public.corretor_whatsapp_instancias
         where public.chave_do_numero_whatsapp(telefone_conectado) = public.chave_do_numero_whatsapp('5511977776666')
      `;
      expect(n).toBe(2);
    });
  });

  it("libera o número quando o grupo antigo desconecta (telefone_conectado apagado)", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "num-libera-a" });
      const b = await criarGrupo(tx, { slug: "num-libera-b" });
      const idA = await instancia(tx, a.corretorId, "num-libera-a", "5521966665555");
      await tx`update public.corretor_whatsapp_instancias set telefone_conectado = null, status_conexao = 'desconectado' where id = ${idA}`;
      await instancia(tx, b.corretorId, "num-libera-b", "5521966665555");
    });
  });

  it("a pergunta prévia diz só sim/não e só a chave de serviço faz", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "num-pergunta-a" });
      const b = await criarGrupo(tx, { slug: "num-pergunta-b" });
      await instancia(tx, a.corretorId, "num-pergunta-a", "5531955554444");

      const [{ deB }] = await tx<{ deB: boolean }[]>`
        select public.numero_whatsapp_em_outro_grupo(${b.grupoId}, '553155554444') as "deB"
      `;
      const [{ deA }] = await tx<{ deA: boolean }[]>`
        select public.numero_whatsapp_em_outro_grupo(${a.grupoId}, '5531955554444') as "deA"
      `;
      expect(deB).toBe(true);
      expect(deA).toBe(false);

      const pelaSessao = await recusa(tx, (t) =>
        comoUsuario(t, b.corretorUserId, (u) => u`
          select public.numero_whatsapp_em_outro_grupo(${b.grupoId}, '5531955554444')
        `),
      );
      expect(pelaSessao).toMatch(/permission denied/);
    });
  });
});
