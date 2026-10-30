import { dataPelaOrdemNoMes } from "@/lib/whatsapp/pedidoDeAgendamento";
import { diaEmSaoPaulo, type Dia } from "./calendario";
import { lerInstante, partesEmSaoPaulo } from "./comandos/instante";

/**
 * O "quando" que a pessoa escreveu ao número central ("amanhã 10h", "sexta à
 * tarde", "05/11 das 14h às 16h", "último domingo do mês 9h") virado em
 * data e hora de São Paulo. Puro, sem IA.
 *
 * A agenda por WhatsApp de hoje (`comandos/interpretar.ts`) pede a mensagem
 * inteira a um modelo. No central quem lê a mensagem já é o cérebro: ele
 * entrega só o pedaço do "quando", e reconhecer dia e hora nesse pedaço é
 * trabalho de código (a mesma escolha de `pedidoDeAgendamento.ts`), sem uma
 * segunda chamada de IA a pagar.
 *
 * Não inventa: "sexta à tarde" sem hora volta como `periodo`, hora sem dia
 * como `sem_dia`, e "às 3" (3h ou 15h?) como `hora_ambigua`. Quem chama
 * decide se pergunta (visita, reunião) ou usa o período (bloqueio). A data
 * concreta vai no resumo que a pessoa confirma com "sim": é ali que um
 * "sexta" lido como a sexta errada aparece antes de gravar.
 *
 * Passado não é julgado aqui: "hoje 10h" às 15h volta como instante, e quem
 * chama recusa com a data na mão.
 */

export type Periodo = "manha" | "tarde" | "noite" | "dia_todo";

export type QuandoLido =
  /** `fim` só quando a pessoa disse ("das 14h às 16h", "agora até as 16h"). */
  | { tipo: "instante"; inicio: Date; fim: Date | null }
  | { tipo: "periodo"; dia: Dia; periodo: Periodo; inicio: Date; fim: Date }
  | { tipo: "so_dia"; dia: Dia }
  | { tipo: "sem_dia" }
  | { tipo: "hora_ambigua"; dia: Dia; hora: number }
  | { tipo: "nao_entendi" };

const NAO_ENTENDI: QuandoLido = { tipo: "nao_entendi" };

/** Fixo desde 2019 (sem horário de verão), a régua de `calendario.ts`. */
const DESLOCAMENTO_SP = "-03:00";

/*
 * As faixas de quem fala "de manhã", "à tarde", "à noite". Só o bloqueio as
 * usa como horário; visita e reunião perguntam a hora.
 */
const FAIXA_DO_PERIODO: Record<Periodo, [number, number]> = {
  manha: [8, 12],
  tarde: [13, 18],
  noite: [18, 22],
  dia_todo: [0, 24],
};

const SEMANA: Record<string, number> = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };

const MESES: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

/*
 * "05/11" dito em outubro é deste ano; "05/01" é do ano que vem. Até 60 dias
 * para trás é passado mesmo (digitou a data errada, ou pediu o que já foi), e
 * volta passado para quem chama recusar, em vez de virar o ano que vem.
 */
const DIAS_QUE_AINDA_SAO_PASSADO = 60;

/** Minúsculas, sem acento; mantém `/`, `:` e `-` de "05/11", "10:30" e "14h-16h". */
function simplificar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9/:-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** Dia que existe de verdade: 30/02 vira março no Date, e é recusado. */
function diaReal(ano: number, mes: number, dia: number): Dia | null {
  const d = new Date(Date.UTC(ano, mes - 1, dia, 12));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return d.toISOString().slice(0, 10);
}

function somarDias(dia: Dia, quantos: number): Dia {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + quantos);
  return d.toISOString().slice(0, 10);
}

function diaDaSemana(dia: Dia): number {
  return new Date(`${dia}T12:00:00Z`).getUTCDay();
}

/** O instante de São Paulo; 24h é a meia-noite do dia seguinte. */
function emSaoPaulo(dia: Dia, hora: number, minuto = 0): Date {
  if (hora >= 24) return new Date(`${somarDias(dia, 1)}T00:00:00${DESLOCAMENTO_SP}`);
  return new Date(`${dia}T${doisDigitos(hora)}:${doisDigitos(minuto)}:00${DESLOCAMENTO_SP}`);
}

function dataSemAno(mes: number, dia: number, hoje: Dia): Dia | null {
  const ano = Number(hoje.slice(0, 4));
  const esteAno = diaReal(ano, mes, dia);
  if (!esteAno || esteAno >= hoje) return esteAno;
  const atras = (Date.parse(hoje) - Date.parse(esteAno)) / 86_400_000;
  return atras <= DIAS_QUE_AINDA_SAO_PASSADO ? esteAno : diaReal(ano + 1, mes, dia);
}

