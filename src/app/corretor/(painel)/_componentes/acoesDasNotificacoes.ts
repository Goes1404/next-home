"use server";

import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";
import { notificarCorretor } from "@/lib/notificacoes/push";
import { NOTIFICACAO_DE_TESTE, resultadoDoTeste, type ResultadoDoTeste } from "./resultadoDoTeste";

/**
 * "Enviar notificação de teste" (29/10/2026): o dono quer ver no próprio
 * celular como o aviso chega antes de confiar nele.
 *
 * O destino vem SEMPRE da sessão: a ação não recebe argumento nenhum, então
 * não há como mandar para o aparelho de outra pessoa — vai para todos os
 * aparelhos inscritos do corretor logado, e só para eles.
 */
export async function enviarNotificacaoDeTeste(): Promise<ResultadoDoTeste> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Entre no painel para testar as notificações." };
  const entregues = await notificarCorretor(createServiceClient(), corretor.id, NOTIFICACAO_DE_TESTE);
  return resultadoDoTeste(entregues);
}
