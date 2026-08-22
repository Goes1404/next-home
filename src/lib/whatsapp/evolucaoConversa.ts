import type { DossieClienteIA } from "./types";

/**
 * O corretor só é avisado quando a conversa EVOLUI — não a cada mensagem.
 *
 * O que havia antes: o dossiê é reextraído por IA a cada mensagem do
 * cliente, e `resumirMudancasDossie` disparava aviso a QUALQUER diferença
 * entre a leitura nova e a anterior. Só que duas leituras da mesma conversa
 * quase nunca saem idênticas: o score oscila 38 → 42 → 39 e o rótulo pula
 * frio ↔ morno; a urgência muda de "3_meses" para "6_meses" e volta; a IA
 * reescreve a mesma objeção com outra palavra. Cada oscilação dessas virava
 * uma mensagem no WhatsApp do corretor — e aviso que chega o tempo todo
 * deixa de ser lido, que é o pior desfecho possível para um alerta.
 *
 * A régua aqui é outra: só conta o que um corretor consideraria notícia.
 *
 * - Temperatura que SOBE de faixa (frio → morno → quente). Queda não é
 *   notícia acionável, e ida-e-volta é ruído do modelo, não do cliente.
 * - Orçamento descoberto pela primeira vez. Reestimativa depois não.
 * - Objeção realmente nova, comparada por forma normalizada — "preço",
 *   "preco" e "PREÇO" são a mesma objeção.
 * - Visita marcada. É o evento mais valioso do funil.
 *
 * Módulo puro: sem rede e sem banco, para o vitest exercitar exatamente o
 * que roda em produção.
 */

/** Faixas de temperatura, em ordem. O índice é o que permite comparar. */
const FAIXAS = ["frio", "morno", "quente"] as const;
export type FaixaTemperatura = (typeof FAIXAS)[number];

export function faixaDaTemperatura(score: number): FaixaTemperatura {
  if (score >= 75) return "quente";
  if (score >= 40) return "morno";
  return "frio";
}

/**
 * Margem para não trocar de faixa por um ponto.
 *
 * Sem ela, um cliente parado no limiar (39 → 41 → 38) subiria e desceria de
 * faixa a cada mensagem. Só conta como subida quando passa o limiar COM
 * folga — o mesmo princípio de um termostato, que não liga e desliga a cada
 * décimo de grau.
 */
const MARGEM_SUBIDA = 5;

function subiuDeFaixa(scoreAntes: number | null, scoreAgora: number): FaixaTemperatura | null {
  const faixaAgora = faixaDaTemperatura(scoreAgora);
  if (scoreAntes === null) {
    // Primeira leitura só é notícia se já nasceu morno ou quente.
    return faixaAgora === "frio" ? null : faixaAgora;
  }

  const faixaAntes = faixaDaTemperatura(scoreAntes);
  if (FAIXAS.indexOf(faixaAgora) <= FAIXAS.indexOf(faixaAntes)) return null;

  // Passou da faixa, mas passou com folga?
  const limiar = faixaAgora === "quente" ? 75 : 40;
  return scoreAgora >= limiar + MARGEM_SUBIDA ? faixaAgora : null;
}

/** "Preço", "preco", " PREÇO " são a mesma objeção. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .trim();
}

export type Evolucao = {
  /** Linhas prontas para a mensagem ao corretor. */
  linhas: string[];
  /** Notícia grande o bastante para furar a carência entre avisos. */
  urgente: boolean;
};

export function detectarEvolucao(params: {
  anterior: DossieClienteIA | null;
  novo: DossieClienteIA;
  visitaConfirmada?: boolean;
  formatarMoeda: (v: number | null) => string;
}): Evolucao | null {
  const { anterior, novo, visitaConfirmada, formatarMoeda } = params;
  const linhas: string[] = [];
  let urgente = false;

  if (visitaConfirmada) {
    linhas.push("📅 *Visita confirmada pelo cliente*");
    urgente = true;
  }

  const subiu = subiuDeFaixa(anterior?.temperaturaScore ?? null, novo.temperaturaScore);
  if (subiu) {
    linhas.push(`🌡️ Cliente esquentou: agora *${subiu}* (${novo.temperaturaScore}/100)`);
    if (subiu === "quente") urgente = true;
  }

  const tinhaOrcamento = (anterior?.orcamentoMin ?? anterior?.orcamentoMax ?? null) !== null;
  const orcamentoAgora = novo.orcamentoMin ?? novo.orcamentoMax ?? null;
  if (!tinhaOrcamento && orcamentoAgora !== null) {
    const faixa =
      novo.orcamentoMin && novo.orcamentoMax
        ? `${formatarMoeda(novo.orcamentoMin)} a ${formatarMoeda(novo.orcamentoMax)}`
        : formatarMoeda(novo.orcamentoMin ?? novo.orcamentoMax);
    linhas.push(`💰 Orçamento: ${faixa}`);
  }

  const jaConhecidas = new Set((anterior?.objecoesIdentificadas ?? []).map(normalizar));
  const novasObjecoes = novo.objecoesIdentificadas.filter((o) => !jaConhecidas.has(normalizar(o)));
  if (novasObjecoes.length > 0) {
    linhas.push(`❗ Objeção nova: ${novasObjecoes.join(", ").replace(/_/g, " ")}`);
  }

  return linhas.length > 0 ? { linhas, urgente } : null;
}

/**
 * Carência entre avisos da MESMA conversa.
 *
 * Mesmo com a régua acima, três evoluções seguidas em cinco minutos viram
 * três mensagens. Notícia urgente (visita marcada, cliente ficou quente)
 * fura a carência; o resto espera e entra no próximo aviso.
 */
export const CARENCIA_AVISO_MINUTOS = 45;

export function podeAvisarAgora(
  ultimoAvisoEm: Date | null,
  urgente: boolean,
  agora = new Date(),
): boolean {
  if (urgente || !ultimoAvisoEm) return true;
  return agora.getTime() - ultimoAvisoEm.getTime() >= CARENCIA_AVISO_MINUTOS * 60_000;
}
