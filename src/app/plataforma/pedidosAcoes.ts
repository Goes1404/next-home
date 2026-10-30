"use server";

import { revalidatePath } from "next/cache";
import { exigirAdminDaPlataformaNaAcao } from "@/lib/guardas";
import { ehUuid } from "@/lib/plataforma/dadosDoGrupo";
import { ehStatusDoPedido } from "@/lib/plataforma/pedidoDeContratacao";
import { createServiceClient } from "@/lib/supabase/service";
import { registrarIndicacaoDoPedido } from "@/lib/indicacoes/indicacao";

/**
 * O andamento de um pedido de contratação (29/10/2026): status, observação
 * da equipe e a conta que nasceu dele (`grupo_criado_id`, 0238).
 *
 * A guarda da plataforma vem antes de tudo; a chave só depois (mesma regra
 * de ouro de `acoes.ts`). Status "convertido" pede a conta; nos outros a
 * conta fica como estava, para um "voltei para em contato" não apagar o
 * vínculo sem querer.
 */

export type ResultadoDoPedidoNaPlataforma = { ok: true } | { ok: false; erro: string };

const ERRO_GENERICO = "Não foi possível salvar agora. Tente de novo.";

export async function atualizarPedido(
  _estadoAnterior: ResultadoDoPedidoNaPlataforma | undefined,
  formData: FormData,
): Promise<ResultadoDoPedidoNaPlataforma> {
  const guarda = await exigirAdminDaPlataformaNaAcao();
  if ("erro" in guarda) return { ok: false, erro: guarda.erro };

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  const observacao = String(formData.get("observacao") ?? "").trim();
  const grupo = String(formData.get("grupo") ?? "").trim();

  if (!ehUuid(id)) return { ok: false, erro: "Pedido não encontrado." };
  if (!ehStatusDoPedido(status)) return { ok: false, erro: "Escolha um status válido." };
  if (observacao.length > 2000) return { ok: false, erro: "A observação passa de 2.000 caracteres." };
  if (grupo && !ehUuid(grupo)) return { ok: false, erro: "Conta inválida." };
  if (status === "convertido" && !grupo) return { ok: false, erro: "Para marcar como convertido, escolha a conta criada." };

  const servico = createServiceClient();
  const mudancas: { status: typeof status; observacao: string | null; atualizado_em: string; grupo_criado_id?: string } = {
    status,
    observacao: observacao || null,
    atualizado_em: new Date().toISOString(),
  };
  if (grupo) mudancas.grupo_criado_id = grupo;

  const { data, error } = await servico.from("pedidos_de_contratacao").update(mudancas).eq("id", id).select("id");
  if (error) {
    console.error(`[plataforma] pedido ${id} não atualizado: ${error.message}`);
    return { ok: false, erro: ERRO_GENERICO };
  }
  if (!data || data.length === 0) return { ok: false, erro: "Pedido não encontrado." };

  // Indique e ganhe (0247): o pedido que trouxe código liga a conta criada à
  // que indicou. Sem o cookie do visitante (o daqui seria o do administrador).
  // Converter de novo não duplica (uma indicação por conta indicada).
  if (status === "convertido" && grupo) {
    const indicacao = await registrarIndicacaoDoPedido(servico, { pedidoId: id, grupoIndicadoId: grupo });
    if (indicacao.resultado === "falhou") {
      console.error(`[plataforma] indicação do pedido ${id} não registrada: ${indicacao.motivo}`);
    }
  }

  console.info(`[plataforma] pedido ${id} → ${status} por ${guarda.userId}`);
  revalidatePath("/plataforma/pedidos");
  revalidatePath("/plataforma");
  return { ok: true };
}