/** `invalido`: a pessoa deu uma data que não existe ("31/02"), e não se troca por outra. */
type DiaLido = { dia: Dia } | { semana: number } | "invalido";

const DATA_COM_BARRA = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/;
const DIA_DO_MES = new RegExp(String.raw`\b(?:dia\s+)?(\d{1,2})\s+de\s+(${Object.keys(MESES).join("|")})\b`);
const DIA_SOLTO = /\bdia\s+(\d{1,2})\b/;
const DIA_DA_SEMANA = /\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira|\s+feira)?\b/;

/** O dia dito, e o texto sem ele (para "dia 5" e "05/11" não virarem hora). */
function lerDia(t: string, hoje: Dia, agora: Date): { lido: DiaLido | null; resto: string } {
  const ordem = dataPelaOrdemNoMes(t, agora);
  if (ordem) {
    const dia = diaReal(ordem.ano, ordem.mes, ordem.dia);
    return { lido: dia ? { dia } : "invalido", resto: t };
  }
  const tirar = (m: RegExpExecArray) => t.slice(0, m.index) + " " + t.slice(m.index + m[0].length);

  const barra = DATA_COM_BARRA.exec(t);
  if (barra) {
    const [dia, mes] = [Number(barra[1]), Number(barra[2])];
    const ano = barra[3] ? Number(barra[3].length === 2 ? `20${barra[3]}` : barra[3]) : null;
    const lido = ano ? diaReal(ano, mes, dia) : dataSemAno(mes, dia, hoje);
    return { lido: lido ? { dia: lido } : "invalido", resto: tirar(barra) };
  }
  const doMes = DIA_DO_MES.exec(t);
  if (doMes) {
    const lido = dataSemAno(MESES[doMes[2]], Number(doMes[1]), hoje);
    return { lido: lido ? { dia: lido } : "invalido", resto: tirar(doMes) };
  }
  const solto = DIA_SOLTO.exec(t);
  if (solto) {
    // "dia 5" dito no dia 30 é o do mês que vem; no dia 3, o deste mês.
    const n = Number(solto[1]);
    const [ano, mes, diaDeHoje] = hoje.split("-").map(Number);
    const lido = n >= diaDeHoje ? diaReal(ano, mes, n) : mes === 12 ? diaReal(ano + 1, 1, n) : diaReal(ano, mes + 1, n);
    return { lido: lido ? { dia: lido } : "invalido", resto: tirar(solto) };
  }
  if (/\bdepois de amanha\b/.test(t)) return { lido: { dia: somarDias(hoje, 2) }, resto: t };
  if (/\bamanha\b/.test(t)) return { lido: { dia: somarDias(hoje, 1) }, resto: t };
  if (/\bhoje\b/.test(t)) return { lido: { dia: hoje }, resto: t };
  const semana = DIA_DA_SEMANA.exec(t);
  if (semana) return { lido: { semana: SEMANA[semana[1]] }, resto: tirar(semana) };
  return { lido: null, resto: t };
}

type Hora = { h: number; m: number; ambigua: boolean };

/*
 * A hora: "10h", "10h30", "10:30", "10 horas", "às 10", "3 da tarde",
 * "meio-dia". Número solto ("10") só vale depois de "às"/"das": sem isso,
 * "2 quartos" viraria compromisso às 2h.
 */
const NUMERO = String.raw`(\d{1,2})(?:(?::|h)(\d{2}))?\s*(h|hs|hrs|horas?)?`;
const QUALIFICADOR = String.raw`(?:\s*da\s+(manha|tarde|noite|madrugada))?`;
const INTERVALO = new RegExp(
  String.raw`\b(das?\s+|de\s+)?${NUMERO}${QUALIFICADOR}\s*(?:as|a|ate|-)\s*(?:as\s+)?${NUMERO}${QUALIFICADOR}(?![\d/])`,
);
const COM_MARCA = new RegExp(String.raw`\b(\d{1,2})(?::(\d{2})|h(\d{2})?\b|\s*(?:hs|hrs|horas?)\b)${QUALIFICADOR}`);
const DEPOIS_DE_AS = new RegExp(String.raw`\b(?:as|das?|a partir das?)\s+(\d{1,2})(?![\d/:])${QUALIFICADOR}`);
const COM_QUALIFICADOR = /\b(\d{1,2})\s+da\s+(manha|tarde|noite|madrugada)\b/;
const SO_O_FIM = new RegExp(String.raw`\bate\s+(?:as\s+)?${NUMERO}${QUALIFICADOR}`);

