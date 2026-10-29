import type { createServiceClient } from "@/lib/supabase/service";
import { normalizarCodigoDeIndicacao } from "./codigo";

/**
 * Indique e ganhe (0247, 29/10/2026): registrar a indicação quando a conta
 * indicada nasce e gerar o crédito de quem indicou quando ela paga a
 * primeira mensalidade.
 *
 * Recebe o cliente da chave de serviço de quem chama (`helper` na guarda
 * `servicoComGrupo.test.ts`): o teste grátis e a conversão do pedido na
 * plataforma registram; o registro do pagamento à mão e o webhook do Asaas
 * recompensam. Nenhuma função aqui lança: indicação é bônus, e um erro dela
 * nunca pode derrubar a criação da conta nem o registro do pagamento. O
 * erro volta como `falhou` e quem chama só loga.
 *
 * Idempotência, pelas chaves únicas da 0247:
 * - uma indicação por conta indicada (`indicacoes.grupo_indicado_id`): a
 *   conversão repetida, ou o pedido convertido de novo, não duplica;
 * - um crédito por indicação (`creditos_de_indicacao.indicacao_id`): o
 *   webhook entrega o mesmo pagamento duas vezes (CONFIRMED e RECEIVED do
 *   cartão), e o segundo pagamento da conta também passa por aqui. A
 *   conferência antes do insert evita o trabalho; a chave única é a trava
 *   de verdade na corrida.
 */

type Servico = ReturnType<typeof createServiceClient>;

/**
 * A recompensa de quem indica: 50% de desconto em UMA mensalidade.
 *
 * Por que percentual e não reais (decisão de 29/10/2026, ajustável aqui): o
 * mesmo número serve à conta de R$ 97 e à de R$ 970, sem a Astro pagar mais
 * do que recebe da conta pequena; e 50% de um mês é o que a conta indicada
 * paga em ~2 semanas, então a indicação se paga já no primeiro pagamento
 * dela. O valor em reais fica gravado só como estimativa (mensalidade de
 * quem indicou no dia), para a plataforma enxergar o tamanho do desconto.
 * Mudar a regra muda só os créditos novos: os já gerados guardam percentual
 * e meses na própria linha.
 */
export const RECOMPENSA_DA_INDICACAO = { percentual: 50, meses: 1 } as const;

/** O texto do crédito, como aparece para o gestor e na plataforma. */
export function descricaoDaRecompensa(r: { percentual: number; meses: number } = RECOMPENSA_DA_INDICACAO): string {
  const meses = r.meses === 1 ? "1 mensalidade" : `${r.meses} mensalidades`;
  return `${r.percentual}% de desconto em ${meses}`;
}

/** Reais da recompensa pela mensalidade de quem indicou; `null` sem mensalidade. */
export function valorEstimadoDoCredito(
  mensalidade: number | null | undefined,
  r: { percentual: number; meses: number } = RECOMPENSA_DA_INDICACAO,
): number | null {
  if (typeof mensalidade !== "number" || !Number.isFinite(mensalidade) || mensalidade <= 0) return null;
  return Math.round(mensalidade * (r.percentual / 100) * r.meses * 100) / 100;
}

// ── Situação de cada indicação, para o gestor e a plataforma ─────────────

export type StatusDaIndicacao = "aguardando_pagamento" | "credito_gerado" | "credito_aplicado" | "conta_cancelada";

export const ROTULO_DO_STATUS_DA_INDICACAO: Record<StatusDaIndicacao, string> = {
  aguardando_pagamento: "Aguardando o primeiro pagamento",
  credito_gerado: "Pagou: crédito gerado",
  credito_aplicado: "Crédito aplicado",
  conta_cancelada: "Conta cancelada",
};

/**
 * A situação deriva das linhas, nada é gravado: crédito aplicado > crédito
 * gerado > conta indicada cancelada antes de pagar > aguardando.
 */
export function statusDaIndicacao(entrada: {
  credito: { aplicadoEm: string | null } | null;
  indicadaEncerrada: boolean;
}): StatusDaIndicacao {
  if (entrada.credito?.aplicadoEm) return "credito_aplicado";
  if (entrada.credito) return "credito_gerado";
  if (entrada.indicadaEncerrada) return "conta_cancelada";
  return "aguardando_pagamento";
}

// ── Registrar a indicação ─────────────────────────────────────────────────

export type ResultadoDoRegistro =
  | { resultado: "registrada"; indicacaoId: string; grupoIndicadorId: string }
  | { resultado: "sem_codigo" }
  | { resultado: "codigo_desconhecido" }
  | { resultado: "propria_conta" }
  | { resultado: "ja_indicada" }
  | { resultado: "falhou"; motivo: string };

/**
 * Liga a conta recém-criada (`grupoIndicadoId`) à conta dona do código.
 * Código inválido ou de ninguém: nada acontece (a pessoa pode ter digitado
 * errado; a conta nasce do mesmo jeito).
 */
