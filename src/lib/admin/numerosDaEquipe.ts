import "server-only";

import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Cliente para o ADM contar o que acontece nas conversas da equipe SEM ler
 * nenhuma delas (30/09/2026, 0134).
 *
 * Desde a 0134 a RLS não deixa o gestor ler conversa, mensagem nem
 * telemetria de outro corretor: o número pareado costuma ser o WhatsApp
 * pessoal de cada um. Os painéis da Administração, porém, precisam de
 * CONTAGENS da equipe (conversas, tempo de resposta, falas por lead). Esses
 * números saem por aqui, com a chave de serviço, e só depois de conferir
 * que quem pede é o gestor.
 *
 * Regra de quem usa: pedir só contagem, id e data. Texto de mensagem,
 * prévia, memória e contexto da IA NUNCA passam por este cliente, e
 * `leituraDaEquipe.test.ts` lê o código de quem o chama para cobrar isso.
 */
export async function clienteParaNumerosDaEquipe() {
  const corretor = await getCorretorLogado();
  if (corretor?.papel !== "gestor") {
    throw new Error("Números da equipe são só do ADM.");
  }
  return createServiceClient();
}
