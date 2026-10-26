// O que o número central responde no grupo do corretor (spec 6.2 e 6.3).
//
// Puro e curto: é lido no celular, no meio do dia, entre uma ligação e outra.
// Só entra o que o relato trouxe; nada de palavra técnica do sistema.

import type { LeituraDoRetorno } from "./leituraDoRetorno";

const SEPARADOR = " · ";
const FUSO = "America/Sao_Paulo";

export const TEXTO_AUDIO_NAO_ENTENDIDO = "Não consegui entender o áudio, pode mandar de novo?";

export const TEXTO_SEM_LEAD_AGUARDANDO =
  "Não achei cliente aguardando retorno. Responda em cima do aviso do cliente para eu anotar.";

export function TEXTO_SEM_LEITURA(nome: string): string {
  return `📝 ${nome} · anotado na ficha, sem leitura automática`;
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

/**
 * A confirmação do que foi anotado. `tentativa` é o número desta tentativa
 * sem resposta (0 quando não há aviso para contar).
 */
export function textoDaConfirmacao(p: { nome: string; leitura: LeituraDoRetorno; tentativa: number }): string {
  const { nome, leitura } = p;

  if (leitura.resultado === "nao_atendeu") {
    return `📞 ${nome}${SEPARADOR}não atendeu${p.tentativa >= 1 ? ` (${ordinal(p.tentativa)})` : ""}`;
  }
  if (leitura.resultado === "numero_errado") return `❌ ${nome}${SEPARADOR}número errado`;

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

  partes.push(...fatosDoRelato(leitura));
  if (partes.length === 0) partes.push("atendeu");
  return [`${icone} ${nome}`, ...partes].join(SEPARADOR);
}
