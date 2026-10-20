"use server";

import { revalidatePath } from "next/cache";
import { BUCKET_DOCUMENTOS } from "@/lib/crm/envioAutorizado";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * O pedido do titular (LGPD art. 18, operação enxuta de 20/10/2026): a
 * pessoa pediu para apagar os dados dela, e o gestor registra na ficha.
 *
 * Quem decide é o banco (`apagar_dados_do_titular`, 0202), pela SESSÃO do
 * gestor: só gestor, e só lead do grupo dele. Ele apaga o lead (o cascade
 * leva conversa, mensagens, documentos registrados, dossiê e linha do tempo)
 * e as sobras das FKs `set null`, e grava o evento sem dado pessoal. A venda
 * fica (obrigação fiscal), sem o vínculo com o lead.
 *
 * Os ARQUIVOS (documentos e mídias recebidas, em `documentos-clientes/<lead>/`)
 * o SQL não apaga: saem aqui, pela chave de serviço, só DEPOIS que o banco
 * confirmou que o lead era do grupo de quem pediu.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResultadoTitular = { ok?: string; erro?: string };

type Pasta = {
  list: (pasta: string, opcoes?: { limit?: number }) => PromiseLike<{
    data: { name: string; id: string | null }[] | null;
    error: { message: string } | null;
  }>;
};

/** Todos os arquivos sob `pasta`, descendo até 3 níveis (lead/whatsapp/…, lead/<token>/…). */
async function arquivosDaPasta(storage: Pasta, pasta: string, nivel = 0): Promise<string[]> {
  const { data, error } = await storage.list(pasta, { limit: 1000 });
  if (error) throw new Error(error.message);
  const saida: string[] = [];
  for (const item of data ?? []) {
    const caminho = `${pasta}/${item.name}`;
    // No Storage, pasta é o item sem id.
    if (item.id === null) {
      if (nivel < 3) saida.push(...(await arquivosDaPasta(storage, caminho, nivel + 1)));
    } else saida.push(caminho);
  }
  return saida;
}

export async function apagarDadosDoTitular(leadId: string): Promise<ResultadoTitular> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro };
  if (!UUID.test(leadId)) return { erro: "Lead não encontrado." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("apagar_dados_do_titular", { p_lead: leadId });
  if (error) {
    if (/lead_nao_encontrado/.test(error.message)) return { erro: "Lead não encontrado." };
    if (/sem_permissao/.test(error.message)) return { erro: "Só quem administra a imobiliária atende este pedido." };
    console.error("[titular] o banco recusou:", error.message);
    return { erro: "Não foi possível apagar agora. Nada foi apagado. Tente de novo." };
  }

  revalidatePath("/corretor/leads");
  revalidatePath("/corretor/pessoas");

  // O lead já não existe; agora os arquivos da pasta dele.
  const storage = createServiceClient().storage.from(BUCKET_DOCUMENTOS);
  try {
    const arquivos = await arquivosDaPasta(storage, leadId);
    for (let i = 0; i < arquivos.length; i += 100) {
      const { error: erroRemover } = await storage.remove(arquivos.slice(i, i + 100));
      if (erroRemover) throw new Error(erroRemover.message);
    }
  } catch (e) {
    console.error("[titular] arquivos do lead não apagados:", e instanceof Error ? e.message : e);
    return {
      erro: "Os dados foram apagados, mas alguns arquivos (documentos e fotos recebidas) não saíram. Avise o suporte para concluir.",
    };
  }

  return { ok: "Dados apagados. O pedido ficou registrado sem o nome da pessoa." };
}
