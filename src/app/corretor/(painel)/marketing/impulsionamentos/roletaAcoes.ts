"use server";

import { revalidatePath } from "next/cache";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Salva a roleta dos anúncios de um corretor (0204).
 *
 * A tabela não dá grant a ninguém: quem grava é o servidor, depois de
 * conferir a sessão. O corretor só mexe na roleta do PRÓPRIO número; o ADM
 * mexe na de qualquer corretor do grupo dele. A lista só aceita corretores
 * ativos do mesmo grupo — o banco confere de novo a cada lead.
 */
export async function salvarRoleta(entrada: {
  corretorId: string;
  ligada: boolean;
  destinos: string[];
  textoPassagem: string;
  textoAbertura: string;
}): Promise<{ erro?: string }> {
  const quem = await getCorretorLogado();
  if (!quem) return { erro: "Sessão expirada. Entre novamente." };
  if (entrada.corretorId !== quem.id && quem.papel !== "gestor") {
    return { erro: "Você só configura a roleta do seu número." };
  }

  const destinos = [...new Set(entrada.destinos)].slice(0, 30);
  const textoPassagem = entrada.textoPassagem.trim().slice(0, 600);
  const textoAbertura = entrada.textoAbertura.trim().slice(0, 1000);
  if (entrada.ligada && destinos.length === 0) return { erro: "Escolha pelo menos um corretor para receber." };

  const supabase = createServiceClient();
  const ids = [...new Set([entrada.corretorId, ...destinos])];
  const { data: validos, error: erroLeitura } = await supabase
    .from("corretores")
    .select("id")
    .eq("grupo_id", quem.grupoId)
    .eq("ativo", true)
    .in("id", ids);
  if (erroLeitura) return { erro: "Não foi possível salvar agora. Tente de novo." };
  const conhecidos = new Set((validos ?? []).map((c) => c.id));
  if (!conhecidos.has(entrada.corretorId)) return { erro: "Corretor não encontrado." };
  if (destinos.some((d) => !conhecidos.has(d))) return { erro: "Algum corretor da lista não está mais ativo. Recarregue a página." };

  const { error } = await supabase.from("roleta_anuncios").upsert(
    {
      corretor_id: entrada.corretorId,
      grupo_id: quem.grupoId,
      ligada: entrada.ligada,
      destinos,
      texto_passagem: textoPassagem || null,
      texto_abertura: textoAbertura || null,
      atualizado_em: new Date().toISOString(),
      atualizado_por: quem.id,
    },
    { onConflict: "corretor_id" },
  );
  if (error) {
    console.error("[roleta] falha ao salvar:", error.message);
    return { erro: "Não foi possível salvar agora. Tente de novo." };
  }
  revalidatePath("/corretor/marketing/impulsionamentos");
  return {};
}
