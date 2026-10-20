// A cota de respostas da IA por grupo e por mês (fase 2B enxuta, spec §10).
//
// Módulo PURO: o webhook, a varredura de respostas atrasadas, a faixa do
// painel e a área da plataforma fazem a MESMA conta. Duas contas do mesmo
// número já fizeram a tela dizer uma coisa e o atendimento fazer outra nesta
// base (o selo "IA atendendo" com a IA muda).
//
// NÚMEROS PROVISÓRIOS (decididos sem o dono em 20/10/2026, a partir da
// tabela do §10): valem até medir o custo real por resposta. O FORMATO é o
// definitivo — teto do plano, ajuste da plataforma por cima, mês de São
// Paulo, aviso aos 80%.
//
// Quem CONTA é o banco (gatilho `contar_resposta_da_ia`, 0197). Aqui só se
// decide o teto e o que ele significa.

import type { Plano } from "@/lib/plataforma/rotulosDoGrupo";

/**
 * Respostas da IA por mês, por plano. Imobiliária é POR ASSENTO (as cotas
 * somam na equipe). `null` = sem teto: o plano a preço de custo paga o que
 * usar — é o da Next Home (grupo 1).
 */
export const RESPOSTAS_DA_IA_POR_MES: Record<Plano, number | null> = {
  essencial: 1000,
  profissional: 2000,
  imobiliaria: 1500,
  custo: null,
};

/** Planos cujo número é por assento. */
const POR_ASSENTO: ReadonlySet<Plano> = new Set(["imobiliaria"]);

/** A partir de quanto do teto o gestor é avisado. */
export const LIMIAR_DE_AVISO = 0.8;

/**
 * O teto do mês. O ajuste da plataforma (`grupos.teto_respostas_ia`) vence o
 * plano; sem ajuste, o plano decide. Assento (provisório): número de
 * WhatsApp cadastrado no grupo, no mínimo 1.
 */
export function tetoDeRespostasDaIa(p: {
  plano: Plano;
  tetoAjustado: number | null;
  assentos: number;
}): number | null {
  if (p.tetoAjustado !== null && p.tetoAjustado !== undefined) return Math.max(0, Math.floor(p.tetoAjustado));
  const base = RESPOSTAS_DA_IA_POR_MES[p.plano];
  if (base === null) return null;
  return POR_ASSENTO.has(p.plano) ? base * Math.max(1, p.assentos) : base;
}

const FUSO = "America/Sao_Paulo";
/** São Paulo não tem horário de verão desde 2019: o deslocamento é fixo. */
const DESLOCAMENTO_SP = "-03:00";

function anoMesEmSaoPaulo(agora: Date): { ano: number; mes: number } {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit" }).formatToParts(agora);
  const ano = Number(partes.find((p) => p.type === "year")?.value);
  const mes = Number(partes.find((p) => p.type === "month")?.value);
  return { ano, mes };
}

/** O primeiro dia do mês corrente em São Paulo, como o banco grava (`YYYY-MM-01`). */
export function mesEmSaoPaulo(agora: Date = new Date()): string {
  const { ano, mes } = anoMesEmSaoPaulo(agora);
  return `${ano}-${String(mes).padStart(2, "0")}-01`;
}

/** Quando a cota volta: meia-noite do dia 1º do mês seguinte, em São Paulo. */
export function inicioDoProximoMesEmSaoPaulo(agora: Date = new Date()): Date {
  const { ano, mes } = anoMesEmSaoPaulo(agora);
  const proxAno = mes === 12 ? ano + 1 : ano;
  const proxMes = mes === 12 ? 1 : mes + 1;
  return new Date(`${proxAno}-${String(proxMes).padStart(2, "0")}-01T00:00:00${DESLOCAMENTO_SP}`);
}

export type NivelDaCota = "sem_teto" | "livre" | "aviso" | "esgotada";

export type SituacaoDaCota = {
  respostas: number;
  teto: number | null;
  /** 0–100 (pode passar de 100 por corrida); `null` sem teto. */
  percentual: number | null;
  /** Quantas ainda cabem no mês; `null` sem teto. */
  restantes: number | null;
  nivel: NivelDaCota;
};

export function situacaoDaCota(p: { respostas: number; teto: number | null }): SituacaoDaCota {
  const respostas = Math.max(0, p.respostas);
  if (p.teto === null) return { respostas, teto: null, percentual: null, restantes: null, nivel: "sem_teto" };
  const teto = p.teto;
  const restantes = Math.max(0, teto - respostas);
  const percentual = teto === 0 ? 100 : Math.floor((respostas / teto) * 100);
  const nivel: NivelDaCota =
    respostas >= teto ? "esgotada" : respostas >= teto * LIMIAR_DE_AVISO ? "aviso" : "livre";
  return { respostas, teto, percentual, restantes, nivel };
}
