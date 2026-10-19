/**
 * Cliente sem resposta: o aviso que chega no WhatsApp do corretor (06/10/2026).
 *
 * Desde 03/10 a fala do corretor DESLIGA a IA na conversa (0152). Isso tirou
 * da IA as conversas que o corretor assumiu, e deixou um buraco: se ele
 * assume e depois esquece, o cliente escreve e ninguém responde. A fila do
 * Início mostra ("a IA está desligada nesta conversa, é com você"), mas só
 * para quem abre o painel, e o trabalho do corretor acontece no WhatsApp.
 *
 * Por isso o aviso vai ATRÁS dele, pelo mesmo caminho do resumo do dia
 * (`avisarCorretor`): da instância dele para o WhatsApp dele.
 *
 * As réguas, e por que cada uma:
 * - **30 minutos** sem resposta. Com a IA ligada a resposta sai em segundos;
 *   meia hora sem nada quer dizer que ninguém vai responder (IA desligada,
 *   fora do expediente dela, ou falha). É a mesma régua do lead de portal
 *   sem contato.
 * - **Uma vez por espera.** Cliente que manda três mensagens seguidas não
 *   gera três avisos: a espera começa na primeira fala dele depois da
 *   última resposta nossa, e o aviso só volta depois que alguém responder.
 *   Aviso que chega o tempo todo deixa de ser lido.
 * - **Só espera de até 24 horas.** Mais velho que isso não é notícia de
 *   agora; fica na fila do Início e no resumo do dia.
 * - **Das 7h às 21h59 de São Paulo.** É o celular pessoal do corretor. Quem
 *   escreveu de madrugada aparece no aviso da manhã, se ainda estiver
 *   dentro das 24 horas.
 *
 * Módulo puro: quem lê o banco e envia é `alertaSemResposta.ts`.
 */

export const MINUTOS_SEM_RESPOSTA = 30;
export const HORAS_LIMITE_DO_AVISO = 24;
export const HORA_INICIO_AVISO = 7;
export const HORA_FIM_AVISO = 22;
export const MAXIMO_NO_AVISO = 6;

/** A hora em São Paulo. Em UTC, às 22h de Brasília já seria o dia seguinte. */
export function horaEmSaoPaulo(agora: Date): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hourCycle: "h23",
  }).format(agora);
  return Number(h) % 24;
}

export function dentroDoHorarioDeAviso(agora: Date): boolean {
  const h = horaEmSaoPaulo(agora);
  return h >= HORA_INICIO_AVISO && h < HORA_FIM_AVISO;
}

/**
 * Esta espera merece aviso agora?
 *
 * `inicioDaEspera` é a primeira fala do cliente depois da última resposta
 * nossa (IA ou corretor). `avisadoEm` é o último aviso desta conversa; ele
 * só vale para a espera atual se for posterior à última resposta nossa.
 */
export function precisaAvisar(p: {
  inicioDaEspera: string | Date;
  ultimaRespostaNossa: string | Date | null;
  avisadoEm: string | Date | null;
  agora: Date;
}): { avisar: boolean; minutos: number } {
  const inicio = new Date(p.inicioDaEspera).getTime();
  const minutos = Math.floor((p.agora.getTime() - inicio) / 60_000);
  if (!Number.isFinite(minutos)) return { avisar: false, minutos: 0 };
  if (minutos < MINUTOS_SEM_RESPOSTA) return { avisar: false, minutos };
  if (minutos > HORAS_LIMITE_DO_AVISO * 60) return { avisar: false, minutos };

  if (p.avisadoEm) {
    const avisado = new Date(p.avisadoEm).getTime();
    const resposta = p.ultimaRespostaNossa ? new Date(p.ultimaRespostaNossa).getTime() : null;
    // Avisado depois da última resposta nossa: esta espera já teve aviso.
    if (resposta === null || avisado > resposta) return { avisar: false, minutos };
  }
  return { avisar: true, minutos };
}

/** "há 45 min", "há 3h". */
export function haQuanto(minutos: number): string {
  if (minutos < 60) return `há ${Math.max(1, minutos)} min`;
  return `há ${Math.floor(minutos / 60)}h`;
}

export type EsperaParaAviso = {
  nome: string;
  minutos: number;
  iaDesligada: boolean;
  link: string;
};

/**
 * Uma mensagem só por corretor, com todos os que entraram na espera neste
 * tique. A mais antiga vem primeiro.
 */
export function textoDoAvisoSemResposta(esperas: EsperaParaAviso[], urlPainel: string): string {
  const ordem = [...esperas].sort((a, b) => b.minutos - a.minutos);
  const mostrar = ordem.slice(0, MAXIMO_NO_AVISO);
  const sobra = ordem.length - mostrar.length;

  if (ordem.length === 1) {
    const e = ordem[0];
    const motivo = e.iaDesligada ? " A IA está desligada nessa conversa, então é com você." : "";
    return `💬 ${e.nome} escreveu ${haQuanto(e.minutos)} e está sem resposta.${motivo}\n${e.link}`;
  }

  const linhas = mostrar.map(
    (e) => `• ${e.nome}, ${haQuanto(e.minutos)}${e.iaDesligada ? " (IA desligada)" : ""}\n  ${e.link}`,
  );
  if (sobra > 0) linhas.push(`• e mais ${sobra} ${sobra === 1 ? "pessoa" : "pessoas"}`);
  return [
    `💬 ${ordem.length} pessoas escreveram e estão sem resposta:`,
    ...linhas,
    `Painel: ${urlPainel}/corretor`,
  ].join("\n");
}
