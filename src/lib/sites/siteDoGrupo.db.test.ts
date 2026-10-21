// "Meu site" (0209), medido no banco local (`npm run db:teste`).
//
// As colunas `site_*` de `grupos` só aceitam o formato certo (hex, https, UF,
// tamanhos) e NÃO são legíveis nem graváveis pela sessão: quem grava é a
// Server Action com a chave de serviço, depois da guarda. As três ações novas
// cabem em `admin_eventos` e as antigas continuam cabendo.
//
// Pula sem DB_TESTE_URL. Cada teste roda numa transação desfeita no fim.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import { comoUsuario, conectar, criarGrupo, emTransacaoDesfeita, soltarSuite, travarSuite } from "@/lib/grupos/apoioDoBanco";

describe.skipIf(!process.env.DB_TESTE_URL)("site do grupo (0209)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("as colunas nascem nulas e aceitam valores certos", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "site-ok" });
      const [antes] = await tx<Record<string, unknown>[]>`
        select site_cor, site_capa_url, site_titulo, site_frase, site_sobre, site_whatsapp, site_email, site_endereco, site_instagram, site_facebook
          from public.grupos where id = ${a.grupoId}`;
      expect(Object.values(antes).every((v) => v === null)).toBe(true);

      await tx`
        update public.grupos set
          site_cor = '#1f6f5c',
          site_capa_url = 'https://x.supabase.co/capa.jpg',
          site_titulo = 'Título',
          site_frase = 'Frase',
          site_sobre = ${"a".repeat(1200)},
          site_whatsapp = '5511999998888',
          site_email = 'contato@sol.com.br',
          site_endereco = '{"logradouro":"Av. 1","bairro":"Centro","cidade":"Barueri","uf":"SP","cep":"06404-326"}'::jsonb,
          site_instagram = 'https://www.instagram.com/sol/',
          site_facebook = 'https://www.facebook.com/sol'
        where id = ${a.grupoId}`;
    });
  });

  it("recusa formato errado: cor, https, whatsapp, e-mail, UF, tamanhos e chave de endereço a mais", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "site-check" });
      const ruins: [string, string, unknown][] = [
        ["site_cor", "cor sem #", "1f6f5c"],
        ["site_cor", "cor maiúscula", "#1F6F5C"],
        ["site_cor", "cor curta", "#fff"],
        ["site_capa_url", "capa http", "http://x.com/a.jpg"],
        ["site_capa_url", "capa javascript", "javascript:alert(1)"],
        ["site_instagram", "instagram data:", "data:text/html,a"],
        ["site_facebook", "facebook http", "http://x.com"],
        ["site_whatsapp", "whatsapp sem 55", "11999998888"],
        ["site_whatsapp", "whatsapp com sinal", "+5511999998888"],
        ["site_email", "e-mail sem arroba", "sem-arroba"],
        ["site_titulo", "título vazio", ""],
        ["site_titulo", "título grande", "a".repeat(91)],
        ["site_frase", "frase grande", "a".repeat(201)],
        ["site_sobre", "sobre grande", "a".repeat(1201)],
      ];
      for (const [coluna, rotulo, valor] of ruins) {
        await expect(
          tx.savepoint((sp) => sp.unsafe(`update public.grupos set ${coluna} = $1 where id = $2`, [valor as string, a.grupoId])),
          rotulo,
        ).rejects.toThrow(/check/);
      }
      for (const ruim of [
        '{"logradouro":"x","bairro":"y","cidade":"z","uf":"sp","cep":"1"}',
        '{"logradouro":"x","bairro":"y","cidade":"z","uf":"SP","cep":"1","extra":"?"}',
        '"texto"',
      ]) {
        await expect(
          tx.savepoint((sp) => sp.unsafe(`update public.grupos set site_endereco = $1::jsonb where id = $2`, [ruim, a.grupoId])),
          ruim,
        ).rejects.toThrow(/check/);
      }
    });
  });

  it("a sessão do grupo (nem o gestor) lê ou grava as colunas site_*; anon também não", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "site-privs" });
      const colunas = ["site_cor", "site_capa_url", "site_titulo", "site_frase", "site_sobre", "site_whatsapp", "site_email", "site_endereco", "site_instagram", "site_facebook"];
      for (const coluna of colunas) {
        const [p] = await tx<{ anon: boolean; logado_le: boolean; logado_grava: boolean }[]>`
          select has_column_privilege('anon', 'public.grupos', ${coluna}, 'select') as anon,
                 has_column_privilege('authenticated', 'public.grupos', ${coluna}, 'select') as logado_le,
                 has_column_privilege('authenticated', 'public.grupos', ${coluna}, 'update') as logado_grava`;
        expect(p, coluna).toEqual({ anon: false, logado_le: false, logado_grava: false });
      }
      await expect(
        comoUsuario(tx, a.gestorUserId, (eu) => eu`update public.grupos set site_titulo = 'invadido' where id = ${a.grupoId}`),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it("admin_eventos aceita as três ações novas e as antigas, e recusa o que não está na lista", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "site-eventos" });
      for (const acao of ["site_do_grupo_alterado", "endereco_do_site_ligado", "endereco_do_site_removido", "logo_do_grupo_alterada", "grupo_criado", "pagamento_registrado"]) {
        await tx`insert into public.admin_eventos (grupo_id, acao, detalhes) values (${a.grupoId}, ${acao}, '{}'::jsonb)`;
      }
      await expect(
        tx.savepoint((sp) => sp`insert into public.admin_eventos (grupo_id, acao, detalhes) values (${a.grupoId}, 'acao_inventada', '{}'::jsonb)`),
      ).rejects.toThrow(/check/);
    });
  });
});