export async function registrarIndicacao(
  servico: Servico,
  entrada: { codigo: unknown; grupoIndicadoId: string; pedidoId?: string | null },
): Promise<ResultadoDoRegistro> {
  const codigo = normalizarCodigoDeIndicacao(entrada.codigo);
  if (!codigo) return { resultado: "sem_codigo" };
  try {
    const { data: indicador, error } = await servico
      .from("grupos")
      .select("id")
      .eq("codigo_de_indicacao", codigo)
      .maybeSingle();
    if (error) return { resultado: "falhou", motivo: `código não conferido: ${error.message}` };
    if (!indicador) return { resultado: "codigo_desconhecido" };
    if (indicador.id === entrada.grupoIndicadoId) return { resultado: "propria_conta" };

    const { data: nova, error: erroDoInsert } = await servico
      .from("indicacoes")
      .insert({
        codigo,
        grupo_indicador_id: indicador.id,
        grupo_indicado_id: entrada.grupoIndicadoId,
        pedido_id: entrada.pedidoId ?? null,
      })
      .select("id")
      .single();
    if (erroDoInsert) {
      if (erroDoInsert.code === "23505") return { resultado: "ja_indicada" };
      return { resultado: "falhou", motivo: `indicação não gravada: ${erroDoInsert.message}` };
    }
    return { resultado: "registrada", indicacaoId: nova.id, grupoIndicadorId: indicador.id };
  } catch (e) {
    return { resultado: "falhou", motivo: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * A conta nasceu de um pedido: o código vem do pedido
 * (`pedidos_de_contratacao.codigo_de_indicacao`) e, sem ele, do
 * `codigoDoVisitante` (o cookie `astro_indicacao` lido por quem chama, só
 * no caminho PÚBLICO do teste grátis: na plataforma o cookie seria o do
 * administrador, e quem chama de lá não passa nada).
 */
export async function registrarIndicacaoDoPedido(
  servico: Servico,
  entrada: { pedidoId: string; grupoIndicadoId: string; codigoDoVisitante?: string | null },
): Promise<ResultadoDoRegistro> {
  try {
    const { data: pedido, error } = await servico
      .from("pedidos_de_contratacao")
      .select("codigo_de_indicacao")
      .eq("id", entrada.pedidoId)
      .maybeSingle();
    if (error) return { resultado: "falhou", motivo: `pedido não lido: ${error.message}` };
    return registrarIndicacao(servico, {
      codigo: pedido?.codigo_de_indicacao ?? entrada.codigoDoVisitante ?? null,
      grupoIndicadoId: entrada.grupoIndicadoId,
      pedidoId: entrada.pedidoId,
    });
  } catch (e) {
    return { resultado: "falhou", motivo: e instanceof Error ? e.message : String(e) };
  }
}

// ── Recompensar no primeiro pagamento ─────────────────────────────────────

export type ResultadoDaRecompensa =
  | { resultado: "gerado"; creditoId: string; grupoBeneficiadoId: string; descricao: string; valorEstimado: number | null }
  | { resultado: "sem_indicacao" }
  | { resultado: "sem_pagamento" }
  | { resultado: "ja_recompensada" }
  | { resultado: "falhou"; motivo: string };

/**
 * Chamada DEPOIS de gravar um pagamento da conta `grupoPagante` (à mão ou
 * pelo webhook). Se ela foi indicada e já tem um pagamento de verdade
 * (valor > 0; a linha de valor 0 do cadastro, 0207, não conta), quem indicou
 * ganha o crédito — uma vez só. Pode ser chamada quantas vezes vier: a
 * partir do segundo pagamento devolve `ja_recompensada`.
 */
export async function recompensarIndicacao(servico: Servico, grupoPagante: string): Promise<ResultadoDaRecompensa> {
  try {
    const { data: indicacao, error: erroDaIndicacao } = await servico
      .from("indicacoes")
      .select("id, grupo_indicador_id")
      .eq("grupo_indicado_id", grupoPagante)
      .maybeSingle();
    if (erroDaIndicacao) return { resultado: "falhou", motivo: `indicação não lida: ${erroDaIndicacao.message}` };
    if (!indicacao) return { resultado: "sem_indicacao" };

    const { data: jaTem, error: erroDoCredito } = await servico
      .from("creditos_de_indicacao")
      .select("id")
      .eq("indicacao_id", indicacao.id)
      .maybeSingle();
    if (erroDoCredito) return { resultado: "falhou", motivo: `crédito não conferido: ${erroDoCredito.message}` };
    if (jaTem) return { resultado: "ja_recompensada" };

    const { data: pagamento, error: erroDoPagamento } = await servico
      .from("pagamentos_do_grupo")
      .select("id")
      .eq("grupo_id", grupoPagante)
      .gt("valor", 0)
      .order("pago_em", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (erroDoPagamento) return { resultado: "falhou", motivo: `pagamento não lido: ${erroDoPagamento.message}` };
    if (!pagamento) return { resultado: "sem_pagamento" };

    // A mensalidade de quem indicou, só para a estimativa em reais. Falhou a
    // leitura: o crédito sai sem estimativa (a plataforma confere na tela).
    const { data: indicador } = await servico
      .from("grupos")
      .select("mensalidade")
      .eq("id", indicacao.grupo_indicador_id)
      .maybeSingle();
    const valorEstimado = valorEstimadoDoCredito(indicador?.mensalidade ?? null);
    const descricao = descricaoDaRecompensa();

    const { data: credito, error: erroDoInsert } = await servico
      .from("creditos_de_indicacao")
      .insert({
        indicacao_id: indicacao.id,
        grupo_beneficiado_id: indicacao.grupo_indicador_id,
        pagamento_id: pagamento.id,
        percentual: RECOMPENSA_DA_INDICACAO.percentual,
        meses: RECOMPENSA_DA_INDICACAO.meses,
        valor_estimado: valorEstimado,
        descricao,
      })
      .select("id")
      .single();
    if (erroDoInsert) {
      // Corrida: a outra entrega do mesmo pagamento gravou primeiro.
      if (erroDoInsert.code === "23505") return { resultado: "ja_recompensada" };
      return { resultado: "falhou", motivo: `crédito não gravado: ${erroDoInsert.message}` };
    }
    return {
      resultado: "gerado",
      creditoId: credito.id,
      grupoBeneficiadoId: indicacao.grupo_indicador_id,
      descricao,
      valorEstimado,
    };
  } catch (e) {
    return { resultado: "falhou", motivo: e instanceof Error ? e.message : String(e) };
  }
}
