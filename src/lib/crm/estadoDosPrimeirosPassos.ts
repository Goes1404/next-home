import "server-only";

import { getCorretorLogado } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { convidaAEquipe, cuidaDoCatalogo, type EstadoDoInicio } from "./primeirosPassosDoInicio";

/**
 * O estado dos primeiros passos de quem abriu o Início (29/10/2026).
 *
 * Uma leva só, em paralelo, e só CONTAGENS (`head: true`, nenhuma linha
 * volta): o cartão mora atrás do próprio Suspense e nunca segura a tela.
 * Foto e apresentação já vêm da sessão, sem consulta.
 *
 * - WhatsApp, imóveis, equipe e leads: pela SESSÃO (a RLS recorta o grupo),
 *   e com o grupo ou o corretor no filtro mesmo assim.
 * - Aparelhos com aviso (`inscricoes_push`): pela chave de serviço, porque a
 *   tabela não tem grant para a sessão (0203). Só do corretor da sessão.
 *
 * Erro numa contagem vira `null` e o passo sai da lista (ver
 * `primeirosPassosDoInicio.ts`). `null` no todo = sem sessão.
 */
export async function lerEstadoDosPrimeirosPassos(): Promise<(EstadoDoInicio & { corretorId: string }) | null> {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const supabase = await createClient();
  const servico = createServiceClient();
  const papel = corretor.papel;
  const tipoDoGrupo = corretor.tipoDoGrupo;
  // Sem catálogo de imóveis no ramo, nem conta imóvel (`cuidaDoCatalogo`).
  const ramo = corretor.ramo;
  const contagem = (r: { count: number | null; error: { message: string } | null }, o_que: string): number | null => {
    if (r.error) {
      console.error(`[primeiros passos] ${o_que} não contado: ${r.error.message}`);
      return null;
    }
    return r.count ?? 0;
  };
  const nada = Promise.resolve({ count: null, error: null });

  let leads = supabase.from("leads").select("id", { count: "exact", head: true }).eq("grupo_id", corretor.grupoId);
  // O gestor olha a conta (o primeiro lead da casa); o corretor, a carteira dele.
  if (papel !== "gestor") leads = leads.eq("corretor_id", corretor.id);

  const [whatsapp, aparelhos, imoveis, equipe, carteira] = await Promise.all([
    supabase
      .from("corretor_whatsapp_instancias")
      .select("corretor_id", { count: "exact", head: true })
      .eq("corretor_id", corretor.id)
      .eq("status_conexao", "conectado"),
    servico.from("inscricoes_push").select("id", { count: "exact", head: true }).eq("corretor_id", corretor.id),
    cuidaDoCatalogo({ papel, tipoDoGrupo, ramo })
      ? supabase.from("empreendimentos").select("id", { count: "exact", head: true }).eq("grupo_id", corretor.grupoId)
      : nada,
    // Conta oculta (0189) não é equipe convidada: fica de fora da contagem.
    convidaAEquipe({ papel, tipoDoGrupo })
      ? supabase
          .from("corretores")
          .select("id", { count: "exact", head: true })
          .eq("grupo_id", corretor.grupoId)
          .eq("ativo", true)
          .eq("oculta", false)
      : nada,
    leads,
  ]);

  const conectados = contagem(whatsapp, "WhatsApp");
  return {
    corretorId: corretor.id,
    papel,
    tipoDoGrupo,
    ramo,
    whatsappConectado: conectados === null ? null : conectados > 0,
    temFoto: Boolean(corretor.fotoUrl),
    temApresentacao: Boolean(corretor.bio && corretor.bio.trim().length >= 20),
    aparelhosComAviso: contagem(aparelhos, "aparelhos com aviso"),
    imoveisDoGrupo: cuidaDoCatalogo({ papel, tipoDoGrupo, ramo }) ? contagem(imoveis, "imóveis") : null,
    corretoresAtivos: convidaAEquipe({ papel, tipoDoGrupo }) ? contagem(equipe, "equipe") : null,
    leads: contagem(carteira, "leads"),
  };
}
