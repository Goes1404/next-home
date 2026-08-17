import "server-only";

import { mapCorretor, SELECT_CORRETOR, type LinhaCorretor } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import type { CorretorPerfil, Lead } from "@/lib/types";

/**
 * Camada de acesso da área logada.
 *
 * Tudo aqui usa o cliente COM cookies (`supabase/server.ts`), nunca o
 * `supabase/public.ts`: sem sessão, `auth.uid()` é nulo e as policies do
 * painel (0006) negam tudo — a lista de leads voltaria vazia sem erro
 * nenhum, que é o pior tipo de falha.
 *
 * `server-only` no topo garante que um import acidental a partir de um
 * Client Component quebre no build, e não em produção.
 */

/** Corretor da sessão atual, ou `null` se não há sessão/vínculo. */
export async function getCorretorLogado(): Promise<CorretorPerfil | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("corretores")
    .select(SELECT_CORRETOR)
    .eq("user_id", user.id)
    .maybeSingle();

  // Sem `slug` a conta existe mas ainda não foi vinculada a um cadastro
  // publicável — o painel trata esse caso à parte.
  return data?.slug ? mapCorretor(data as LinhaCorretor) : null;
}

/** E-mail da conta autenticada — usado para revalidar a senha atual. */
export async function getEmailLogado(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? null;
}

/**
 * Leads do corretor logado, mais recentes primeiro.
 *
 * Note a ausência de um `.eq("corretor_id", ...)` aqui: o filtro vive na
 * policy de RLS (0006), no banco. É de propósito — assim nenhum erro de
 * query nesta camada consegue vazar o lead de um corretor para outro.
 */
export async function getMeusLeads(): Promise<Lead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, nome, email, telefone, mensagem, tipo, detalhes, origem, created_at, empreendimento:empreendimentos(nome, slug)",
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Falha ao carregar os leads: ${error.message}`);

  return (data ?? []).map((row) => {
    const emp = row.empreendimento as unknown as { nome: string; slug: string } | null;
    return {
      id: row.id,
      nome: row.nome,
      email: row.email,
      telefone: row.telefone,
      mensagem: row.mensagem,
      tipo: row.tipo,
      detalhes: (row.detalhes as Record<string, string> | null) ?? null,
      origem: row.origem,
      criadoEm: row.created_at,
      empreendimento: emp,
    } satisfies Lead;
  });
}
