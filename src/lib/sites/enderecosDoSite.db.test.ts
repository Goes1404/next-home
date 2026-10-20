// O endereço de cada site (0201), medido no banco local (`npm run db:teste`).
//
// `site_do_endereco` é a única porta do site público para a tabela: devolve o
// grupo do host pedido, nada para host desconhecido ou grupo encerrado. Só a
// chave de serviço a executa: o `anon` não lê a tabela nem chama a função.
// Pula sem DB_TESTE_URL. Cada teste roda numa transação desfeita no fim.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sql, TransactionSql } from "postgres";
import {
  comoUsuario,
  conectar,
  criarGrupo,
  emTransacaoDesfeita,
  soltarSuite,
  travarSuite,
} from "@/lib/grupos/apoioDoBanco";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { ENDERECOS_DA_NEXT_HOME } from "./endereco";

type Site = { grupo_id: string; nome: string; host_principal: string };

async function comoAnon<T>(tx: TransactionSql, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  const r = await tx.savepoint(async (sp) => {
    await sp`set local role anon`;
    const dentro = await fn(sp as unknown as TransactionSql);
    await sp`reset role`;
    return dentro;
  });
  return r as T;
}

async function comoServico<T>(tx: TransactionSql, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  const r = await tx.savepoint(async (sp) => {
    await sp`set local role service_role`;
    const dentro = await fn(sp as unknown as TransactionSql);
    await sp`reset role`;
    return dentro;
  });
  return r as T;
}

async function site(tx: TransactionSql, host: string, dominio: string | null = null): Promise<Site[]> {
  return tx<Site[]>`select * from public.site_do_endereco(${host}, ${dominio})`;
}

