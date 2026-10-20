import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { consultarEstadoConexao, desconectarInstancia } from "./provider";
import { sincronizarConexaoInstancia } from "./repositorio";

/**
 * Tenta de novo derrubar a sessão de um número recusado (0198).
 *
 * A recusa ("este número é de outra conta") derruba a sessão na Evolution.
 * Quando o provedor está fora do ar, o logout falha e a sessão continua
 * aberta: o banco diz "desconectado", mas o número segue recebendo mensagem.
 * A recusa então grava `logout_pendente_em`, e esta varredura, que roda a
 * cada tique do cron de disparo, tenta até conseguir.
 *
 * Para cada instância pendente, pergunta ao provedor:
 * - a sessão já caiu: nada a derrubar, a pendência acaba;
 * - está aberta sem dizer qual número: derruba (não dá para conferir, e a
 *   instância acabou de recusar um número);
 * - está aberta com o número: a sincronização ativa decide. Se for o número
 *   de outra conta, recusa de novo (e tenta o logout outra vez); se o
 *   corretor já conectou um número certo, aceita e apaga a pendência. É isto
 *   que impede a varredura de derrubar o número novo e certo.
 *
 * Nunca lança: quem chama está no meio de um ciclo de disparo.
 */
export async function rederrubarNumerosRecusados(): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("corretor_whatsapp_instancias")
      .select("id, instance_name, conectado_em, telefone_conectado")
      .not("logout_pendente_em", "is", null);
    if (error) {
      // Antes da 0198 a coluna não existe: não há recusa a repetir.
      console.error("[whatsapp] não consegui ler as recusas pendentes:", error.message);
      return;
    }

    for (const linha of data ?? []) {
      const estado = await consultarEstadoConexao(linha.instance_name);
      if (!estado.ok) continue; // provedor ainda fora: tenta no próximo tique

      if (!estado.conectado) {
        await apagarPendencia(supabase, linha.id);
        continue;
      }

      if (!estado.telefone) {
        const saida = await desconectarInstancia(linha.instance_name);
        if (saida.ok) await apagarPendencia(supabase, linha.id);
        else console.error("[whatsapp] o número recusado continua no ar:", saida.detalhe);
        continue;
      }

      await sincronizarConexaoInstancia({
        instanciaId: linha.id,
        instanceName: linha.instance_name,
        conectadoEmAtual: linha.conectado_em,
        telefoneAtual: linha.telefone_conectado,
      });
    }
  } catch (e) {
    console.error("[whatsapp] varredura das recusas pendentes falhou sem derrubar o ciclo:", e);
  }
}

async function apagarPendencia(
  supabase: ReturnType<typeof createServiceClient>,
  instanciaId: string,
): Promise<void> {
  const { error } = await supabase
    .from("corretor_whatsapp_instancias")
    .update({ logout_pendente_em: null })
    .eq("id", instanciaId);
  if (error) console.error("[whatsapp] não consegui apagar a recusa pendente:", error.message);
}