function hora(hTexto: string, mTexto: string | undefined, qualificador: string | undefined): Hora | null {
  let h = Number(hTexto);
  const m = mTexto ? Number(mTexto) : 0;
  if (h > 23 || m > 59) return null;
  if ((qualificador === "tarde" || qualificador === "noite") && h < 12) h += 12;
  // "às 3" é 3h ou 15h? Ninguém marca visita de madrugada, mas também não se adivinha.
  return { h, m, ambigua: !qualificador && h >= 1 && h <= 6 };
}

function lerHoras(t: string): { inicio: Hora | null; fim: Hora | null } {
  const iv = INTERVALO.exec(t);
  // Intervalo só com "das"/"de" na frente, ou com "h"/":" em algum lado: "5 a 10" solto não é horário.
  if (iv && (iv[1] || iv[3] || iv[4] || iv[7] || iv[8])) {
    const qualificadorDoFim = iv[9];
    const inicio = hora(iv[2], iv[3], iv[5] ?? qualificadorDoFim);
    let fim = hora(iv[6], iv[7], qualificadorDoFim);
    // "das 10 às 2": o fim é 14h.
    if (inicio && fim && fim.h * 60 + fim.m <= inicio.h * 60 + inicio.m && fim.h < 12) fim = { ...fim, h: fim.h + 12, ambigua: false };
    if (inicio && fim) return { inicio, fim: { ...fim, ambigua: false } };
  }
  if (/\bmeio\s*-?\s*dia\b/.test(t)) return { inicio: { h: 12, m: 0, ambigua: false }, fim: null };
  const marcada = COM_MARCA.exec(t);
  if (marcada) return { inicio: hora(marcada[1], marcada[2] ?? marcada[3], marcada[4]), fim: null };
  const qualificada = COM_QUALIFICADOR.exec(t);
  if (qualificada) return { inicio: hora(qualificada[1], undefined, qualificada[2]), fim: null };
  const depoisDeAs = DEPOIS_DE_AS.exec(t);
  if (depoisDeAs) return { inicio: hora(depoisDeAs[1], undefined, depoisDeAs[2]), fim: null };
  const soFim = SO_O_FIM.exec(t);
  if (soFim) return { inicio: null, fim: hora(soFim[1], soFim[2], soFim[4]) };
  return { inicio: null, fim: null };
}

function lerPeriodo(t: string): Periodo | null {
  if (/\b(dia todo|dia inteiro|todo o dia)\b/.test(t)) return "dia_todo";
  if (/\bmanha\b/.test(t)) return "manha";
  if (/\btarde\b/.test(t)) return "tarde";
  if (/\bnoite\b/.test(t)) return "noite";
  return null;
}

function limitesDoPeriodo(dia: Dia, periodo: Periodo): { inicio: Date; fim: Date } {
  const [de, ate] = FAIXA_DO_PERIODO[periodo];
  return { inicio: emSaoPaulo(dia, de), fim: emSaoPaulo(dia, ate) };
}

