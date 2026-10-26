"use server";

import { revalidatePath } from "next/cache";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";

export type ModoAviso = "mensagem" | "grupo";

/**
 * Salva a roleta dos anúncios de um corretor (0204).
 *
 * A tabela não dá grant a ninguém: quem grava é o servidor, depois de
 * conferir a sessão. O corretor só mexe na roleta do PRÓPRIO número; o ADM
 * mexe na de qualquer corretor do grupo dele. A lista só aceita corretores
 * ativos do mesmo grupo — o banco confere de novo a cada lead.
 *
 * `modoAviso` (0218) diz como o escolhido fica sabendo: "mensagem" (o número
 * dele manda a abertura) ou "grupo" (o número central avisa no grupo dele).
 * O valor vem do navegador, então "grupo" só passa se o grupo da sessão
 * ligou o envio de leads para os grupos.
 */
export async function salvarRoleta(entrada: {
  corretorId: string;
  ligada: boolean;
  destinos: string[];
  textoPassagem: string;
  textoAbertura: string;
  modoAviso: ModoAviso;
}): Promise<{ erro?: string }> {
  const quem = await getCorretorLogado();
  if (!quem) return { erro: "Sessão expirada. Entre novamente." };
  if (entrada.corretorId !== quem.id && quem.papel !== "gestor") {
    return { erro: "Você só configura a roleta do seu número." };
  }

  if (entrada.modoAviso !== "mensagem" && entrada.modoAviso !== "grupo") return { erro: "Modo de aviso inválido." };

  const destinos = [...new Set(entrada.destinos)].slice(0, 30);
  const textoPassagem = entrada.textoPassagem.trim().slice(0, 600);
  const textoAbertura = entrada.textoAbertura.trim().slice(0, 1000);
  if (entrada.ligada && destinos.length === 0) return { erro: "Escolha pelo menos um corretor para receber." };

  const supabase = createServiceClient();

  if (entrada.modoAviso === "grupo") {
    const { data: grupo, error: erroGrupo } = await supabase
      .from("grupos")
      .select("envio_grupo_leads_ativo")
      .eq("id", quem.grupoId)
      .maybeSingle();
    if (erroGrupo) return { erro: "Não foi possível salvar agora. Tente de novo." };
    if (!grupo?.envio_grupo_leads_ativo) {
      // O gestor pode ter desligado o envio depois de a roleta ir para "grupo".
      // Quem já estava em "grupo" segue salvando (a tela avisa e o valor não
      // troca sozinho); só não dá para ESCOLHER "grupo" com o envio desligado.
      const { data: salva, error: erroSalva } = await supabase
        .from("roleta_anuncios")
        .select("modo_aviso")
        .eq("grupo_id", quem.grupoId)
        .eq("corretor_id", entrada.corretorId)
        .maybeSingle();
      if (erroSalva) return { erro: "Não foi possível salvar agora. Tente de novo." };
      if (salva?.modo_aviso !== "grupo") return { erro: "Peça ao gestor para ligar o envio de leads para os grupos." };
    }
  }

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
      modo_aviso: entrada.modoAviso,
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
