import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
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
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;

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

  if (!apiKey || conversaTexto.trim().length < 20) {
    return dossieDefault;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `${PROMPT_DOSSIE}\n\n--- TRANSCRIÇÃO DA CONVERSA ---\n${conversaTexto.slice(0, 12000)}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    clearTimeout(timeoutId);

    if (response.ok) {
      const json = await response.json();
      const texto = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (texto) {
        const parsed = JSON.parse(texto);
        const score = typeof parsed.temperaturaScore === "number" ? Math.min(100, Math.max(0, parsed.temperaturaScore)) : 50;
        const label: TemperaturaLeadLabel = score >= 75 ? "quente" : score >= 40 ? "morno" : "frio";

        return {
          id: "dossie-" + leadId,
          leadId,
          orcamentoMin: typeof parsed.orcamentoMin === "number" ? parsed.orcamentoMin : null,
          orcamentoMax: typeof parsed.orcamentoMax === "number" ? parsed.orcamentoMax : null,
          formaPagamento: parsed.formaPagamento || null,
          perfilFamiliar: parsed.perfilFamiliar || null,
          urgenciaMudanca: parsed.urgenciaMudanca || null,
          exigenciasEspecificas: Array.isArray(parsed.exigenciasEspecificas) ? parsed.exigenciasEspecificas : [],
          objecoesIdentificadas: Array.isArray(parsed.objecoesIdentificadas) ? parsed.objecoesIdentificadas : [],
          temperaturaScore: score,
          temperaturaLabel: (parsed.temperaturaLabel as TemperaturaLeadLabel) || label,
          resumoExecutivo: parsed.resumoExecutivo || "Lead qualificado via inteligência artificial.",
          proximoPassoSugerido: parsed.proximoPassoSugerido || "Dar continuidade ao atendimento.",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    console.error("Erro ao gerar dossiê do lead no Gemini:", err);
  }

  return dossieDefault;
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