export function lerQuando(texto: string, agora: Date): QuandoLido {
  const iso = lerInstante(texto);
  if (iso) return { tipo: "instante", inicio: iso, fim: null };
  // ISO sem fuso ("2026-11-07T10:00"): a hora é a de São Paulo, nunca a do servidor.
  const semFuso = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(String(texto ?? "").trim());
  if (semFuso) {
    const dia = diaReal(...(semFuso[1].split("-").map(Number) as [number, number, number]));
    const h = Number(semFuso[2]);
    const m = Number(semFuso[3]);
    return dia && h < 24 && m < 60 ? { tipo: "instante", inicio: emSaoPaulo(dia, h, m), fim: null } : NAO_ENTENDI;
  }
  const t = simplificar(String(texto ?? ""));
  if (!t) return NAO_ENTENDI;

  const hoje = diaEmSaoPaulo(agora);
  const { lido, resto } = lerDia(t, hoje, agora);
  if (lido === "invalido") return NAO_ENTENDI;
  const horas = lerHoras(resto);
  const periodo = lerPeriodo(resto);

  // "agora até as 16h", "a partir de agora": começa no minuto de agora.
  if (/\bagora\b/.test(resto)) {
    const inicio = new Date(Math.floor(agora.getTime() / 60_000) * 60_000);
    const ate = horas.fim ?? horas.inicio;
    if (!ate) return { tipo: "instante", inicio, fim: null };
    const fim = emSaoPaulo(lido && "dia" in lido ? lido.dia : hoje, ate.h, ate.m);
    return fim > inicio ? { tipo: "instante", inicio, fim } : NAO_ENTENDI;
  }

  if (!lido) return horas.inicio || periodo ? { tipo: "sem_dia" } : NAO_ENTENDI;

  let dia: Dia;
  if ("dia" in lido) {
    dia = lido.dia;
  } else {
    // A PRÓXIMA ocorrência: hoje só se o horário (ou o período) ainda não passou.
    dia = somarDias(hoje, (lido.semana - diaDaSemana(hoje) + 7) % 7);
    if (dia === hoje) {
      const acabaEm = horas.inicio
        ? emSaoPaulo(dia, horas.inicio.h, horas.inicio.m)
        : periodo
          ? limitesDoPeriodo(dia, periodo).fim
          : null;
      if (acabaEm && acabaEm <= agora) dia = somarDias(hoje, 7);
    }
  }

  if (horas.inicio) {
    if (horas.inicio.ambigua) return { tipo: "hora_ambigua", dia, hora: horas.inicio.h };
    const inicio = emSaoPaulo(dia, horas.inicio.h, horas.inicio.m);
    const fim = horas.fim ? emSaoPaulo(dia, horas.fim.h, horas.fim.m) : null;
    if (fim && fim <= inicio) return NAO_ENTENDI;
    return { tipo: "instante", inicio, fim };
  }
  // "sexta até as 12h", sem começo: não se inventa o começo.
  if (horas.fim) return NAO_ENTENDI;
  if (periodo) return { tipo: "periodo", dia, periodo, ...limitesDoPeriodo(dia, periodo) };
  return { tipo: "so_dia", dia };
}

/** O dia inteiro de São Paulo, da meia-noite à meia-noite. */
export function diaInteiro(dia: Dia): { inicio: Date; fim: Date } {
  return limitesDoPeriodo(dia, "dia_todo");
}

// ── Como o resumo fala ("sábado 31/10 às 10h") ─────────────────────────────

const NOME_DO_DIA: Record<string, string> = {
  Sun: "domingo",
  Mon: "segunda",
  Tue: "terça",
  Wed: "quarta",
  Thu: "quinta",
  Fri: "sexta",
  Sat: "sábado",
};

const ROTULO_DO_PERIODO: Record<Periodo, string> = {
  manha: "de manhã",
  tarde: "à tarde",
  noite: "à noite",
  dia_todo: "o dia todo",
};

/** "sábado 31/10". */
export function rotuloDoDia(instante: Date): string {
  const p = partesEmSaoPaulo(instante);
  return `${NOME_DO_DIA[p.semana] ?? ""} ${p.dia}/${p.mes}`;
}

/** "sábado 31/10" a partir de `"2026-10-31"`. */
export function rotuloDoDiaDoCalendario(dia: Dia): string {
  return rotuloDoDia(emSaoPaulo(dia, 12));
}

/** "10h", "10h30". */
export function rotuloDaHora(instante: Date): string {
  const p = partesEmSaoPaulo(instante);
  return p.minuto === "00" ? `${p.hora}h` : `${p.hora}h${p.minuto}`;
}

/** "sábado 31/10 às 10h". */
export function rotuloDoInstante(instante: Date): string {
  return `${rotuloDoDia(instante)} às ${rotuloDaHora(instante)}`;
}

/** "sexta à tarde", para a pergunta da hora. */
export function rotuloDoPeriodo(dia: Dia, periodo: Periodo): string {
  return `${rotuloDoDiaDoCalendario(dia)} ${ROTULO_DO_PERIODO[periodo]}`;
}

/** "sexta 06/11 das 13h às 18h", "sexta 06/11, o dia todo", ou "de … até …" quando vira o dia. */
export function rotuloDoIntervalo(inicio: Date, fim: Date): string {
  const dia = diaEmSaoPaulo(inicio);
  const inteiro = diaInteiro(dia);
  if (inicio.getTime() === inteiro.inicio.getTime() && fim.getTime() === inteiro.fim.getTime()) {
    return `${rotuloDoDia(inicio)}, o dia todo`;
  }
  if (diaEmSaoPaulo(fim) === dia) return `${rotuloDoDia(inicio)} das ${rotuloDaHora(inicio)} às ${rotuloDaHora(fim)}`;
  return `de ${rotuloDoInstante(inicio)} até ${rotuloDoInstante(fim)}`;
}
