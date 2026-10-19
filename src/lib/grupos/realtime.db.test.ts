// Realtime e isolamento entre grupos, medido no banco local (`npm run db:teste`).
//
// O painel assina `postgres_changes` em `whatsapp_mensagens` e
// `whatsapp_conversas` (ConversasClient, useConversaAoVivo). O Realtime não
// lê pela API REST: ele acompanha o WAL e, para cada assinante, confere a RLS
// fingindo o papel e o JWT dele. É outro caminho até a linha, e por isso
// entra na suíte de isolamento (desenho, §18).
//
// Diferente do resto da suíte, este arquivo GRAVA de verdade: o WAL só vê
// transação confirmada. O que ele cria vive em dois grupos próprios e sai no
// fim (`limpar`), e a trava da suíte (`travarSuite`) impede que os testes
// "com um grupo só" de isolamento.db.test.ts rodem enquanto esses grupos
// existem.
//
// Pula sem DB_TESTE_URL. Precisa do serviço `realtime` de pé (dbTeste.mjs).

import { createHmac } from "node:crypto";
import { createClient, type RealtimeChannel, type SupabaseClient } from "@supabase/supabase-js";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { conectar, criarUsuario, soltarSuite, travarSuite } from "./apoioDoBanco";

// Valores de demonstração do Supabase local, iguais em toda instalação do CLI
// (`supabase status`). Não são segredo de ninguém; o ambiente pode trocá-los.
const URL_DA_API = process.env.DB_TESTE_API_URL ?? "http://127.0.0.1:54321";
const CHAVE_ANON =
  process.env.DB_TESTE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SEGREDO_JWT =
  process.env.DB_TESTE_JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";

