"use server";

import { exigirGestorNaAcao } from "@/lib/guardas";
import { lerFinanceiroDoDono } from "@/lib/financeiro/assistenteDados";
import {
  cortarValorInventado,
  montarBlocoFinanceiro,
  promptDoAssistente,
  VERSAO_DO_PROMPT_FINANCEIRO,
} from "@/lib/financeiro/assistenteFinanceiro";
import { numerosDaFrase } from "@/lib/consultor/guardrails";
import { hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { chamarLlmJson } from "@/lib/whatsapp/llm";
import { registrarInteracao } from "@/lib/whatsapp/telemetria";

/**
 * A pergunta do dono ao assistente financeiro (07/10/2026). Só o gestor. A
 * conversa vive na tela (não é gravada): pergunta de dinheiro da empresa não
 * precisa de histórico no banco, e o que importa medir (custo, corte do
 * guardrail) vai para `ia_interacoes`.
 */

export type MensagemFinanceira = { papel: "dono" | "ia"; texto: string };
export type RespostaFinanceira = { erro?: string; resposta?: string; cortou?: boolean };

const TETO_PERGUNTA = 600;

export async function perguntarAoFinanceiro(historico: MensagemFinanceira[], pergunta: string): Promise<RespostaFinanceira> {
  const guarda = await exigirGestorNaAcao();
  if (!guarda.corretor) return { erro: guarda.erro ?? "Acesso negado." };
  const texto = pergunta.trim().slice(0, TETO_PERGUNTA);
  if (!texto) return { erro: "Escreva a pergunta." };

  const leitura = await lerFinanceiroDoDono(hojeEmSaoPaulo());
  if (!leitura.ok) {
    return { erro: leitura.motivo === "sem_tabela" ? "O caixa ainda não foi ativado no banco." : "Não consegui ler os números agora. Tente de novo." };
  }

  const bloco = montarBlocoFinanceiro(leitura.dados);
  const historicoLimpo = (Array.isArray(historico) ? historico : [])
    .filter((m) => (m.papel === "dono" || m.papel === "ia") && typeof m.texto === "string")
    .slice(-8)
    .map((m) => ({ papel: m.papel, texto: m.texto.slice(0, 1200) }));
  const prompt = promptDoAssistente(bloco.texto, historicoLimpo, texto);

  const r = await chamarLlmJson(prompt, { temperature: 0.2, orcamentoMs: 25_000 });
  if (!r.ok) {
    void registrarInteracao({
      corretorId: guarda.corretor.id,
      origem: "financeiro",
      promptVersao: VERSAO_DO_PROMPT_FINANCEIRO,
      acao: "contingencia",
      fallback: true,
      latenciaMs: r.latenciaMs,
      modelo: null,
    });
    return { erro: "O assistente não respondeu agora. Os números estão nas telas Caixa e Resultado do mês." };
  }

  const bruta = (r.json as { resposta?: unknown })?.resposta;
  const resposta = typeof bruta === "string" ? bruta.trim() : "";
  // Números que o dono escreveu podem voltar na resposta: repetir não é inventar.
  const permitidos = [...bloco.numeros, ...numerosDaFrase(texto)];
  const corte = resposta ? cortarValorInventado(resposta, permitidos) : { texto: "", cortou: false };

  void registrarInteracao({
    corretorId: guarda.corretor.id,
    origem: "financeiro",
    promptVersao: VERSAO_DO_PROMPT_FINANCEIRO,
    acao: !corte.texto ? "resposta_vazia" : corte.cortou ? "respondida_com_corte" : "respondida",
    fallback: false,
    latenciaMs: r.latenciaMs,
    tokensEntrada: r.tokensEntrada,
    tokensSaida: r.tokensSaida,
    modelo: r.modelo,
  });

  if (!corte.texto) return { erro: "O assistente não conseguiu responder. Tente perguntar de outro jeito." };
  return { resposta: corte.texto, cortou: corte.cortou };
}
