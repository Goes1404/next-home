// O que o número central responde no grupo do corretor (spec 6.2 e 6.3).
//
// Puro e curto: é lido no celular, no meio do dia, entre uma ligação e outra.
// Só entra o que o relato trouxe; nada de palavra técnica do sistema.

import { ETAPA_LABEL, type EtapaFunil } from "@/lib/types";
import type { LeituraDoRetorno } from "./leituraDoRetorno";

const SEPARADOR = " · ";
const FUSO = "America/Sao_Paulo";

export const TEXTO_AUDIO_NAO_ENTENDIDO = "Não consegui entender o áudio, pode mandar de novo?";

export const TEXTO_SEM_LEAD_AGUARDANDO =
  "Não achei cliente aguardando retorno. Responda em cima do aviso do cliente para eu anotar.";

export const TEXTO_CLIENTE_NAO_ENCONTRADO = "Não achei esse cliente no CRM.";

/** Erro inesperado antes de anotar qualquer coisa: o relato não se perde calado. */
export const TEXTO_NAO_CONSEGUI_ANOTAR = "Não consegui anotar este retorno agora, pode mandar de novo?";

/** Erro depois de anotar a ligação: não pede para mandar de novo (duplicaria). */
export function TEXTO_ANOTEI_EM_PARTE(nome: string): string {
  return `📝 ${nome} · anotei a ligação, mas não consegui atualizar o resto. Confira a ficha.`;
}

export function TEXTO_SEM_LEITURA(nome: string): string {
  return `📝 ${nome} · anotado na ficha, sem leitura automática`;
}

/**
 * O corretor respondeu em cima do aviso ou da confirmação, mas a mensagem não
 * conta a ligação ("ok", "👍"). Ele estava falando deste cliente: pergunta.
 */
export function TEXTO_NAO_ENTENDI_A_LIGACAO(nome: string): string {
  return `Não entendi como foi a ligação com ${nome}. Pode contar de novo?`;
}

export function TEXTO_NAO_E_MAIS_SEU(nome: string): string {
  return `${nome} agora está com outro corretor, então não anotei este retorno.`;
}

export function textoDaPergunta(nomes: string[]): string {
  const lista = nomes.map((nome, i) => `${i + 1}) ${nome}`).join(" ");
  return `Esse retorno é sobre: ${lista}? Responda em cima desta mensagem com o número.`;
}

function numeroCurto(valor: number): string {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(valor);
}

/** "R$ 600 mil", "R$ 1,2 milhão", "R$ 2 milhões": como o corretor fala. */
export function dinheiro(valor: number): string {
  if (valor >= 1_000_000) {
    const milhoes = Math.round((valor / 1_000_000) * 10) / 10;
    return `R$ ${numeroCurto(milhoes)} ${milhoes < 2 ? "milhão" : "milhões"}`;
  }
  if (valor >= 1_000) return `R$ ${numeroCurto(Math.round(valor / 100) / 10)} mil`;
  return `R$ ${numeroCurto(valor)}`;
}

/**
 * "sáb 01/11 10h" (minutos só quando não são 00: "10h30"), sempre no fuso de
 * São Paulo: o servidor roda em UTC e, depois das 21h, o dia lá já virou.
 */
export function dataDaVisita(iso: string): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  const dia = p("weekday").replace(".", "").toLowerCase();
  const hora = String(Number(p("hour")));
  const minuto = p("minute");
  return `${dia} ${p("day")}/${p("month")} ${hora}h${minuto === "00" ? "" : minuto}`;
}

function orcamento(min: number | null | undefined, max: number | null | undefined): string | null {
  if (min && max && min !== max) return `${dinheiro(min)} a ${dinheiro(max)}`;
  if (max) return `até ${dinheiro(max)}`;
  if (min) return `a partir de ${dinheiro(min)}`;
  return null;
}

const FORMA_DE_PAGAMENTO: Record<string, string> = {
  a_vista: "à vista",
  financiamento: "financiamento",
  permuta: "permuta",
  misto: "pagamento misto",
};

/** As exigências chegam em snake_case (`usa_fgts`); as conhecidas ganham o nome que o corretor usa. */
const EXIGENCIA: Record<string, string> = {
  usa_fgts: "FGTS",
  fgts: "FGTS",
};

function exigencia(chave: string): string {
  return EXIGENCIA[chave] ?? chave.replace(/_/g, " ");
}

