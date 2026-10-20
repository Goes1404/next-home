import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { mesEmSaoPaulo, situacaoDaCota, tetoDeRespostasDaIa, type SituacaoDaCota } from "./cotaDaIa";

/**
 * Quanto da cota de respostas da IA o grupo já usou neste mês (0197).
 *
 * Pela chave de serviço: `uso_da_ia` não tem grant para ninguém, e o teto
 * ajustado (`grupos.teto_respostas_ia`) também não. Toda leitura leva o
 * grupo no filtro; o grupo vem de quem chama, que já o validou (a instância
 * do webhook, a sessão do painel, a guarda da plataforma).
 *
 * Falha de leitura NÃO cala a IA: devolve `livre` (com log). "Não sei se a
 * cota acabou" calaria todos os clientes do grupo por uma piscada do banco,
 * e isso é pior que uma resposta a mais. É a decisão oposta à da trava
 * anti-ban, de propósito: lá o lado errado de errar queima o número; aqui
 * custa centavos.
 */
export async function lerCotaDaIa(grupoId: string, agora: Date = new Date()): Promise<SituacaoDaCota> {
  const servico = createServiceClient();
  const mes = mesEmSaoPaulo(agora);
  const [grupo, uso, assentos] = await Promise.all([
    servico.from("grupos").select("plano, teto_respostas_ia").eq("id", grupoId).maybeSingle(),
    servico.from("uso_da_ia").select("respostas").eq("grupo_id", grupoId).eq("mes", mes).maybeSingle(),
    servico
      .from("corretor_whatsapp_instancias")
      .select("id", { count: "exact", head: true })
      .eq("grupo_id", grupoId),
  ]);

  const erro = grupo.error ?? uso.error ?? assentos.error;
  if (erro || !grupo.data) {
    console.error(`[cota da IA] grupo ${grupoId}: leitura falhou, a IA segue respondendo: ${erro?.message ?? "grupo não encontrado"}`);
    return situacaoDaCota({ respostas: uso.data?.respostas ?? 0, teto: null });
  }

  const teto = tetoDeRespostasDaIa({
    plano: grupo.data.plano,
    tetoAjustado: grupo.data.teto_respostas_ia,
    assentos: assentos.count ?? 0,
  });
  return situacaoDaCota({ respostas: uso.data?.respostas ?? 0, teto });
}
