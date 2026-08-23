/**
 * Confere se o dia da semana PROMETIDO no texto bate com a data que vai
 * para o banco.
 *
 * O JSON do agente tem duas verdades sobre a mesma visita: a frase que o
 * cliente lê ("sábado às 10h") e o `dataHoraISO` que vira
 * `leads.visita_agendada_em` e entra na agenda do corretor. Quando as duas
 * divergem, o cliente aparece num dia e o corretor esperava noutro.
 *
 * E divergem. Numa conversa medida de 7 turnos, 4 das 6 propostas tinham
 * dia diferente entre texto e data — a pior delas com o cliente pedindo
 * sábado, o texto confirmando sábado e o banco recebendo domingo.
 *
 * O prompt já entrega um calendário pronto para o modelo não precisar
 * calcular. Isto aqui é a trava: instrução de prompt reduz a frequência do
 * erro, não o elimina, e uma visita no dia errado custa a venda.
 */

const DIAS: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  terça: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
  sábado: 6,
};

/** Dias da semana citados no texto, na ordem em que aparecem. */
export function diasCitados(texto: string): number[] {
  const encontrados: number[] = [];
  const re = /\b(domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado)(?:-feira)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const dia = DIAS[m[1].toLowerCase()];
    if (dia !== undefined && !encontrados.includes(dia)) encontrados.push(dia);
  }
  return encontrados;
}

export type VerificacaoVisita =
  | { coerente: true }
  /** O texto promete um dia e a data é de outro — a data não pode ir ao banco. */
  | { coerente: false; motivo: "dia_divergente"; diaNoTexto: number; diaNaData: number };

/**
 * `dataHoraISO` combina com o que o texto promete?
 *
 * Sem dia citado no texto não há o que conferir: uma proposta como
 * "amanhã de manhã" é coerente por construção.
 */
/**
 * Dia da semana (0=domingo) em São Paulo, não em UTC: 10h de sábado em
 * -03:00 é sábado, mas o `getUTCDay` de uma data perto da meia-noite cairia
 * no dia seguinte.
 */
function diaDaSemanaEmSaoPaulo(data: Date): number {
  const nomes = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const curto = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(data);
  return nomes.indexOf(curto);
}

export function verificarCoerenciaVisita(
  textoResposta: string,
  dataHoraISO: string,
): VerificacaoVisita {
  const data = new Date(dataHoraISO);
  if (Number.isNaN(data.getTime())) return { coerente: true };

  const citados = diasCitados(textoResposta);
  if (citados.length === 0) return { coerente: true };

  const diaNaData = diaDaSemanaEmSaoPaulo(data);

  if (citados.includes(diaNaData)) return { coerente: true };

  return {
    coerente: false,
    motivo: "dia_divergente",
    diaNoTexto: citados[0],
    diaNaData,
  };
}

/**
 * Rola uma data para a próxima ocorrência do mesmo dia da semana, quando o
 * modelo devolveu uma que já passou.
 *
 * Por que existe: o prompt já manda "nunca proponha um dia que já passou", e
 * os modelos desobedecem assim mesmo — medidos em 23/08/2026 (um domingo),
 * `gpt-4.1` e `gpt-4.1-mini` responderam "sábado" com a data do sábado
 * ANTERIOR. `validarDataVisita` recusava, e o cliente que tinha pedido
 * sábado terminava a conversa sem visita nenhuma.
 *
 * O ajuste é seguro porque não inventa intenção: só age quando o dia da
 * semana da data bate com o que o TEXTO prometeu ao cliente. "Sábado" dito
 * ao cliente + data de um sábado que passou = o próximo sábado é a única
 * leitura possível. Se o dia da semana não bater, não mexe — aí a
 * divergência é real e `verificarCoerenciaVisita` descarta, como antes.
 */
export function corrigirVisitaNoPassado(
  dataHoraISO: string,
  texto: string,
  agora: Date = new Date(),
): string {
  const data = new Date(dataHoraISO);
  if (Number.isNaN(data.getTime()) || data > agora) return dataHoraISO;

  const dias = diasCitados(texto);
  const diaDaData = diaDaSemanaEmSaoPaulo(data);
  if (dias.length !== 1 || dias[0] !== diaDaData) return dataHoraISO;

  const corrigida = new Date(data);
  while (corrigida <= agora) corrigida.setDate(corrigida.getDate() + 7);
  // Mais de 60 dias adiante seria outro problema; deixa `validarDataVisita` recusar.
  return corrigida.toISOString();
}
