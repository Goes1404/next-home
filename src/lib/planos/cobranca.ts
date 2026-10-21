// A cobrança manual e a suspensão por atraso (fase 2C enxuta, spec §11 e §20).
//
// Módulo PURO: o webhook, a varredura de follow-ups, o disparador de listas,
// a geração de artes e vídeos, a faixa do painel e a área da plataforma
// fazem a MESMA conta. Duas contas do mesmo número já fizeram a tela dizer
// uma coisa e o atendimento fazer outra nesta base (o selo "IA atendendo"
// com a IA muda).
//
// As regras são do dono (21/10/2026):
//
// - a mensalidade vence todo mês no dia do cadastro do grupo (1–28), sem pro
//   rata; a primeira competência é o mês do cadastro;
// - desde o dia do vencimento sem pagamento o painel avisa;
// - no 5º dia de atraso o grupo fica suspenso para o que custa (IA, listas,
//   artes e vídeos); o painel, o login e o site continuam;
// - o plano `custo` (a Next Home) nunca é cobrado nem suspenso por atraso;
// - a plataforma também suspende e reativa à mão (`suspensoManual`), e isso
//   vale até para o plano `custo`.
//
// A suspensão por atraso NÃO é gravada: é derivada aqui, na leitura. Não há
// cron nem estado que possa divergir do que a plataforma registrou.
//
// Datas no fuso de São Paulo, sempre como texto `AAAA-MM-DD`: o servidor
// roda em UTC, e às 21h de Brasília lá já é amanhã.

import { diaEmSP } from "@/lib/crm/resumoDoDia";

/** Quantos dias de atraso até a suspensão automática (vencimento + 5). */
export const DIAS_ATE_SUSPENDER = 5;

export type EstadoDaCobranca = "isento" | "em_dia" | "pendente" | "suspenso";

export type SituacaoDaCobranca = {
  estado: EstadoDaCobranca;
  /** A competência (`AAAA-MM-01`) MAIS ANTIGA vencida e não paga. */
  competenciaEmAberto: string | null;
  /** O vencimento (`AAAA-MM-DD`) dessa competência. */
  vencimento: string | null;
  /** Dias desde o vencimento; 0 no próprio dia. */
  diasDeAtraso: number;
  /** O dia (`AAAA-MM-DD`) em que a suspensão automática vale: vencimento + 5. */
  suspendeEm: string | null;
  /** O vencimento da próxima competência que ainda não venceu. */
  proximoVencimento: string;
};

const dois = (n: number) => String(n).padStart(2, "0");

/** Dias corridos desde 1970 de um `AAAA-MM-DD` (sem fuso: é só calendário). */
function emDias(dia: string): number {
  const [ano, mes, d] = dia.split("-").map(Number);
  return Math.round(Date.UTC(ano, mes - 1, d) / 86_400_000);
}

function somarDias(dia: string, n: number): string {
  const [ano, mes, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, d + n)).toISOString().slice(0, 10);
}

/** O dia do vencimento aceito: inteiro de 1 a 28 (fevereiro cabe em todos). */
export function diaDoVencimentoValido(dia: number): number {
  if (!Number.isFinite(dia)) return 1;
  return Math.min(28, Math.max(1, Math.floor(dia)));
}

/**
 * A primeira competência cobrada: o mês do cadastro, no fuso de São Paulo
 * (`AAAA-MM-01`).
 */
export function primeiraCompetencia(criadoEm: string): string {
  return `${diaEmSP(new Date(criadoEm)).slice(0, 7)}-01`;
}

