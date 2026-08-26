"use server";

import { revalidatePath } from "next/cache";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { metaAdsConfigurado, sincronizarMetaAds } from "@/lib/metaAds";

/**
 * Botão "Sincronizar agora" da tela de Anúncios.
 *
 * Existe porque o cron é 1x/dia (teto do Hobby): sem ele, quem acabou de
 * configurar o token esperaria até amanhã para saber se funcionou — o
 * mesmo motivo do botão "Processar fila agora" das campanhas.
 */
export async function sincronizarMetaAdsAgora(): Promise<{ ok: boolean; mensagem: string }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro) return { ok: false, mensagem: guarda.erro };

  if (!metaAdsConfigurado()) {
    return {
      ok: false,
      mensagem: "A conexão com o Meta ainda não foi configurada — siga o passo a passo abaixo.",
    };
  }

  const resultado = await sincronizarMetaAds();
  if (!resultado.ok) {
    return {
      ok: false,
      mensagem:
        resultado.motivo === "nao_configurado"
          ? "A conexão com o Meta ainda não foi configurada — siga o passo a passo abaixo."
          : "O Meta não respondeu a sincronização. Confira o token e a conta, e tente de novo.",
    };
  }

  revalidatePath("/corretor/admin/anuncios");
  return {
    ok: true,
    mensagem:
      resultado.linhas === 0
        ? "Conexão ok, mas o Meta não devolveu gasto nos últimos 3 dias (campanha pausada?)."
        : `Sincronizado: ${resultado.linhas} dia(s) × campanha(s) atualizados.`,
  };
}
