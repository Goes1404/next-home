import { diaEmSaoPaulo } from "@/lib/agenda/calendario";
import { lerItensDoDia } from "@/lib/agenda/lerAgenda";
import type { ItemDaAgenda } from "@/lib/agenda/itens";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { LEADS_OFFLINE, montarDadosOffline } from "@/lib/painel/dadosOffline";
import { createClient } from "@/lib/supabase/server";

/**
 * Os dados do app sem internet (29/10/2026): a agenda de hoje e os 20 leads
 * mais recentes do PRÓPRIO usuário (também para o gestor: é a carteira dele,
 * não a da equipe). Formato e limites em `lib/painel/dadosOffline.ts`.
 *
 * Quem guarda a resposta é o `sw-painel.js`, numa caixa com o id do usuário
 * no nome — por isso `usuarioId` vai no corpo. O 401 sem sessão também é
 * sinal para ele: apaga o que estiver guardado. O cache HTTP fica de fora
 * (`no-store`): só o service worker guarda, e ele sabe apagar.
 *
 * A agenda vem de `lerItensDoDia` (chave de serviço, mas com corretor e grupo
 * da sessão, como no Início). Os leads, pela sessão (RLS).
 */
export const dynamic = "force-dynamic";

const SEM_CACHE = { "cache-control": "private, no-store, max-age=0" };

export async function GET() {
  const corretor = await getCorretorLogado();
  if (!corretor) return new Response(null, { status: 401, headers: SEM_CACHE });

  const supabase = await createClient();
  const { data: sessao } = await supabase.auth.getClaims();
  const usuarioId = sessao?.claims.sub;
  if (!usuarioId) return new Response(null, { status: 401, headers: SEM_CACHE });

  const agora = new Date();
  const dia = diaEmSaoPaulo(agora);
  const [agenda, leads] = await Promise.all([
    // A agenda é acessória: se falhar, o app guarda os leads mesmo assim.
    lerItensDoDia({ corretorId: corretor.id, grupoId: corretor.grupoId, dia }).catch((err: unknown) => {
      console.error("[offline] agenda de hoje não lida:", err);
      return [] as ItemDaAgenda[];
    }),
    supabase
      .from("leads")
      .select("nome, telefone, etapa, created_at")
      .eq("corretor_id", corretor.id)
      .is("arquivado_em", null)
      .order("created_at", { ascending: false })
      .limit(LEADS_OFFLINE),
  ]);
  if (leads.error) return new Response(null, { status: 503, headers: SEM_CACHE });

  return Response.json(
    montarDadosOffline({ usuarioId, agora, dia, agenda, leads: leads.data ?? [] }),
    { headers: SEM_CACHE },
  );
}
