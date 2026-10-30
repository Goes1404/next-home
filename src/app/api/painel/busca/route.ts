import { getCorretorLogado } from "@/lib/corretorSessao";
import { filtroForaDasContasOcultas, idsDeContasOcultas } from "@/lib/corretores/contaOculta";
import { buscarNoPainel, MINIMO_PARA_BUSCAR, RESPOSTA_VAZIA, recorteDaBusca, sanearTermo, type ClienteDaBusca } from "@/lib/painel/buscaRapida";
import { createClient } from "@/lib/supabase/server";

/**
 * A busca rápida do painel (29/10/2026): `GET /api/painel/busca?q=`.
 *
 * Rota (GET) e não Server Action de propósito: as actions do Next rodam em
 * FILA por aba, e a paleta dispara uma consulta a cada pausa na digitação —
 * a do termo velho seguraria a do novo. Com `fetch`, a paleta cancela
 * (`AbortController`) a que ficou para trás.
 *
 * Cliente da SESSÃO (cookies): a RLS recorta o grupo, e `recorteDaBusca`
 * recorta a carteira (corretor = os dele; gestor = o grupo, sem contas
 * ocultas). Nada de chave de serviço aqui. `no-store`: resultado de busca é
 * dado pessoal e muda a cada minuto.
 */
export const dynamic = "force-dynamic";

const SEM_CACHE = { "cache-control": "private, no-store, max-age=0" };

export async function GET(req: Request) {
  const corretor = await getCorretorLogado();
  const recorte = recorteDaBusca(corretor);
  if (!corretor || !recorte) return new Response(null, { status: 401, headers: SEM_CACHE });

  const termo = sanearTermo(new URL(req.url).searchParams.get("q") ?? "");
  if (termo.length < MINIMO_PARA_BUSCAR) return Response.json(RESPOSTA_VAZIA, { headers: SEM_CACHE });

  const supabase = await createClient();
  const foraDasOcultas = recorte.tipo === "grupo" ? filtroForaDasContasOcultas(await idsDeContasOcultas(supabase)) : null;
  const resposta = await buscarNoPainel(supabase as unknown as ClienteDaBusca, {
    termo,
    recorte,
    corretorId: corretor.id,
    foraDasOcultas,
    ramo: corretor.ramo,
  });
  return Response.json(resposta, { headers: SEM_CACHE });
}