/** JWT de usuário logado, assinado como o GoTrue local assina (HS256). */
function jwtDe(userId: string): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const agora = Math.floor(Date.now() / 1000);
  const corpo = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    sub: userId,
    role: "authenticated",
    aud: "authenticated",
    iat: agora,
    exp: agora + 3600,
  })}`;
  return `${corpo}.${createHmac("sha256", SEGREDO_JWT).update(corpo).digest("base64url")}`;
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

type Lado = { grupoId: string; corretorId: string; conversaId: string };

describe.skipIf(!process.env.DB_TESTE_URL)("realtime entre grupos", () => {
  let sql: Sql;
  const sufixo = `rt${Date.now().toString(36)}`;
  const grupos: string[] = [];
  const usuarios: string[] = [];

  /** Um grupo com um corretor, um lead e uma conversa, confirmados. */
  async function criarLado(nome: string, userId: string | null): Promise<Lado> {
    const [{ id: grupoId }] = await sql<{ id: string }[]>`
      insert into public.grupos (nome, slug, tipo)
      values (${`Grupo ${nome} ${sufixo}`}, ${`${nome}-${sufixo}`}, 'imobiliaria')
      returning id
    `;
    grupos.push(grupoId);
    const [{ id: corretorId }] = await sql<{ id: string }[]>`
      insert into public.corretores (nome, creci, whatsapp, slug, papel, user_id, grupo_id)
      values (${`corretor ${nome} ${sufixo}`}, ${`TESTE-${nome}-${sufixo}`}, '5511900000000',
              ${`${nome}-${sufixo}-corretor`}, 'corretor', ${userId}, ${grupoId})
      returning id
    `;
    const [{ id: leadId }] = await sql<{ id: string }[]>`
      insert into public.leads (nome, corretor_id) values (${`Lead ${nome}`}, ${corretorId}) returning id
    `;
    const [{ id: conversaId }] = await sql<{ id: string }[]>`
      insert into public.whatsapp_conversas (corretor_id, lead_id, telefone_cliente)
      values (${corretorId}, ${leadId}, '5511988887777')
      returning id
    `;
    return { grupoId, corretorId, conversaId };
  }

  /**
   * Apaga tudo dos grupos deste arquivo, em qualquer ordem: tenta cada tabela
   * com `grupo_id` e repete enquanto uma chave estrangeira segurar alguma.
   */
  async function limpar(): Promise<void> {
    if (grupos.length) {
      // Ids vindos do próprio banco (uuid), como literal de array.
      const lista = `{${grupos.join(",")}}`;
      await sql.unsafe(`
        do $$
        declare
          t record;
          presas integer;
          volta integer := 0;
        begin
          loop
            presas := 0;
            for t in
              select c.relname
                from pg_class c
                join pg_namespace n on n.oid = c.relnamespace
                join pg_attribute a on a.attrelid = c.oid and a.attname = 'grupo_id' and not a.attisdropped
               where n.nspname = 'public' and c.relkind = 'r'
            loop
              begin
                execute format('delete from public.%I where grupo_id = any(%L::uuid[])', t.relname, '${lista}');
              exception when foreign_key_violation then
                presas := presas + 1;
              end;
            end loop;
            exit when presas = 0;
            volta := volta + 1;
            if volta > 20 then
              raise exception 'limpeza do realtime.db.test não terminou';
            end if;
          end loop;
          delete from public.grupos where id = any('${lista}'::uuid[]);
        end
        $$
      `);
    }
    if (usuarios.length) await sql`delete from auth.users where id in ${sql(usuarios)}`;
  }

  beforeAll(async () => {
    sql = conectar();
    await travarSuite(sql);
  }, 180_000);

  afterAll(async () => {
    if (!sql) return;
    try {
      await limpar();
    } finally {
      await soltarSuite(sql);
      await sql.end();
    }
  });

  it(
    "realtime não entrega mudança de outro grupo",
    async () => {
      const userB = await criarUsuario(sql, `corretor@${sufixo}.teste`);
      usuarios.push(userB);
      const a = await criarLado("a", null);
      const b = await criarLado("b", userB);

      const cliente: SupabaseClient = createClient(URL_DA_API, CHAVE_ANON, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await cliente.realtime.setAuth(jwtDe(userB));

      const recebidas: { conversa_id: string }[] = [];
      let canal: RealtimeChannel | null = null;
      try {
        canal = cliente
          .channel(`isolamento-${sufixo}`)
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "whatsapp_mensagens" },
            (p) => recebidas.push(p.new as { conversa_id: string }),
          );
        await new Promise<void>((ok, falha) => {
          canal!.subscribe((estado, erro) => {
            if (estado === "SUBSCRIBED") ok();
            else if (estado === "CHANNEL_ERROR" || estado === "TIMED_OUT" || estado === "CLOSED") {
              falha(erro ?? new Error(`assinatura do Realtime: ${estado}`));
            }
          });
        });

        // SUBSCRIBED chega antes de o Realtime registrar a assinatura no
        // banco; sem esperar por ela, o silêncio abaixo não provaria nada.
        let registrada = false;
        for (let i = 0; i < 60 && !registrada; i++) {
          const [{ n }] = await sql<{ n: number }[]>`
            select count(*)::int as n from realtime.subscription
             where claims ->> 'sub' = ${userB}
          `;
          registrada = n > 0;
          if (!registrada) await esperar(250);
        }
        expect(registrada, "assinatura do corretor de B registrada no Realtime").toBe(true);

        await sql`
          insert into public.whatsapp_mensagens (conversa_id, conteudo, remetente)
          values (${a.conversaId}, 'mensagem do grupo A', 'cliente')
        `;
        await esperar(3000);
        expect(recebidas.filter((m) => m.conversa_id === a.conversaId)).toEqual([]);

        // A assinatura funciona: a mensagem do próprio grupo chega.
        await sql`
          insert into public.whatsapp_mensagens (conversa_id, conteudo, remetente)
          values (${b.conversaId}, 'mensagem do grupo B', 'cliente')
        `;
        for (let i = 0; i < 40 && !recebidas.some((m) => m.conversa_id === b.conversaId); i++) {
          await esperar(250);
        }
        expect(recebidas.map((m) => m.conversa_id)).toEqual([b.conversaId]);
      } finally {
        if (canal) await cliente.removeChannel(canal);
        cliente.realtime.disconnect();
      }
    },
    60_000,
  );
});
