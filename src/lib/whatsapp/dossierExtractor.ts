import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { chamarGeminiJson, geminiConfigurado, TIMEOUT_DOSSIE_MS } from "./gemini";
import type { DossieClienteIA, TemperaturaLeadLabel } from "./types";

const PROMPT_DOSSIE = `Você é um analista sênior de inteligência comercial imobiliária da Next Home.
Sua missão é ler a transcrição de uma conversa de WhatsApp entre um cliente e a imobiliária e extrair um DOSSIÊ EXECUTIVO ESTRUTURADO do cliente.

Você DEVE responder EXCLUSIVAMENTE um objeto JSON válido no seguinte formato:
{
  "orcamentoMin": number ou null,
  "orcamentoMax": number ou null,
  "formaPagamento": "a_vista" | "financiamento" | "permuta" | "misto" | null,
  "perfilFamiliar": "casal_com_filhos" | "casal_sem_filhos" | "solteiro" | "investidor" | null,
  "urgenciaMudanca": "imediata" | "3_meses" | "6_meses" | "apenas_pesquisando" | null,
  "exigenciasEspecificas": ["lista de exigencias citadas como andar_alto, 3_vagas, pet_friendly, vista_livre, etc"],
  "objecoesIdentificadas": ["lista de dúvidas ou objeções citadas como preco, taxa_condominio, prazo_entrega, etc"],
  "temperaturaScore": 0 a 100 (número indicando probabilidade de compra nos próximos 60 dias),
  "temperaturaLabel": "quente" | "morno" | "frio",
  "resumoExecutivo": "Resumo em tópicos com as principais dores, preferências e perfil do cliente",
  "proximoPassoSugerido": "Ação recomendada para o corretor humano realizar no próximo contato"
}`;

/**
 * Analisa a conversa e extrai o Dossiê de Inteligência do Cliente.
 */
export async function extrairDossieCliente(
  conversaTexto: string,
  leadId: string,
): Promise<DossieClienteIA> {
  const dossieDefault: DossieClienteIA = {
    id: "temp-" + leadId,
    leadId,
    orcamentoMin: null,
    orcamentoMax: null,
    formaPagamento: null,
    perfilFamiliar: null,
    urgenciaMudanca: null,
    exigenciasEspecificas: [],
    objecoesIdentificadas: [],
    temperaturaScore: 50,
    temperaturaLabel: "morno",
    resumoExecutivo: "Lead em atendimento inicial via WhatsApp.",
    proximoPassoSugerido: "Entrar em contato para qualificar interesse.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!geminiConfigurado() || conversaTexto.trim().length < 20) {
    return dossieDefault;
  }

  // A chamada (timeout + retentativa) mora em gemini.ts — a mesma
  // resiliência do agente de resposta, sem duplicar o fetch aqui.
  //
  // Teto menor que o do agente de propósito: o dossiê é extraído DEPOIS de
  // as mensagens já terem saído, então ninguém está esperando por ele — e
  // é o que deixa o orçamento de 60s do webhook fechar com folga.
  const resultado = await chamarGeminiJson(
    `${PROMPT_DOSSIE}\n\n--- TRANSCRIÇÃO DA CONVERSA ---\n${conversaTexto.slice(0, 12000)}`,
    { temperature: 0.1, timeoutMs: TIMEOUT_DOSSIE_MS },
  );

  if (!resultado.ok) {
    console.error("Erro ao gerar dossiê do lead no Gemini:", resultado.erro);
    return dossieDefault;
  }

  const parsed = resultado.json as Record<string, unknown>;
  const score =
    typeof parsed.temperaturaScore === "number"
      ? Math.min(100, Math.max(0, parsed.temperaturaScore))
      : 50;
  const label: TemperaturaLeadLabel = score >= 75 ? "quente" : score >= 40 ? "morno" : "frio";

  return {
    id: "dossie-" + leadId,
    leadId,
    orcamentoMin: typeof parsed.orcamentoMin === "number" ? parsed.orcamentoMin : null,
    orcamentoMax: typeof parsed.orcamentoMax === "number" ? parsed.orcamentoMax : null,
    formaPagamento: (parsed.formaPagamento as DossieClienteIA["formaPagamento"]) || null,
    perfilFamiliar: (parsed.perfilFamiliar as DossieClienteIA["perfilFamiliar"]) || null,
    urgenciaMudanca: (parsed.urgenciaMudanca as DossieClienteIA["urgenciaMudanca"]) || null,
    exigenciasEspecificas: Array.isArray(parsed.exigenciasEspecificas) ? (parsed.exigenciasEspecificas as string[]) : [],
    objecoesIdentificadas: Array.isArray(parsed.objecoesIdentificadas) ? (parsed.objecoesIdentificadas as string[]) : [],
    temperaturaScore: score,
    temperaturaLabel: (parsed.temperaturaLabel as TemperaturaLeadLabel) || label,
    resumoExecutivo: (parsed.resumoExecutivo as string) || "Lead qualificado via inteligência artificial.",
    proximoPassoSugerido: (parsed.proximoPassoSugerido as string) || "Dar continuidade ao atendimento.",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * O que mudou de relevante entre o dossiê anterior e o novo — a mensagem
 * curta que vai para o corretor a cada avanço real da conversa (ver
 * `notificarAtualizacaoCorretor` em brokerNotifier.ts).
 *
 * Função pura, sem rede: recebe os dois dossiês prontos e só compara. `null`
 * quando não há nada digno de interromper o corretor — reextrair o dossiê a
 * cada mensagem naturalmente reafirma o que já se sabia, e reafirmação não é
 * novidade.
 */
export function resumirMudancasDossie(
  anterior: DossieClienteIA | null,
  novo: DossieClienteIA,
): string | null {
  const mudancas: string[] = [];

  if (novo.temperaturaLabel !== (anterior?.temperaturaLabel ?? null)) {
    mudancas.push(
      `🌡️ Temperatura${anterior ? ` mudou de ${anterior.temperaturaLabel} para` : " identificada como"} *${novo.temperaturaLabel}* (${novo.temperaturaScore}/100)`,
    );
  }

  const orcamentoAntes = anterior?.orcamentoMin ?? anterior?.orcamentoMax ?? null;
  const orcamentoAgora = novo.orcamentoMin ?? novo.orcamentoMax ?? null;
  if (orcamentoAgora !== null && orcamentoAntes === null) {
    const faixa =
      novo.orcamentoMin && novo.orcamentoMax
        ? `${formatarMoedaBRL(novo.orcamentoMin)} a ${formatarMoedaBRL(novo.orcamentoMax)}`
        : formatarMoedaBRL(novo.orcamentoMin ?? novo.orcamentoMax);
    mudancas.push(`💰 Orçamento identificado: ${faixa}`);
  }

  if (novo.urgenciaMudanca && novo.urgenciaMudanca !== (anterior?.urgenciaMudanca ?? null)) {
    mudancas.push(`⏱️ Urgência: ${novo.urgenciaMudanca.replace(/_/g, " ")}`);
  }

  const objecoesAntes = new Set(anterior?.objecoesIdentificadas ?? []);
  const objecoesNovas = novo.objecoesIdentificadas.filter((o) => !objecoesAntes.has(o));
  if (objecoesNovas.length > 0) {
    mudancas.push(`❗ Nova(s) objeção(ões): ${objecoesNovas.join(", ").replace(/_/g, " ")}`);
  }

  return mudancas.length > 0 ? mudancas.join("\n") : null;
}
