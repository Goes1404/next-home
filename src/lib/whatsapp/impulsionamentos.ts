import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { TITULO_SEM_ETIQUETA, type AnuncioMeta } from "./anuncioMeta";

/** A chave da linha em `impulsionamentos` para este anúncio. */
export function chaveDoAnuncio(anuncio: AnuncioMeta): string {
  return anuncio.adId ?? "sem-etiqueta";
}

/**
 * O lead chegou por um impulsionamento do próprio corretor.
 *
 * Duas escritas, e nenhuma pode derrubar o atendimento — o cliente já está
 * esperando resposta, então falha vira log:
 *
 * 1. A ficha: `origem = meta/ctwa`, o título do anúncio e o id da Meta.
 *    Só promove lead que ainda é `whatsapp/organico` (acabou de nascer pelo
 *    convite): lead importado ou cadastrado à mão mantém a origem verdadeira.
 * 2. A lista do corretor: uma linha por anúncio (`impulsionamentos`), onde
 *    ele digita quanto gastou. Os leads NÃO são contados aqui — a tela conta
 *    da tabela `leads` na leitura.
 */
export async function registrarLeadDeImpulsionamento(params: {
  leadId: string;
  corretorId: string;
  anuncio: AnuncioMeta;
}): Promise<void> {
  const supabase = createServiceClient();
  const { anuncio } = params;
  const titulo = anuncio.titulo ?? TITULO_SEM_ETIQUETA;

  const { error: erroLead } = await supabase
    .from("leads")
    .update({
      origem: "meta/ctwa",
      anuncio_origem: titulo.slice(0, 160),
      meta_ad_id: anuncio.adId,
    })
    .eq("id", params.leadId)
    .eq("origem", "whatsapp/organico");
  if (erroLead) {
    console.error("[impulsionamento] falha ao marcar o lead:", erroLead.message);
  }

  const agora = new Date().toISOString();
  const { error } = await supabase.from("impulsionamentos").upsert(
    {
      corretor_id: params.corretorId,
      chave: chaveDoAnuncio(anuncio),
      meta_ad_id: anuncio.adId,
      // Só manda o que veio: um lead seguinte sem título não apaga o título
      // que o primeiro trouxe.
      ...(anuncio.titulo ? { titulo: anuncio.titulo } : {}),
      ...(anuncio.url ? { url: anuncio.url } : {}),
      ultimo_lead_em: agora,
    },
    { onConflict: "corretor_id,chave" },
  );
  if (error) {
    // Sem a 0127 aplicada a tabela não existe: o lead continua entrando e
    // sendo atendido, só a lista do corretor fica sem a linha.
    console.error("[impulsionamento] falha ao registrar o anúncio:", error.message);
  }
}
