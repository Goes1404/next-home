// A logo do grupo no CRM (0208), medida no banco local (`npm run db:teste`).
//
// `grupos.logo_url` é lida pela sessão do grupo (a policy da 0190 recorta a
// linha), nunca escrita por ela: quem grava é a Server Action com a chave de
// serviço. A ação `logo_do_grupo_alterada` cabe em `admin_eventos`.
//
// Pula sem DB_TESTE_URL. Cada teste roda numa transação desfeita no fim.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "postgres";
import { comoUsuario, conectar, criarGrupo, emTransacaoDesfeita, soltarSuite, travarSuite } from "@/lib/grupos/apoioDoBanco";

describe.skipIf(!process.env.DB_TESTE_URL)("logo do grupo (0208)", () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (sql) await soltarSuite(sql);
    await sql?.end();
  });

  it("a coluna nasce nula e só aceita https", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "logo-check" });
      const [antes] = await tx<{ logo_url: string | null }[]>`select logo_url from public.grupos where id = ${a.grupoId}`;
      expect(antes.logo_url).toBeNull();

      await tx`update public.grupos set logo_url = 'https://x.supabase.co/storage/v1/object/public/empreendimentos/grupos/a/logo-0123456789abcdef.png' where id = ${a.grupoId}`;
      for (const ruim of ["javascript:alert(1)", "http://x.com/a.png", "data:image/png;base64,AA", `https://x.com/${"a".repeat(500)}`]) {
        await expect(
          tx.savepoint((sp) => sp`update public.grupos set logo_url = ${ruim} where id = ${a.grupoId}`),
          ruim.slice(0, 20),
        ).rejects.toThrow(/check/);
      }
    });
  });

  it("a sessão do grupo lê a logo do próprio grupo, mas não grava (nem o gestor)", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "logo-leitura" });
      await tx`update public.grupos set logo_url = 'https://x.supabase.co/l.png' where id = ${a.grupoId}`;

      for (const userId of [a.gestorUserId, a.corretorUserId]) {
        const lido = await comoUsuario(tx, userId, (eu) => eu<{ logo_url: string | null }[]>`select logo_url from public.grupos where id = ${a.grupoId}`);
        expect(lido[0]?.logo_url).toBe("https://x.supabase.co/l.png");
        await expect(
          comoUsuario(tx, userId, (eu) => eu`update public.grupos set logo_url = 'https://x.com/trocada.png' where id = ${a.grupoId}`),
        ).rejects.toThrow(/permission denied/);
      }

      const [privs] = await tx<{ anon: boolean; logado_le: boolean; logado_grava: boolean }[]>`
        select has_column_privilege('anon', 'public.grupos', 'logo_url', 'select') as anon,
               has_column_privilege('authenticated', 'public.grupos', 'logo_url', 'select') as logado_le,
               has_column_privilege('authenticated', 'public.grupos', 'logo_url', 'update') as logado_grava
      `;
      expect(privs).toEqual({ anon: false, logado_le: true, logado_grava: false });
    });
  });

  it("um grupo não lê a logo de outro", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "logo-a" });
      const b = await criarGrupo(tx, { slug: "logo-b" });
      await tx`update public.grupos set logo_url = 'https://x.supabase.co/b.png' where id = ${b.grupoId}`;
      const lido = await comoUsuario(tx, a.gestorUserId, (eu) => eu`select logo_url from public.grupos where id = ${b.grupoId}`);
      expect(lido).toHaveLength(0);
    });
  });

  it("admin_eventos aceita logo_do_grupo_alterada e continua aceitando as de antes", async () => {
    await emTransacaoDesfeita(sql, async (tx) => {
      const a = await criarGrupo(tx, { slug: "logo-evento" });
      for (const acao of ["logo_do_grupo_alterada", "pagamento_registrado", "grupo_reativado", "identidade_da_ia_alterada"]) {
        await tx.savepoint((sp) => sp`insert into public.admin_eventos (grupo_id, acao) values (${a.grupoId}, ${acao})`);
      }
      await expect(
        tx.savepoint((sp) => sp`insert into public.admin_eventos (grupo_id, acao) values (${a.grupoId}, 'acao_que_nao_existe')`),
      ).rejects.toThrow(/check/);
    });
  });
});
