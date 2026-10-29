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
// - o grupo do teste grátis (29/10/2026, 0241) não paga até `teste_ate`; a
//   primeira competência vence no fim do teste e suspende NO MESMO DIA sem
//   pagamento (ver `situacaoDaCobranca`);
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

/** Quanto dura o teste grátis do assistente de contratação (29/10/2026). */
export const DIAS_DE_TESTE_GRATIS = 7;

export type EstadoDaCobranca = "isento" | "teste" | "em_dia" | "pendente" | "suspenso";

export type SituacaoDaCobranca = {
  estado: EstadoDaCobranca;
  /** A competência (`AAAA-MM-01`) MAIS ANTIGA vencida e não paga. */
  competenciaEmAberto: string | null;
  /** O vencimento (`AAAA-MM-DD`) dessa competência. */
  vencimento: string | null;
  /** Dias desde o vencimento; 0 no próprio dia. */
  diasDeAtraso: number;
  /** O dia (`AAAA-MM-DD`) em que a suspensão automática vale: vencimento + 5 (no fim do teste, o próprio vencimento). */
  suspendeEm: string | null;
  /** O vencimento da próxima competência que ainda não venceu. */
  proximoVencimento: string;
  /** O dia (`AAAA-MM-DD`, São Paulo) em que o teste grátis acaba; `null` = grupo sem teste. */
  fimDoTeste: string | null;
  /** Dias inteiros que faltam do teste (arredondados para cima); 0 fora do estado `teste`. */
  diasDeTesteRestantes: number;
  /** A competência em aberto é a do fim do teste (o teste acabou sem pagamento). */
  testeTerminouSemPagamento: boolean;
  /** TODAS as competências vencidas e não pagas, da mais antiga à mais nova (vazio no isento). */
  emAberto: { competencia: string; vencimento: string }[];
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

/**
 * O fim do teste grátis de quem começa agora: `agora` + 7 dias (o instante,
 * não o dia: o teste começado às 15h acaba às 15h do 7º dia).
 */
export function fimDoTesteGratis(agora: Date): Date {
  return new Date(agora.getTime() + DIAS_DE_TESTE_GRATIS * 86_400_000);
}

/**
 * O teste grátis (29/10/2026, regra do dono: "sem pagar em 7 dias, suspende
 * sozinha"):
 *
 * - enquanto `hoje < testeAte` (o INSTANTE) o estado é `teste`: nada vence;
 * - a primeira competência é o mês do fim do teste e vence NO dia do fim do
 *   teste (São Paulo), não no `dia_do_vencimento`;
 * - sem pagamento dela, a suspensão é IMEDIATA (sem os 5 dias de
 *   tolerância); as competências seguintes voltam à regra normal
 *   (`dia_do_vencimento`, suspensão no 5º dia).
 *
 * O plano `custo` ignora o teste (é isento de qualquer jeito), e a suspensão
 * manual vale por cima de tudo.
 */
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
  /** `grupos.teste_ate` (instante ISO); `null`/ausente = grupo sem teste grátis. */
  testeAte?: string | null;
}): SituacaoDaCobranca {
  const hoje = diaEmSP(p.hoje);
  const dia = diaDoVencimentoValido(p.diaDoVencimento);
  const pagas = new Set(p.competenciasPagas.map((c) => c.slice(0, 7)));
  const isento = p.plano === "custo";

  const instanteDoFim = p.testeAte ? new Date(p.testeAte) : null;
  const comTeste = !isento && instanteDoFim !== null && !Number.isNaN(instanteDoFim.getTime());
  const fimDoTeste = comTeste ? diaEmSP(instanteDoFim!) : null;

  if (comTeste && p.hoje.getTime() < instanteDoFim!.getTime()) {
    const restantes = Math.max(1, Math.ceil((instanteDoFim!.getTime() - p.hoje.getTime()) / 86_400_000));
    return {
      estado: p.suspensoManual ? "suspenso" : "teste",
      competenciaEmAberto: null,
      vencimento: null,
      diasDeAtraso: 0,
      suspendeEm: null,
      proximoVencimento: fimDoTeste!,
      fimDoTeste,
      diasDeTesteRestantes: p.suspensoManual ? 0 : restantes,
      testeTerminouSemPagamento: false,
      emAberto: [],
    };
  }

  // Cada competência, da primeira em diante, até achar a que ainda não venceu.
  const inicio = fimDoTeste ? `${fimDoTeste.slice(0, 7)}-01` : primeiraCompetencia(p.criadoEm);
  let ano = Number(inicio.slice(0, 4));
  let mes = Number(inicio.slice(5, 7));
  const abertas: { competencia: string; vencimento: string }[] = [];
  let proximoVencimento = "";
  // Trava contra data absurda (cadastro no futuro distante, relógio errado).
  for (let i = 0; i < 1200; i++) {
    const competencia = `${ano}-${dois(mes)}-01`;
    // A primeira competência do grupo com teste vence no fim do teste.
    const vencimento = i === 0 && fimDoTeste ? fimDoTeste : `${ano}-${dois(mes)}-${dois(dia)}`;
    if (vencimento > hoje) {
      proximoVencimento = vencimento;
      break;
    }
    if (!pagas.has(competencia.slice(0, 7))) abertas.push({ competencia, vencimento });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
  }
  if (!proximoVencimento) proximoVencimento = `${ano}-${dois(mes)}-${dois(dia)}`;

  // A Next Home não é cobrada: sem competência em aberto, sem prazo.
  const cobrado = isento ? null : (abertas[0] ?? null);
  const diasDeAtraso = cobrado ? Math.max(0, emDias(hoje) - emDias(cobrado.vencimento)) : 0;
  // A competência do fim do teste não tem tolerância.
  const testeTerminouSemPagamento = Boolean(cobrado && fimDoTeste && cobrado.competencia === inicio);
  const tolerancia = testeTerminouSemPagamento ? 0 : DIAS_ATE_SUSPENDER;

  let estado: EstadoDaCobranca;
  if (p.suspensoManual) estado = "suspenso";
  else if (isento) estado = "isento";
  else if (!cobrado) estado = "em_dia";
  else if (diasDeAtraso >= tolerancia) estado = "suspenso";
  else estado = "pendente";

  return {
    estado,
    competenciaEmAberto: cobrado?.competencia ?? null,
    vencimento: cobrado?.vencimento ?? null,
    diasDeAtraso,
    suspendeEm: cobrado ? somarDias(cobrado.vencimento, tolerancia) : null,
    proximoVencimento,
    fimDoTeste,
    diasDeTesteRestantes: 0,
    testeTerminouSemPagamento,
    emAberto: isento ? [] : abertas,
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

/** "1 dia restante" / "3 dias restantes". */
export function diasRestantesComoTexto(n: number): string {
  return n === 1 ? "1 dia restante" : `${n} dias restantes`;
}

/**
 * A frase que o painel do grupo mostra; `null` com a cobrança em dia ou
 * isenta. `teste` marca a faixa do teste grátis (o botão vira "Assinar agora").
 */
export function avisoDoPainel(
  s: SituacaoDaCobranca,
): { titulo: string; detalhe: string; suspenso: boolean; teste: boolean } | null {
  if (s.estado === "teste" && s.fimDoTeste) {
    return {
      titulo: `Teste grátis: ${diasRestantesComoTexto(s.diasDeTesteRestantes)}`,
      detalhe: `O teste acaba em ${diaEMes(s.fimDoTeste)}. Assine até lá para a IA, as listas, as artes e os vídeos continuarem funcionando sem pausa.`,
      suspenso: false,
      teste: true,
    };
  }
  if (s.estado === "pendente" && s.vencimento && s.suspendeEm) {
    return {
      titulo: `Mensalidade vencida em ${diaEMes(s.vencimento)}`,
      detalhe: `Os recursos pagos (IA, listas, artes e vídeos) param em ${diaEMes(s.suspendeEm)} se o pagamento não for registrado. O site e o painel continuam.`,
      suspenso: false,
      teste: false,
    };
  }
  if (s.estado === "suspenso" && s.testeTerminouSemPagamento) {
    return {
      titulo: "Seu teste grátis terminou",
      detalhe:
        "IA, listas, artes e vídeos estão pausados até a assinatura. O site e o painel continuam. Assine para voltar a usar tudo na hora.",
      suspenso: true,
      teste: true,
    };
  }
  if (s.estado === "suspenso") {
    return {
      titulo: "Mensalidade em atraso",
      detalhe:
        "IA, listas, artes e vídeos estão pausados. O site e o painel continuam. Seus clientes não veem erro: você atende pelas conversas. Fale com a plataforma para regularizar.",
      suspenso: true,
      teste: false,
    };
  }
  return null;
}

/** A mensagem de recusa de artes e vídeos para o grupo suspenso. */
export const MENSAGEM_DE_ARTES_PAUSADAS =
  "Pagamento da mensalidade pendente: geração de artes pausada. Fale com o gestor.";
export const MENSAGEM_DE_VIDEOS_PAUSADOS =
  "Pagamento da mensalidade pendente: geração de vídeos pausada. Fale com o gestor.";