/** Os fatos que o relato trouxe, na ordem em que o corretor confere. */
function fatosDoRelato(leitura: LeituraDoRetorno): string[] {
  const f = leitura.fatos;
  const itens: string[] = [];
  if (f.dormitoriosMin) itens.push(`${f.dormitoriosMin} ${f.dormitoriosMin === 1 ? "quarto" : "quartos"}`);
  const faixa = orcamento(f.orcamentoMin, f.orcamentoMax);
  if (faixa) itens.push(faixa);
  if (f.regiaoInteresse) itens.push(f.regiaoInteresse);
  if (f.formaPagamento) itens.push(FORMA_DE_PAGAMENTO[f.formaPagamento] ?? f.formaPagamento);
  for (const e of f.exigenciasEspecificas ?? []) {
    const texto = exigencia(e);
    if (!itens.includes(texto)) itens.push(texto);
  }
  return itens;
}

function ordinal(n: number): string {
  return `${n}ª tentativa`;
}

/** O que mudou na ficha além do que a leitura já diz: o corretor confere tudo que foi gravado. */
export type MudancasNaFicha = {
  /** Etapa em que o lead ficou, quando mudou. */
  etapaNova?: EtapaFunil | null;
  /** A correção tirou a visita que o retorno anterior tinha posto. */
  visitaDesmarcada?: boolean;
  /** A correção devolveu a visita que havia antes (ISO). */
  visitaRestaurada?: string | null;
  /** O relato falou de visita e ela não foi para a ficha (data recusada ou horário ocupado). */
  visitaNaoAnotada?: boolean;
  /** O relato disse perdido, mas sem motivo: o lead não foi marcado. */
  perdaSemMotivo?: boolean;
};

/** O que o relato pediu e não entrou na ficha: vai por último, como pergunta ao corretor. */
function pendencias(m: MudancasNaFicha | undefined): string[] {
  const itens: string[] = [];
  if (m?.visitaNaoAnotada) itens.push("visita não anotada: mande dia e hora");
  if (m?.perdaSemMotivo) itens.push("não marquei como perdido: qual o motivo?");
  return itens;
}

function mudancasExtras(leitura: LeituraDoRetorno, m: MudancasNaFicha | undefined): string[] {
  const itens: string[] = [];
  if (m?.visitaDesmarcada) itens.push("visita desmarcada");
  if (m?.visitaRestaurada) itens.push(`visita volta para ${dataDaVisita(m.visitaRestaurada)}`);
  const etapa = m?.etapaNova;
  // Perdido e visita marcada já aparecem pelo motivo e pela data.
  const jaDito = etapa === "perdido" || (etapa === "visita_agendada" && leitura.visitaEm !== null);
  if (etapa && !jaDito) itens.push(`→ ${ETAPA_LABEL[etapa] ?? etapa}`);
  return itens;
}

/**
 * A confirmação do que foi anotado. `tentativa` é o número desta tentativa
 * sem resposta (0 quando não há aviso para contar). `mudancas` traz o que a
 * ficha mudou de fato (etapa, visita desmarcada): nada gravado fica sem aviso.
 */
export function textoDaConfirmacao(p: {
  nome: string;
  leitura: LeituraDoRetorno;
  tentativa: number;
  mudancas?: MudancasNaFicha;
}): string {
  const { nome, leitura } = p;
  const extras = mudancasExtras(leitura, p.mudancas);

  if (leitura.resultado === "nao_atendeu") {
    const tentativa = p.tentativa >= 1 ? ` (${ordinal(p.tentativa)})` : "";
    return [`📞 ${nome}`, `não atendeu${tentativa}`, ...extras].join(SEPARADOR);
  }
  if (leitura.resultado === "numero_errado") return [`❌ ${nome}`, "número errado", ...extras].join(SEPARADOR);

  const partes: string[] = [];
  let icone = "✅";
  if (leitura.etapa === "perdido") {
    icone = "🚫";
    partes.push(leitura.motivoPerda ? `perdido: ${leitura.motivoPerda}` : "perdido");
  } else if (leitura.visitaEm) {
    partes.push(`visita agendada ${dataDaVisita(leitura.visitaEm)}`);
  } else if (leitura.resultado === "pediu_retorno") {
    icone = "🕐";
    partes.push("pediu para ligar depois");
  }

  partes.push(...extras, ...fatosDoRelato(leitura));
  if (partes.length === 0) partes.push("atendeu");
  return [`${icone} ${nome}`, ...partes, ...pendencias(p.mudancas)].join(SEPARADOR);
}
