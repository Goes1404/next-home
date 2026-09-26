/**
 * Feed de calendário das visitas (26/09/2026). O corretor assina a URL no
 * Google Agenda ou no iPhone e as visitas — inclusive as que a assistente
 * marcou — aparecem sozinhas, sem abrir o painel.
 *
 * Módulo puro (RFC 5545). Duas regras que custam caro se esquecidas: linha
 * com mais de 75 octetos é DOBRADA (CRLF + espaço), e texto escapa `\`, `;`,
 * `,` e quebra de linha. Calendário que recebe um `;` cru corta o evento ali.
 */

export type VisitaDoFeed = {
  leadId: string;
  nome: string;
  telefone: string | null;
  inicio: string;
  imovel: string | null;
  endereco: string | null;
  confirmada: boolean;
  linkFicha: string;
};

/** Duração presumida: a visita não tem hora de fim cadastrada. */
export const DURACAO_VISITA_MIN = 60;

export function escaparTexto(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Dobra em 75 OCTETOS (não caracteres): acento em UTF-8 ocupa dois. */
export function dobrarLinha(linha: string): string {
  const bytes = new TextEncoder();
  const partes: string[] = [];
  let atual = "";
  let tamanho = 0;
  for (const ch of linha) {
    const n = bytes.encode(ch).length;
    const limite = partes.length === 0 ? 75 : 74;
    if (tamanho + n > limite) {
      partes.push(atual);
      atual = "";
      tamanho = 0;
    }
    atual += ch;
    tamanho += n;
  }
  partes.push(atual);
  return partes.join("\r\n ");
}

function dataUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function montarIcs(visitas: VisitaDoFeed[], opcoes: { nomeCalendario: string; dominio: string; agora?: Date }): string {
  const agora = opcoes.agora ?? new Date();
  const linhas: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${escaparTexto(opcoes.nomeCalendario)}//Visitas//PT`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escaparTexto(opcoes.nomeCalendario)}`,
    "X-WR-TIMEZONE:America/Sao_Paulo",
    // Pede ao aplicativo que volte a buscar a cada hora; Google ignora, iPhone respeita.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  for (const v of visitas) {
    const inicio = new Date(v.inicio);
    if (Number.isNaN(inicio.getTime())) continue;
    const fim = new Date(inicio.getTime() + DURACAO_VISITA_MIN * 60_000);
    const titulo = `Visita: ${v.nome}${v.imovel ? ` · ${v.imovel}` : ""}`;
    const descricao = [
      v.confirmada ? "Confirmada pelo cliente." : "Ainda não confirmada pelo cliente.",
      v.telefone ? `Telefone: ${v.telefone}` : null,
      `Ficha: ${v.linkFicha}`,
    ]
      .filter(Boolean)
      .join("\n");
    linhas.push(
      "BEGIN:VEVENT",
      `UID:visita-${v.leadId}@${opcoes.dominio}`,
      `DTSTAMP:${dataUtc(agora)}`,
      `DTSTART:${dataUtc(inicio)}`,
      `DTEND:${dataUtc(fim)}`,
      `SUMMARY:${escaparTexto(titulo)}`,
      `DESCRIPTION:${escaparTexto(descricao)}`,
      ...(v.endereco ? [`LOCATION:${escaparTexto(v.endereco)}`] : []),
      `URL:${v.linkFicha}`,
      `STATUS:${v.confirmada ? "CONFIRMED" : "TENTATIVE"}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "TRIGGER:-PT1H",
      `DESCRIPTION:${escaparTexto(titulo)}`,
      "END:VALARM",
      "END:VEVENT",
    );
  }
  linhas.push("END:VCALENDAR");
  return linhas.map(dobrarLinha).join("\r\n") + "\r\n";
}

export function ehToken(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