describe("semente da 0201", () => {
  it("os endereços da Next Home na migration são os do caminho rápido", () => {
    const sqlDaMigration = readFileSync(
      join(process.cwd(), "supabase", "migrations", "0201_enderecos_do_site.sql"),
      "utf8",
    );
    const semente = [...sqlDaMigration.matchAll(/\('([a-z0-9.-]+)', '00000000-0000-0000-0000-000000000001'/g)].map(
      (m) => m[1],
    );
    expect(semente.sort()).toEqual([...ENDERECOS_DA_NEXT_HOME].sort());
  });
});

describe.skipIf(!process.env.DB_TESTE_URL)("endereços do site (0201)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("os três endereços da Next Home dão o grupo 1, com o www como principal", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      for (const host of ENDERECOS_DA_NEXT_HOME) {
        const [s] = await comoServico(tx, (a) => site(a, host));
        expect(s?.grupo_id, host).toBe(GRUPO_NEXT_HOME_ID);
        expect(s?.host_principal).toBe("www.nexthomeimoveis.com");
      }
      // Maiúsculas e espaços não mudam o resultado.
      const [s] = await site(tx, "  WWW.NextHomeImoveis.com ");
      expect(s?.grupo_id).toBe(GRUPO_NEXT_HOME_ID);
    });
  });

  it("domínio próprio de outro grupo dá o grupo dele; host desconhecido não dá nada", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const b = await criarGrupo(tx, { slug: "site-b", nome: "Imobiliária B" });
      await tx`insert into public.enderecos_do_site (host, grupo_id, principal) values ('imobiliariab.com.br', ${b.grupoId}, true)`;
      await tx`insert into public.enderecos_do_site (host, grupo_id) values ('www.imobiliariab.com.br', ${b.grupoId})`;

      const [s] = await comoServico(tx, (a) => site(a, "www.imobiliariab.com.br"));
      expect(s).toEqual({ grupo_id: b.grupoId, nome: "Imobiliária B", host_principal: "imobiliariab.com.br" });

      expect(await comoServico(tx, (a) => site(a, "naoexiste.com.br"))).toEqual([]);
      expect(await site(tx, "")).toEqual([]);
    });
  });

  it("endereço gratuito pelo slug só com o domínio da plataforma, e nunca para slug reservado", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const c = await criarGrupo(tx, { slug: "site-c", nome: "Corretor C" });
      expect(await site(tx, "site-c.plataforma.com.br")).toEqual([]);
      const [s] = await site(tx, "site-c.plataforma.com.br", "plataforma.com.br");
      expect(s).toEqual({ grupo_id: c.grupoId, nome: "Corretor C", host_principal: "site-c.plataforma.com.br" });
      // Dois níveis de subdomínio não valem.
      expect(await site(tx, "x.site-c.plataforma.com.br", "plataforma.com.br")).toEqual([]);
      // O grupo 1 tem slug reservado: não ganha endereço gratuito.
      expect(await site(tx, "next-home.plataforma.com.br", "plataforma.com.br")).toEqual([]);

      // Com domínio próprio principal, o canônico passa a ser ele.
      await tx`insert into public.enderecos_do_site (host, grupo_id, principal) values ('corretorc.com.br', ${c.grupoId}, true)`;
      const [s2] = await site(tx, "site-c.plataforma.com.br", "plataforma.com.br");
      expect(s2?.host_principal).toBe("corretorc.com.br");
    });
  });

  it("grupo encerrado não tem site; suspenso continua no ar", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const d = await criarGrupo(tx, { slug: "site-d" });
      await tx`insert into public.enderecos_do_site (host, grupo_id, principal) values ('grupod.com.br', ${d.grupoId}, true)`;
      await tx`update public.grupos set situacao = 'suspenso' where id = ${d.grupoId}`;
      expect((await site(tx, "grupod.com.br"))[0]?.grupo_id).toBe(d.grupoId);
      await tx`update public.grupos set situacao = 'encerrado' where id = ${d.grupoId}`;
      expect(await site(tx, "grupod.com.br")).toEqual([]);
    });
  });

  it("um host é de um grupo só, e cada grupo tem um principal só", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const e = await criarGrupo(tx, { slug: "site-e" });
      await expect(
        tx.savepoint((sp) => sp`insert into public.enderecos_do_site (host, grupo_id) values ('nexthomeimoveis.com', ${e.grupoId})`),
      ).rejects.toThrow(/duplicate key|enderecos_do_site_pkey/);
      await tx`insert into public.enderecos_do_site (host, grupo_id, principal) values ('e1.com.br', ${e.grupoId}, true)`;
      await expect(
        tx.savepoint((sp) => sp`insert into public.enderecos_do_site (host, grupo_id, principal) values ('e2.com.br', ${e.grupoId}, true)`),
      ).rejects.toThrow(/enderecos_do_site_um_principal/);
      // Host fora da forma (maiúscula, barra) é recusado na gravação.
      await expect(
        tx.savepoint((sp) => sp`insert into public.enderecos_do_site (host, grupo_id) values ('E3.com.br', ${e.grupoId})`),
      ).rejects.toThrow(/check/);
      await expect(
        tx.savepoint((sp) => sp`insert into public.enderecos_do_site (host, grupo_id) values ('e3.com.br/x', ${e.grupoId})`),
      ).rejects.toThrow(/check/);
    });
  });

  it("a chave publicável e a sessão não executam a função: o domínio da plataforma não vem de quem chama", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const g = await criarGrupo(tx, { slug: "imobiliaria-sol", nome: "Imobiliária Sol" });
      // Com a chave publicável, inventar o domínio revelaria o grupo pelo slug.
      await expect(comoAnon(tx, (a) => site(a, "imobiliaria-sol.x.com", "x.com"))).rejects.toThrow(/permission denied/);
      await expect(
        comoUsuario(tx, g.gestorUserId, (u) => site(u, "imobiliaria-sol.x.com", "x.com")),
      ).rejects.toThrow(/permission denied/);
      // A chave de serviço executa (é o resolvedor do site, server-only).
      const [s] = await comoServico(tx, (a) => site(a, "imobiliaria-sol.x.com", "x.com"));
      expect(s?.grupo_id).toBe(g.grupoId);
    });
  });

  it("domínio da plataforma fora da forma de host não casa nada (nem curinga do LIKE)", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      await criarGrupo(tx, { slug: "site-g" });
      expect(await site(tx, "site-g.qualquer.com", "%")).toEqual([]);
      expect(await site(tx, "site-g.qualquer.com", "%.com")).toEqual([]);
      expect(await site(tx, "site-g.qualquer.com", "_ualquer.com")).toEqual([]);
      expect(await site(tx, "site-g.com", "com")).toEqual([]);
      expect((await site(tx, "site-g.qualquer.com", "qualquer.com"))[0]).toBeTruthy();
    });
  });

  it("anon e a sessão não leem a tabela: só a função responde, e só pelo host pedido", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const f = await criarGrupo(tx, { slug: "site-f" });
      await tx`insert into public.enderecos_do_site (host, grupo_id) values ('grupof.com.br', ${f.grupoId})`;
      await expect(comoAnon(tx, (a) => a`select host from public.enderecos_do_site`)).rejects.toThrow(/permission denied/);
      await expect(
        comoUsuario(tx, f.gestorUserId, (u) => u`select host from public.enderecos_do_site`),
      ).rejects.toThrow(/permission denied/);
    });
  });
});
