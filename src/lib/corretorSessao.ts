import "server-only";

import { consultarCorretores, mapCorretor, type LinhaCorretor } from "@/lib/queries";
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

  const data = await consultarCorretores<LinhaCorretor>(
    (select) =>
      supabase.from("corretores").select(select).eq("user_id", user.id).maybeSingle(),
    "Falha ao carregar o corretor da sessão",
  );

  // Sem `slug` a conta existe mas ainda não foi vinculada a um cadastro
  // publicável — o painel trata esse caso à parte.
  return data?.slug ? mapCorretor(data) : null;
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
 * A migration 0006 traz duas coisas juntas: a coluna `corretores.bio` e a
 * policy que deixa o corretor ler os próprios leads. Se a coluna não existe,
 * a policy também não.
 *
 * Essa checagem existe porque RLS **não dá erro** quando falta policy — ela
 * simplesmente filtra tudo e devolve zero linhas. Sem um sinal externo, a
 * tela de leads não teria como distinguir "você não tem contatos" de "a
 * permissão ainda não foi aplicada", e mentiria para o corretor.
 *
 * Pode sair junto com o fallback de `bio` em queries.ts, quando a 0006
 * estiver aplicada em produção.
 */
async function painelLiberado(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
  const { error } = await supabase.from("corretores").select("bio").limit(1);
  return !error;
}

/**
 * Leads do corretor logado, mais recentes primeiro.
 *
 * O filtro por corretor vive na policy de RLS (0006), não aqui — o que
 * garante que um bug de query jamais vaze o lead de outro corretor.
 */
export async function getMeusLeads(): Promise<{ leads: Lead[]; permitido: boolean }> {
  const supabase = await createClient();

  if (!(await painelLiberado(supabase))) return { leads: [], permitido: false };

  const { data, error } = await supabase
    .from("leads")
    .select(
      "id, nome, email, telefone, mensagem, tipo, detalhes, origem, created_at, empreendimento:empreendimentos(nome, slug)",
    )
    .order("created_at", { ascending: false });

  if (error) return { leads: [], permitido: false };

  const leads = (data ?? []).map((row) => {
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

  return { leads, permitido: true };
}
