"use server";

import { revalidatePath } from "next/cache";
import { getEquipeAtiva } from "@/lib/corretorSessao";
import { lerMetaDigitada, type MetasDoMes } from "@/lib/financeiro/placarDaEquipe";
import { mesAtual } from "@/lib/financeiro/periodo";
import { hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { exigirGestorNaAcao } from "@/lib/guardas";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * O gestor define as metas do mês da equipe (0246, 29/10/2026): visitas,
 * propostas e vendas por corretor. Vale para o mês corrente ou o seguinte
 * (planejar o mês antes de ele começar). Linha sem meta nenhuma é APAGADA:
 * "sem meta" é ausência, não zero.
 *
 * A guarda do gestor vem antes da chave; os corretores são conferidos contra
 * a equipe ativa lida pela SESSÃO (o grupo dele), e toda escrita leva o
 * grupo do gestor no filtro.
 */

export type LinhaDeMetaDigitada = {
  corretorId: string;
  visitas: string;
  propostas: string;
  vendas: string;
};

function mesSeguinte(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

export async function salvarMetasDaEquipe(p: {
  mes: string;
  linhas: LinhaDeMetaDigitada[];
}): Promise<{ ok?: string; erro?: string }> {
  const guarda = await exigirGestorNaAcao();
  if (guarda.erro !== undefined) return { erro: guarda.erro };
  const gestor = guarda.corretor;

  const atual = mesAtual(hojeEmSaoPaulo());
  if (p.mes !== atual && p.mes !== mesSeguinte(atual)) {
    return { erro: "Dá para definir a meta do mês atual ou do próximo." };
  }

  const daEquipe = new Set((await getEquipeAtiva()).map((c) => c.id));
  const metas: { corretorId: string; metas: MetasDoMes }[] = [];
  for (const linha of p.linhas) {
    if (!daEquipe.has(linha.corretorId)) continue;
    const lidas = {
      visitas: lerMetaDigitada(linha.visitas),
      propostas: lerMetaDigitada(linha.propostas),
      vendas: lerMetaDigitada(linha.vendas),
    };
    if (Object.values(lidas).includes("invalida")) {
      return { erro: "Use números inteiros de 1 a 1000 (vazio = sem meta)." };
    }
    metas.push({ corretorId: linha.corretorId, metas: lidas as MetasDoMes });
  }
  if (metas.length === 0) return { erro: "Nenhum corretor da equipe na lista." };

  const comMeta = metas.filter((m) => m.metas.visitas !== null || m.metas.propostas !== null || m.metas.vendas !== null);
  const semMeta = metas.filter((m) => !comMeta.includes(m)).map((m) => m.corretorId);
  const supabase = createServiceClient();

  if (comMeta.length > 0) {
    const { error } = await supabase.from("metas_da_equipe").upsert(
      comMeta.map((m) => ({
        grupo_id: gestor.grupoId,
        corretor_id: m.corretorId,
        mes: p.mes,
        meta_visitas: m.metas.visitas,
        meta_propostas: m.metas.propostas,
        meta_vendas: m.metas.vendas,
        definida_por: gestor.id,
        atualizado_em: new Date().toISOString(),
      })),
      { onConflict: "corretor_id,mes" },
    );
    if (error) {
      console.error("[metas da equipe] gravação falhou:", error.message);
      return {
        erro: /metas_da_equipe/.test(error.message)
          ? "As metas da equipe ainda não foram ativadas no banco."
          : "Não foi possível salvar as metas agora.",
      };
    }
  }
  if (semMeta.length > 0) {
    const { error } = await supabase
      .from("metas_da_equipe")
      .delete()
      .eq("grupo_id", gestor.grupoId)
      .eq("mes", p.mes)
      .in("corretor_id", semMeta);
    if (error) console.error("[metas da equipe] limpeza falhou:", error.message);
  }

  revalidatePath("/corretor/financeiro/desempenho");
  revalidatePath("/corretor/financeiro/ranking");
  return { ok: comMeta.length === 1 ? "Meta salva." : `Metas salvas (${comMeta.length}).` };
}
