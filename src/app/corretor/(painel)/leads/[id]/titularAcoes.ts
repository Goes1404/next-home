"use server";

import { revalidatePath } from "next/cache";
import { BUCKET_DOCUMENTOS } from "@/lib/crm/envioAutorizado";
import { apagarPasta } from "@/lib/grupos/arquivosPrivados";
import { apagarAudiosGuardados, caminhosDeAudioDaPessoa } from "@/lib/crm/retornoPeloGrupo/audioNoStorage";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * O pedido do titular (LGPD art. 18, operação enxuta de 20/10/2026): a
 * pessoa pediu para apagar os dados dela, e o gestor registra na ficha.
 *
 * Quem decide é o banco (`apagar_dados_do_titular`, 0202), pela SESSÃO do
 * gestor: só gestor, e só lead do grupo dele. Ele apaga o lead E as outras
 * fichas do grupo com o mesmo telefone ou e-mail (o pedido é da pessoa, não
 * da ficha; o cascade leva conversa, mensagens, documentos registrados, dossiê
 * e linha do tempo) e as sobras das FKs `set null`, e grava o evento sem dado
 * pessoal. A venda fica (obrigação fiscal), sem o vínculo com o lead, mas com
 * o nome e o CPF do comprador em `venda_fiscal`.
 *
 * Os ARQUIVOS (documentos e mídias recebidas, em `documentos-clientes/<lead>/`)
 * o SQL não apaga: saem aqui, pela chave de serviço, só DEPOIS que o banco
 * confirmou que os leads eram do grupo de quem pediu. As pastas são as dos
 * ids que o banco devolveu (todas as fichas apagadas), nunca as do navegador.
 *
 * O áudio do retorno da ligação (`retornos-de-ligacao/<grupo>/`) é o caso
 * inverso: o caminho mora na linha que o cascade apaga junto com o lead, então
 * é lido ANTES de o banco apagar (o lead e as fichas da mesma pessoa, no grupo
 * do gestor) e o arquivo sai DEPOIS, quando o banco já confirmou o pedido.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ResultadoTitular = { ok?: string; erro?: string };

export async function apagarDadosDoTitular(leadId: string): Promise<ResultadoTitular> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro };
  if (!UUID.test(leadId)) return { erro: "Lead não encontrado." };

  const supabase = await createClient();
  const servico = createServiceClient();
  const audios = await caminhosDeAudioDaPessoa(servico, guarda.corretor.grupoId, leadId);
  const { data, error } = await supabase.rpc("apagar_dados_do_titular", { p_lead: leadId });
  if (error) {
    if (/lead_nao_encontrado/.test(error.message)) return { erro: "Lead não encontrado." };
    if (/sem_permissao/.test(error.message)) return { erro: "Só quem administra a imobiliária atende este pedido." };
    console.error("[titular] o banco recusou:", error.message);
    return { erro: "Não foi possível apagar agora. Nada foi apagado. Tente de novo." };
  }

  revalidatePath("/corretor/leads");
  revalidatePath("/corretor/pessoas");

  // Os leads já não existem; agora os arquivos das pastas deles.
  const resposta = (data ?? {}) as { leads?: unknown; apagados?: { fichas?: number } };
  const devolvidos = Array.isArray(resposta.leads) ? resposta.leads.filter((l): l is string => typeof l === "string" && UUID.test(l)) : [];
  const leads = [...new Set([leadId, ...devolvidos])];
  const storage = servico.storage.from(BUCKET_DOCUMENTOS);
  const audiosApagados = await apagarAudiosGuardados(servico, audios);
  try {
    for (const lead of leads) await apagarPasta(storage, lead);
    if (!audiosApagados) throw new Error("áudios do retorno da ligação não apagados");
  } catch (e) {
    console.error("[titular] arquivos do lead não apagados:", e instanceof Error ? e.message : e);
    return {
      erro: "Os dados foram apagados, mas alguns arquivos (documentos e fotos recebidas) não saíram. Avise o suporte para concluir.",
    };
  }

  const fichas = resposta.apagados?.fichas ?? leads.length;
  return {
    ok:
      fichas > 1
        ? `Dados apagados, em ${fichas} fichas com o mesmo telefone ou e-mail. O pedido ficou registrado sem o nome da pessoa.`
        : "Dados apagados. O pedido ficou registrado sem o nome da pessoa.",
  };
}
