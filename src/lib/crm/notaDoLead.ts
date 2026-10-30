// A nota do lead: 0–100, quente/morno/frio e o motivo numa linha
// (IA no atendimento, 30/10/2026).
//
// Pedido do dono: "nota do lead (quente/frio)". Já existia a TEMPERATURA do
// dossiê (`lead_observacoes_ia.temperatura_score`), mas ela é um palpite do
// modelo, só nasce quando a extração roda e não esfria sozinha: o cliente que
// sumiu há três semanas continuava "quente · 80" na ficha.
//
// Aqui a conta é DETERMINÍSTICA, feita de sinais que o banco já tem (etapa,
// visita marcada, respostas recentes, intenção dita, orçamento/renda, tempo
// sem resposta, tentativas nossas sem retorno). A leitura da IA entra só como
// AJUSTE limitado (`refinarComAIa`): a régua é auditável, e o motivo diz em
// português de onde saiu o número.
//
// Módulo PURO: o webhook, a varredura do tique, a ficha e o resumo da
// conversa fazem a MESMA conta.

export type RotuloDaNota = "quente" | "morno" | "frio";

export type NotaDoLead = {
  score: number;
  label: RotuloDaNota;
  /** Uma linha, para o chip e a ficha: "Visita marcada · respondeu hoje". */
  motivo: string;
};

export type IntencaoDoCliente = "forte" | "media" | null;

export type SinaisDoLead = {
  etapa: string;
  /** Pediu para não ser contatado (`leads.nao_contatar_em`). */
  naoContatar?: boolean;
  /** A última fala DO CLIENTE (qualquer conversa do lead). */
  ultimaFalaDoClienteEm: string | null;
  /**
   * Conversa existe, mas nenhuma fala do cliente cabe na janela lida (a
   * varredura lê só os últimos N dias): "sem resposta há mais de N dias".
   */
  semFalaHaMaisDeDias?: number;
  /** Quantas falas do cliente nos últimos 7 dias. */
  falasDoClienteEm7Dias: number;
  /** Visita (ou reunião/consulta) marcada. */
  visitaAgendadaEm: string | null;
  orcamentoInformado: boolean;
  rendaInformada: boolean;
  intencao: IntencaoDoCliente;
  /** Quantas vezes NÓS falamos desde a última fala dele (0060). */
  tentativasSemResposta: number;
};

/** A partir de quanto a nota é quente / morna. */
export const LIMIAR_QUENTE = 70;
export const LIMIAR_MORNO = 40;

/** Onde todo lead começa, antes dos sinais. */
const BASE = 30;

const PESO_DA_ETAPA: Record<string, number> = {
  novo: 0,
  primeiro_contato: 5,
  em_conversa: 10,
  qualificado: 15,
  visita_agendada: 20,
  visitou: 25,
  proposta: 30,
  documentacao: 35,
};

const HORA = 3_600_000;
const DIA = 24 * HORA;

export function rotuloDaNota(score: number): RotuloDaNota {
  return score >= LIMIAR_QUENTE ? "quente" : score >= LIMIAR_MORNO ? "morno" : "frio";
}