export function situacaoDaCobranca(p: {
  plano: string;
  /** `grupos.situacao === 'suspenso'`: a suspensão feita à mão pela plataforma. */
  suspensoManual: boolean;
  /** `grupos.criado_em`. */
  criadoEm: string;
  /** 1..28. */
  diaDoVencimento: number;
  /** As competências com pagamento registrado, `AAAA-MM-01`. */
  competenciasPagas: string[];
  hoje: Date;
}): SituacaoDaCobranca {
  const hoje = diaEmSP(p.hoje);
  const dia = diaDoVencimentoValido(p.diaDoVencimento);
  const pagas = new Set(p.competenciasPagas.map((c) => c.slice(0, 7)));

  // Cada competência, da primeira em diante, até achar a que ainda não venceu.
  let ano = Number(primeiraCompetencia(p.criadoEm).slice(0, 4));
  let mes = Number(primeiraCompetencia(p.criadoEm).slice(5, 7));
  let emAberto: { competencia: string; vencimento: string } | null = null;
  let proximoVencimento = "";
  // Trava contra data absurda (cadastro no futuro distante, relógio errado).
  for (let i = 0; i < 1200; i++) {
    const competencia = `${ano}-${dois(mes)}-01`;
    const vencimento = `${ano}-${dois(mes)}-${dois(dia)}`;
    if (vencimento > hoje) {
      proximoVencimento = vencimento;
      break;
    }
    if (!emAberto && !pagas.has(competencia.slice(0, 7))) emAberto = { competencia, vencimento };
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  if (!proximoVencimento) proximoVencimento = `${ano}-${dois(mes)}-${dois(dia)}`;

  const isento = p.plano === "custo";
  // A Next Home não é cobrada: sem competência em aberto, sem prazo.
  const cobrado = isento ? null : emAberto;
  const diasDeAtraso = cobrado ? Math.max(0, emDias(hoje) - emDias(cobrado.vencimento)) : 0;

  let estado: EstadoDaCobranca;
  if (p.suspensoManual) estado = "suspenso";
  else if (isento) estado = "isento";
  else if (!cobrado) estado = "em_dia";
  else if (diasDeAtraso >= DIAS_ATE_SUSPENDER) estado = "suspenso";
  else estado = "pendente";

  return {
    estado,
    competenciaEmAberto: cobrado?.competencia ?? null,
    vencimento: cobrado?.vencimento ?? null,
    diasDeAtraso,
    suspendeEm: cobrado ? somarDias(cobrado.vencimento, DIAS_ATE_SUSPENDER) : null,
    proximoVencimento,
  };
}

/** O que custa fica parado: só o estado `suspenso` (manual ou por atraso). */
export function estaSuspenso(situacao: Pick<SituacaoDaCobranca, "estado">): boolean {
  return situacao.estado === "suspenso";
}

/** `AAAA-MM-DD` → `DD/MM`, para as frases das telas. */
export function diaEMes(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** `AAAA-MM-DD` → `DD/MM/AAAA`. */
export function dataCompleta(dia: string): string {
  return `${diaEMes(dia)}/${dia.slice(0, 4)}`;
}

/** A frase que o painel do grupo mostra; `null` com a cobrança em dia ou isenta. */
export function avisoDoPainel(s: SituacaoDaCobranca): { titulo: string; detalhe: string; suspenso: boolean } | null {
  if (s.estado === "pendente" && s.vencimento && s.suspendeEm) {
    return {
      titulo: `Mensalidade vencida em ${diaEMes(s.vencimento)}`,
      detalhe: `Os recursos pagos (IA, listas, artes e vídeos) param em ${diaEMes(s.suspendeEm)} se o pagamento não for registrado. O site e o painel continuam.`,
      suspenso: false,
    };
  }
  if (s.estado === "suspenso") {
    return {
      titulo: "Mensalidade em atraso",
      detalhe:
        "IA, listas, artes e vídeos estão pausados. O site e o painel continuam. Seus clientes não veem erro: você atende pelas conversas. Fale com a plataforma para regularizar.",
      suspenso: true,
    };
  }
  return null;
}

/** A mensagem de recusa de artes e vídeos para o grupo suspenso. */
export const MENSAGEM_DE_ARTES_PAUSADAS =
  "Pagamento da mensalidade pendente: geração de artes pausada. Fale com o gestor.";
export const MENSAGEM_DE_VIDEOS_PAUSADOS =
  "Pagamento da mensalidade pendente: geração de vídeos pausada. Fale com o gestor.";
