"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { limparCampoDaCasa, TAMANHO_MAXIMO, TONS_DA_ASSISTENTE } from "@/lib/whatsapp/casa";
import type { TomVozBot } from "@/lib/whatsapp/types";

export type IdentidadeEditada = {
  nomeDaCasa: string;
  nomeAssistente: string;
  regiao: string;
  /** Vazio: cada corretor escolhe o tom no número dele. */
  tom: TomVozBot | "";
};

/**
 * Grava nome da casa, nome da assistente, região e tom da IA do grupo
 * (fase 4, 0199).
 *
 * A decisão de QUEM pode é de `exigirGestorNaAcao()`; a função do banco
 * confere o papel de novo e escreve no grupo da SESSÃO — o grupo nunca vem
 * do navegador. Campo vazio vira nulo: volta ao padrão do grupo.
 */
export async function salvarIdentidadeDaIa(e: IdentidadeEditada): Promise<{ ok: true } | { erro: string }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro) return { erro: guarda.erro };

  const nomeDaCasa = limparCampoDaCasa(e.nomeDaCasa, TAMANHO_MAXIMO.nomeDaCasa);
  const nomeAssistente = limparCampoDaCasa(e.nomeAssistente, TAMANHO_MAXIMO.nomeAssistente);
  const regiao = limparCampoDaCasa(e.regiao, TAMANHO_MAXIMO.regiao);
  const tom = TONS_DA_ASSISTENTE.includes(e.tom as TomVozBot) ? e.tom : null;

  for (const [rotulo, valor] of [
    ["O nome da imobiliária", nomeDaCasa],
    ["O nome da assistente", nomeAssistente],
    ["A região", regiao],
  ] as const) {
    if (valor !== null && valor.length < 2) return { erro: `${rotulo} precisa de pelo menos 2 letras.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("atualizar_identidade_da_ia", {
    p_nome_da_casa: nomeDaCasa,
    p_nome_assistente: nomeAssistente,
    p_regiao: regiao,
    p_tom: tom,
  });

  if (error) {
    console.error("[assistente do grupo] falha ao salvar:", error.message);
    if (error.code === "42501") return { erro: "Só o gestor ativo do grupo altera a assistente." };
    return { erro: "Não consegui salvar. Tente de novo." };
  }
  if (data !== true) return { erro: "Valor recusado. Confira os tamanhos dos campos e o tom." };

  // A próxima resposta da IA já lê a casa nova (o webhook lê a cada mensagem).
  revalidatePath("/corretor/admin/assistente");
  revalidatePath("/corretor/whatsapp");
  return { ok: true };
}