function limitar(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/*
 * Intenção dita pelo cliente, por expressão. Só o óbvio: o que é ambíguo
 * fica para a leitura da IA no resumo. "Forte" é pedido de próximo passo
 * (marcar, fechar, ligar, como pagar); "média" é interesse com assunto
 * (preço, condição, financiamento, disponibilidade).
 */
const INTENCAO_FORTE: RegExp[] = [
  /\bquero\s+(fechar|comprar|contratar|agendar|marcar|visitar|conhecer|assinar)\b/i,
  /\b(vamos|podemos|pode)\s+(fechar|marcar|agendar)\b/i,
  /\bme\s+liga\b|\bpode\s+me\s+ligar\b/i,
  /\bcomo\s+(fa[çc]o|funciona)\s+(pra|para)\s+(comprar|contratar|pagar|fechar)\b/i,
  /\bmanda\s+(a\s+)?(proposta|contrato|boleto)\b/i,
  /\b(tenho|estou\s+com)\s+(o\s+)?(dinheiro|entrada|cr[ée]dito\s+aprovado)\b/i,
];
const INTENCAO_MEDIA: RegExp[] = [
  /\btenho\s+interesse\b|\binteressad[oa]\b|\bgostei\b/i,
  /\bquanto\s+(custa|fica|sai)\b|\bqual\s+(o\s+)?(valor|pre[çc]o)\b/i,
  /\b(parcela|financiamento|financiar|entrada|or[çc]amento|condi[çc][õo]es)\b/i,
  /\b(ainda\s+)?(est[áa]|tem)\s+dispon[íi]vel\b/i,
];

/** A intenção nas falas recentes do cliente (a mais forte vence). */
export function intencaoNasFalas(falas: string[], urgenciaDoDossie?: string | null): IntencaoDoCliente {
  if (falas.some((f) => INTENCAO_FORTE.some((p) => p.test(f)))) return "forte";
  if (urgenciaDoDossie === "imediata") return "forte";
  if (falas.some((f) => INTENCAO_MEDIA.some((p) => p.test(f)))) return "media";
  if (urgenciaDoDossie === "3_meses") return "media";
  return null;
}

const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

type Fator = { peso: number; texto: string };

/**
 * A nota pelos sinais. `compromisso` é a palavra do ramo ("visita",
 * "reunião", "consulta"): o motivo aparece na tela de qualquer conta.
 */
export function calcularNotaDoLead(
  s: SinaisDoLead,
  agora: Date = new Date(),
  vocabulario: { compromisso: string } = { compromisso: "visita" },
): NotaDoLead {
  if (s.etapa === "perdido") return { score: 0, label: "frio", motivo: "Negócio perdido" };
  if (s.etapa === "fechado") return { score: 0, label: "frio", motivo: "Negócio já fechado" };
  if (s.naoContatar) return { score: 0, label: "frio", motivo: "Pediu para não ser contatado" };

  const fatores: Fator[] = [];
  const etapa = PESO_DA_ETAPA[s.etapa] ?? 0;
  if (etapa >= 25) fatores.push({ peso: etapa, texto: s.etapa === "visitou" ? `Já fez a ${vocabulario.compromisso}` : "Negociação avançada" });
  else if (etapa > 0) fatores.push({ peso: etapa, texto: "Em atendimento" });

  const visita = s.visitaAgendadaEm ? new Date(s.visitaAgendadaEm) : null;
  if (visita && !Number.isNaN(visita.getTime())) {
    const ate = visita.getTime() - agora.getTime();
    // Marcada no futuro (ou há até 2 dias, ainda sem desfecho na etapa).
    if (ate > -2 * DIA) fatores.push({ peso: 15, texto: `${maiuscula(vocabulario.compromisso)} marcada para ${dataCurta.format(visita)}` });
  }

  if (s.intencao === "forte") fatores.push({ peso: 15, texto: "Pediu o próximo passo" });
  else if (s.intencao === "media") fatores.push({ peso: 7, texto: "Perguntou valores e condições" });

  if (s.orcamentoInformado && s.rendaInformada) fatores.push({ peso: 10, texto: "Informou orçamento e renda" });
  else if (s.orcamentoInformado) fatores.push({ peso: 5, texto: "Informou orçamento" });
  else if (s.rendaInformada) fatores.push({ peso: 5, texto: "Informou renda" });

  if (s.falasDoClienteEm7Dias >= 5) fatores.push({ peso: 10, texto: "Conversa ativa na semana" });
  else if (s.falasDoClienteEm7Dias >= 2) fatores.push({ peso: 5, texto: "Respondeu esta semana" });

  const ultima = s.ultimaFalaDoClienteEm ? new Date(s.ultimaFalaDoClienteEm) : null;
  if (ultima && !Number.isNaN(ultima.getTime())) {
    const desde = agora.getTime() - ultima.getTime();
    if (desde < DIA) fatores.push({ peso: 10, texto: "Falou nas últimas 24h" });
    else if (desde < 3 * DIA) fatores.push({ peso: 5, texto: "Falou nos últimos 3 dias" });
    else if (desde > 14 * DIA) fatores.push({ peso: -25, texto: `Sem resposta há ${Math.floor(desde / DIA)} dias` });
    else if (desde > 7 * DIA) fatores.push({ peso: -15, texto: `Sem resposta há ${Math.floor(desde / DIA)} dias` });
  } else if (s.semFalaHaMaisDeDias) {
    fatores.push({ peso: -25, texto: `Sem resposta há mais de ${s.semFalaHaMaisDeDias} dias` });
  } else {
    fatores.push({ peso: -5, texto: "Ainda não respondeu" });
  }

  if (s.tentativasSemResposta >= 3) fatores.push({ peso: -15, texto: `${s.tentativasSemResposta} tentativas sem retorno` });
  else if (s.tentativasSemResposta >= 1) fatores.push({ peso: -5, texto: "Última mensagem nossa sem retorno" });

  const score = limitar(BASE + fatores.reduce((soma, f) => soma + f.peso, 0));
  const label = rotuloDaNota(score);
  return { score, label, motivo: motivoDosFatores(fatores, label) };
}

/**
 * Os dois fatores que mais explicam a faixa: os positivos para quente/morno,
 * os negativos para frio (com o positivo mais forte como consolo, se não
 * houver negativo).
 */
function motivoDosFatores(fatores: Fator[], label: RotuloDaNota): string {
  const positivos = fatores.filter((f) => f.peso > 0).sort((a, b) => b.peso - a.peso);
  const negativos = fatores.filter((f) => f.peso < 0).sort((a, b) => a.peso - b.peso);
  const escolhidos = label === "frio" ? (negativos.length ? negativos : positivos) : positivos;
  const texto = escolhidos.slice(0, 2).map((f) => f.texto).join(" · ");
  return texto || (label === "frio" ? "Poucos sinais de interesse até agora" : "Em atendimento");
}

function maiuscula(t: string): string {
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** Quanto a leitura da IA pode mexer na nota, para cima ou para baixo. */
export const AJUSTE_MAXIMO_DA_IA = 10;

/**
 * A leitura da IA (do resumo da conversa) refina a nota, sem mandar nela:
 * puxa até `AJUSTE_MAXIMO_DA_IA` pontos na direção do rótulo que ela leu.
 * Negócio encerrado (score 0 por regra) não é refinado.
 */
export function refinarComAIa(nota: NotaDoLead, leituraDaIa: RotuloDaNota | null | undefined): NotaDoLead {
  if (!leituraDaIa || nota.score === 0) return nota;
  const alvo = leituraDaIa === "quente" ? 85 : leituraDaIa === "morno" ? 55 : 20;
  const delta = Math.max(-AJUSTE_MAXIMO_DA_IA, Math.min(AJUSTE_MAXIMO_DA_IA, Math.round((alvo - nota.score) / 2)));
  if (delta === 0) return nota;
  const score = limitar(nota.score + delta);
  return { score, label: rotuloDaNota(score), motivo: nota.motivo };
}

/** A nota gravada no lead (colunas da 0248), ou `null` se nunca foi calculada. */
export function notaDaLinha(linha: {
  nota_score?: number | null;
  nota_label?: string | null;
  nota_motivo?: string | null;
}): NotaDoLead | null {
  if (typeof linha.nota_score !== "number") return null;
  const label = linha.nota_label === "quente" || linha.nota_label === "morno" || linha.nota_label === "frio" ? linha.nota_label : rotuloDaNota(linha.nota_score);
  return { score: linha.nota_score, label, motivo: linha.nota_motivo ?? "" };
}
