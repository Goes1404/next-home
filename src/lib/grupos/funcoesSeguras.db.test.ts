// Metade de banco da guarda de funções security definer (L21).
//
// O texto das migrations não mostra duas coisas: a função que existe só no
// banco (criada à mão, ou de uma migration apagada) e o EXECUTE de fato
// concedido (privilégio padrão, grant herdado de PUBLIC). Esta guarda lê o
// `pg_proc` do banco local (`npm run db:teste`) e cruza com o texto e com as
// listas de `funcoesSeguras.ts`. Pula sem DB_TESTE_URL.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import { conectar } from "./apoioDoBanco";
import {
  FUNCOES_QUE_CONFEREM_O_CHAMADOR,
  FUNCOES_SEM_GRUPO,
  NOME_DE_PARAMETRO_COM_ID,
  funcoesDasMigrations,
} from "./funcoesSeguras";

type FuncaoNoBanco = {
  assinatura: string;
  gatilho: boolean;
  authenticated: boolean;
  parametros: string[];
  tipos: string[];
};

describe.skipIf(!process.env.DB_TESTE_URL)("funções security definer no banco", () => {
  let sql: Sql;
  let noBanco: FuncaoNoBanco[];
  const doTexto = funcoesDasMigrations();

  beforeAll(async () => {
    sql = conectar();
    noBanco = await sql<FuncaoNoBanco[]>`
      select p.proname || '(' || oidvectortypes(p.proargtypes) || ')' as assinatura,
             p.prorettype = 'trigger'::regtype as gatilho,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
             coalesce(p.proargnames, '{}') as parametros,
             string_to_array(oidvectortypes(p.proargtypes), ', ') as tipos
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
       order by 1
    `;
  });

  afterAll(async () => {
    await sql?.end();
  });

  it("toda função security definer está no banco e na lista", () => {
    expect(noBanco.length).toBeGreaterThan(40);

    // Existe só no banco: ninguém sabe de onde veio, e a guarda de texto não a vê.
    const soNoBanco = noBanco
      .filter((f) => !doTexto.get(f.assinatura)?.securityDefiner)
      .map((f) => f.assinatura);
    expect(soNoBanco, "Função security definer no banco sem definição viva nas migrations.").toEqual([]);

    // A regra do grupo vale para o que está no banco (função apagada não é cobrada).
    const semGrupo = noBanco
      .filter((f) => {
        const texto = doTexto.get(f.assinatura);
        return texto && !/grupo/i.test(texto.corpo) && !(f.assinatura in FUNCOES_SEM_GRUPO);
      })
      .map((f) => f.assinatura);
    expect(semGrupo, "Função security definer sem grupo e fora de FUNCOES_SEM_GRUPO.").toEqual([]);

    const assinaturas = new Set(noBanco.map((f) => f.assinatura));
    const obsoletas = [...Object.keys(FUNCOES_SEM_GRUPO), ...Object.keys(FUNCOES_QUE_CONFEREM_O_CHAMADOR)].filter(
      (a) => !assinaturas.has(a),
    );
    expect(obsoletas, "Entrada da lista sem função security definer no banco: tire da lista.").toEqual([]);
  });

  it("função que o logado executa e recebe id de corretor, instância ou lead confere o chamador", () => {
    const abertas = noBanco
      .filter((f) => !f.gatilho && f.authenticated)
      .filter((f) => f.parametros.some((nome, i) => f.tipos[i] === "uuid" && NOME_DE_PARAMETRO_COM_ID.test(nome)))
      .map((f) => f.assinatura)
      .filter((a) => !(a in FUNCOES_QUE_CONFEREM_O_CHAMADOR));
    expect(
      abertas,
      "Função security definer que o authenticated executa recebe id de outra pessoa no parâmetro. " +
        "Revogue o EXECUTE do authenticated (só a chave de serviço) ou confira o chamador e declare em " +
        "FUNCOES_QUE_CONFEREM_O_CHAMADOR.",
    ).toEqual([]);
  });
});
