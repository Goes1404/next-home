/**
 * O resumo do dia que chega no WhatsApp do próprio corretor (26/09/2026).
 *
 * ## Por que WhatsApp, e por que de manhã
 *
 * Medido em 02/09: o trabalho acontece no WhatsApp (544 respostas dela
 * numa semana) e o painel quase não é aberto. E-mail foi tentado e
 * desligado — não se mostrou canal. O painel esperar ser aberto perde para
 * o aplicativo que já está na mão; aqui ele vai até o corretor, às 8h, com
 * um link por item.
 *
 * ## As réguas que ele herda
 *
 * - **Silêncio quando não há notícia.** Não existe "hoje: nada". Resumo que
 *   chega todo dia vazio ensina a não abrir o que chega cheio — a régua do
 *   `evolucaoConversa` e do aviso de espera.
 * - **Teto por seção.** Lista longa não é lida; o resto vira "e mais N".
 * - **Fuso de São Paulo.** O dia e a hora saem de `Intl` com `timeZone`,
 *   nunca de `getHours()` — o servidor roda em UTC, e às 21h de Brasília lá
 *   já é amanhã (quinta vez que isso apareceria neste projeto).
 */

export const HORA_DO_RESUMO = 8;
/** Depois disso o resumo do dia não sai mais: às 15h ele é notícia velha. */
export const HORA_LIMITE_DO_RESUMO = 12;
export const MAXIMO_POR_SECAO = 5;

const fmtDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const fmtHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** O dia em São Paulo, `AAAA-MM-DD` — o formato da coluna `date`. */
export function diaEmSP(data: Date): string {
  return fmtDia.format(data);
}

export function horaEmSP(data: Date): number {
  return Number(fmtHora.format(data).slice(0, 2));
}

/** "09:30" em São Paulo. */
export function horarioEmSP(iso: string): string {
  return fmtHora.format(new Date(iso));
}

const fmtDiaDaSemana = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" });

/** Sábado ou domingo em São Paulo. */
export function fimDeSemanaEmSP(data: Date): boolean {
  const d = fmtDiaDaSemana.format(data);
  return d === "Sat" || d === "Sun";
}

/** Segunda-feira em São Paulo: o dia da lista semanal de quem vale retomar. */
export function segundaEmSP(data: Date): boolean {
  return fmtDiaDaSemana.format(data) === "Mon";
}

/**
 * Entre a hora escolhida pelo corretor e meio-dia de São Paulo, e ainda não
 * enviado hoje. Hora e fim de semana vêm de `corretores` (0121): um
 * corretor começa às 7h, outro às 10h, e resumo no sábado é escolha, não
 * padrão.
 */
export function horaDeMandarResumo(
  agora: Date,
  ultimoEnvio: string | null,
  prefs: { hora?: number | null; fimDeSemana?: boolean | null } = {},
): boolean {
  const inicio = Math.min(Math.max(prefs.hora ?? HORA_DO_RESUMO, 6), 11);
  const hora = horaEmSP(agora);
  if (hora < inicio || hora >= HORA_LIMITE_DO_RESUMO) return false;
  if (!prefs.fimDeSemana && fimDeSemanaEmSP(agora)) return false;
  return ultimoEnvio !== diaEmSP(agora);
}

export type ItemDoResumo = { titulo: string; detalhe?: string; link: string };

export type EntradaDoResumo = {
  nomeCorretor: string;
  visitas: ItemDoResumo[];
  esperando: ItemDoResumo[];
  novos: ItemDoResumo[];
  lembretes: ItemDoResumo[];
  /**
   * Visitas que já receberam o pós-visita e o cliente não respondeu (0121):
   * o corretor registra o desfecho na ficha, senão a visita some do radar.
   */
  semRetorno?: ItemDoResumo[];
  /** Imóvel publicado nas últimas 24h com leads da carteira que combinam. */
  imoveisNovos?: ItemDoResumo[];
  /** Segunda-feira: leads parados há 30+ dias que ainda valem uma mensagem. */
  valeRetomar?: ItemDoResumo[];
  /** O que aconteceu ontem. Informa, mas sozinho não justifica mensagem. */
  ontem?: { clientesQueEscreveram: number; visitasMarcadas: number } | null;
};

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** "Ontem: 3 clientes escreveram · 1 visita marcada", ou nada. */
export function linhaDeOntem(o: EntradaDoResumo["ontem"]): string | null {
  if (!o) return null;
  const partes = [
    o.clientesQueEscreveram > 0 ? plural(o.clientesQueEscreveram, "cliente escreveu", "clientes escreveram") : null,
    o.visitasMarcadas > 0 ? plural(o.visitasMarcadas, "visita marcada", "visitas marcadas") : null,
  ].filter(Boolean);
  return partes.length > 0 ? `Ontem: ${partes.join(" · ")}` : null;
}

function secao(rotulo: string, itens: ItemDoResumo[]): string[] {
  if (itens.length === 0) return [];
  const mostrar = itens.slice(0, MAXIMO_POR_SECAO);
  const linhas = [`*${rotulo} (${itens.length})*`];
  for (const i of mostrar) {
    linhas.push(`• ${i.titulo}${i.detalhe ? ` — ${i.detalhe}` : ""}`);
    linhas.push(`  ${i.link}`);
  }
  const sobra = itens.length - mostrar.length;
  if (sobra > 0) linhas.push(`  e mais ${sobra}`);
  linhas.push("");
  return linhas;
}

/** O texto do resumo, ou `null` quando não há nada a dizer. */
export function montarResumoDoDia(e: EntradaDoResumo, urlPainel: string): string | null {
  const semRetorno = e.semRetorno ?? [];
  const imoveisNovos = e.imoveisNovos ?? [];
  const valeRetomar = e.valeRetomar ?? [];
  const total =
    e.visitas.length +
    e.esperando.length +
    e.novos.length +
    e.lembretes.length +
    semRetorno.length +
    imoveisNovos.length +
    valeRetomar.length;
  if (total === 0) return null;

  const primeiroNome = e.nomeCorretor.trim().split(/\s+/)[0] || "";
  const ontem = linhaDeOntem(e.ontem);
  return [
    `Bom dia${primeiroNome ? `, ${primeiroNome}` : ""}! Seu dia:`,
    "",
    ...(ontem ? [ontem, ""] : []),
    ...secao("Visitas de hoje", e.visitas),
    ...secao("Esperando sua resposta", e.esperando),
    ...secao("Leads novos (24h)", e.novos),
    ...secao("Lembretes de hoje", e.lembretes),
    ...secao("Visitas sem retorno do cliente", semRetorno),
    ...secao("Imóvel novo que combina com sua carteira", imoveisNovos),
    ...secao("Vale retomar esta semana", valeRetomar),
    `Painel: ${urlPainel}/corretor`,
  ].join("\n");
}
