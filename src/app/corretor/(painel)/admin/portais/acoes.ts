"use server";

import { revalidatePath } from "next/cache";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { createServiceClient } from "@/lib/supabase/service";
import { gerarTokenDoPortal, type IntegracaoDePortal } from "@/lib/portais/formatos";

type Resultado = { ok?: string; erro?: string };

const INTEGRACOES: readonly IntegracaoDePortal[] = ["grupo_olx", "generico"];

/**
 * Liga a integração de um portal no grupo do gestor, ou troca o token dela
 * (29/10/2026, 0245). Trocar derruba a URL antiga NA HORA: é o que se faz
 * quando a URL vazou ou quando a imobiliária troca de CRM no Canal Pro.
 *
 * A tabela não tem grant para o painel (o token é credencial): a escrita é
 * pela chave de serviço, depois da guarda, sempre no grupo do gestor.
 */
export async function gerarUrlDoPortal(portal: IntegracaoDePortal): Promise<Resultado> {
  const guarda = await exigirGestorNaAcao();
  if ("erro" in guarda) return { erro: guarda.erro };
  if (!INTEGRACOES.includes(portal)) return { erro: "Portal desconhecido." };
  const grupoId = guarda.corretor.grupoId;
  const supabase = createServiceClient();

  const { data: existente } = await supabase
    .from("integracoes_de_portais")
    .select("id")
    .eq("grupo_id", grupoId)
    .eq("portal", portal)
    .maybeSingle();

  const token = gerarTokenDoPortal();
  const { error } = existente
    ? await supabase
        .from("integracoes_de_portais")
        .update({ token, ativo: true, token_trocado_em: new Date().toISOString() })
        .eq("id", existente.id)
        .eq("grupo_id", grupoId)
    : await supabase.from("integracoes_de_portais").insert({ grupo_id: grupoId, portal, token });
  if (error) return { erro: "Não consegui gerar a URL agora. Tente de novo em instantes." };

  revalidatePath("/corretor/admin/portais");
  return {
    ok: existente
      ? "URL nova gerada. A anterior parou de funcionar: cole a nova no portal."
      : "Integração ligada. Copie a URL e cole no portal.",
  };
}

/** Desliga a integração: o portal passa a receber 401 e o lead fica no portal. */
export async function desligarPortal(portal: IntegracaoDePortal): Promise<Resultado> {
  const guarda = await exigirGestorNaAcao();
  if ("erro" in guarda) return { erro: guarda.erro };
  if (!INTEGRACOES.includes(portal)) return { erro: "Portal desconhecido." };
  const { error } = await createServiceClient()
    .from("integracoes_de_portais")
    .update({ ativo: false })
    .eq("grupo_id", guarda.corretor.grupoId)
    .eq("portal", portal);
  if (error) return { erro: "Não consegui desligar agora." };
  revalidatePath("/corretor/admin/portais");
  return { ok: "Integração desligada. Os leads voltam a ficar só no portal (e no e-mail)." };
}
