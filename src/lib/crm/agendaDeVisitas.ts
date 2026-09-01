/**
 * Os horários de visita que EXISTEM — para a IA parar de inventar.
 *
 * ## O defeito que isto conserta
 *
 * Até 31/08/2026 a Sofia oferecia horário de cabeça. O eval de conversa
 * mediu o resultado: ela ofereceu "terça às 10h ou quarta às 15h" quatro
 * vezes seguidas, sem que nada no sistema soubesse se o corretor recebe às
 * terças, se aquele horário já estava tomado, ou se a terça em questão já
 * tinha passado. O funil (0072) mostra o custo: **6 conversas com visita
 * proposta, 1 visita marcada**.
 *
 * Horário inventado é a forma mais barata de perder a visita: o cliente
 * aceita, o corretor não pode, e alguém tem de desmarcar — gastando a única
 * coisa que a conversa tinha conquistado.
 *
 * ## Tudo em São Paulo, e essa é a parte perigosa
 *
 * Este arquivo inteiro pensa no fuso de São Paulo. É a armadilha que já
 * quebrou o agendamento três horas por noite nesta base: `calendarioProximosDias`
 * formatava o rótulo em SP e a data em UTC, e das 21h à meia-noite o prompt
 * afirmava que sábado tinha a data de domingo. Aqui não existe
 * `getDay()`/`getHours()` do `Date` local: o dia da semana e a hora saem
 * SEMPRE de um formatador com `timeZone`.
 *
 * Função pura: recebe grade, ocupados e o instante de agora; devolve
 * horários. Sem banco, sem relógio implícito, testável.
 */

const FUSO = "America/Sao_Paulo";

/** Uma faixa da grade semanal: "sábado, das 9h às 13h". */
export interface FaixaDisponivel {
  /** 0 = domingo … 6 = sábado (convenção de `Date.getDay`). */
  diaSemana: number;
  horaInicio: number;
  horaFim: number;
}

export interface HorarioDeVisita {
  /** O instante exato, para gravar em `leads.visita_agendada_em`. */
  quando: Date;
  /** "sábado, 06/09 às 10h" — o jeito que se fala com o cliente. */
  rotulo: string;
}

const PARTES_SP = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
});

const ROTULO_SP = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
});

/** O dia (YYYY-MM-DD) e a hora em São Paulo, sem passar pelo fuso local. */
function emSaoPaulo(data: Date): { dia: string; hora: number } {
  const p = PARTES_SP.formatToParts(data);
  const parte = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  // `hour12: false` pode render "24" na virada; normalizar para 0.
  const hora = Number(parte("hour")) % 24;
  return { dia: `${parte("year")}-${parte("month")}-${parte("day")}`, hora };
}

/**
 * O dia da semana daquele instante EM SÃO PAULO.
 *
 * `data.getDay()` responderia no fuso de quem roda o código — que em
 * produção é UTC. Às 22h de Brasília isso já é o dia seguinte lá, e a
 * grade de sábado seria aplicada a um domingo.
 */
function diaSemanaEmSaoPaulo(data: Date): number {
  const { dia } = emSaoPaulo(data);
  // Meio-dia UTC do mesmo dia-calendário: longe das duas bordas, então o
  // dia da semana é o mesmo em qualquer fuso do Brasil.
  return new Date(`${dia}T12:00:00Z`).getUTCDay();
}

function rotuloDe(quando: Date, hora: number): string {
  const partes = ROTULO_SP.formatToParts(quando);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  return `${p("weekday")}, ${p("day")}/${p("month")} às ${hora}h`;
}

/**
 * O instante UTC correspondente a uma hora local de São Paulo.
 *
 * São Paulo não tem mais horário de verão desde 2019, então o deslocamento
 * é fixo em -03:00. Está escrito como constante e não calculado porque
 * calcular exigiria uma tabela de fuso que o runtime já tem — e porque, se
 * o horário de verão voltar, é aqui que alguém precisa mexer, com este
 * comentário à vista.
 */
function instanteEmSaoPaulo(dia: string, hora: number): Date {
  return new Date(`${dia}T${String(hora).padStart(2, "0")}:00:00-03:00`);
}

/** Soma dias a um dia-calendário YYYY-MM-DD, sem tocar em fuso. */
function somarDias(dia: string, quantos: number): string {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + quantos);
  return d.toISOString().slice(0, 10);
}

/** Quanto tempo à frente a IA pode oferecer. Duas semanas é o horizonte
 *  que um cliente aceita — "daqui a três semanas" ninguém marca. */
const DIAS_DE_HORIZONTE = 14;

/** Antecedência mínima: ninguém marca visita para daqui a dez minutos. */
const HORAS_DE_ANTECEDENCIA = 3;

export function proximosHorarios(params: {
  grade: readonly FaixaDisponivel[];
  /** Visitas já marcadas deste corretor (qualquer status). */
  ocupados: readonly Date[];
  agora: Date;
  /** Quantos devolver. A IA oferece dois ou três, nunca uma lista. */
  quantos?: number;
}): HorarioDeVisita[] {
  if (params.grade.length === 0) return [];

  const limite = new Date(params.agora.getTime() + HORAS_DE_ANTECEDENCIA * 3600_000);
  const tomados = new Set(params.ocupados.map((o) => o.toISOString()));
  const porDia = new Map(params.grade.map((f) => [f.diaSemana, f]));

  const horarios: HorarioDeVisita[] = [];
  const hoje = emSaoPaulo(params.agora).dia;

  for (let i = 0; i <= DIAS_DE_HORIZONTE; i++) {
    const dia = somarDias(hoje, i);
    const faixa = porDia.get(new Date(`${dia}T12:00:00Z`).getUTCDay());
    if (!faixa) continue;

    for (let hora = faixa.horaInicio; hora < faixa.horaFim; hora++) {
      const quando = instanteEmSaoPaulo(dia, hora);
      if (quando < limite) continue;
      if (tomados.has(quando.toISOString())) continue;

      horarios.push({ quando, rotulo: rotuloDe(quando, hora) });
      if (horarios.length >= (params.quantos ?? 6)) return horarios;
    }
  }

  return horarios;
}

/**
 * O bloco que vai ao prompt.
 *
 * Vazio quando o corretor não configurou agenda — e aí o prompt segue com
 * o calendário genérico de sempre. Nunca quebrar o que já funciona por
 * causa de uma configuração que ninguém preencheu ainda é a regra que
 * salvou o link do catálogo (só entra quando o slug existe).
 */
export function blocoDeHorarios(horarios: readonly HorarioDeVisita[]): string {
  if (horarios.length === 0) return "";

  return [
    "HORÁRIOS REAIS DE VISITA — só estes existem:",
    ...horarios.map((h) => `- ${h.rotulo}`),
    "",
    "Ofereça no máximo DOIS por vez, e SEMPRE desta lista.",
    "É proibido inventar outro horário: o que não está aqui, o corretor não pode receber — o cliente aceitaria e alguém teria de desmarcar, gastando a única coisa que a conversa conquistou.",
    "Se ele recusar os dois, ofereça os DOIS SEGUINTES da lista, nunca os mesmos de novo.",
  ].join("\n");
}

/**
 * Quem estiver sem grade nenhuma não deve ouvir promessa de horário.
 *
 * Existe para o chamador saber a diferença entre "não há vaga nos próximos
 * 14 dias" (agenda cheia — notícia) e "este corretor nunca configurou
 * agenda" (o caso de hoje, para todos).
 */
export function temAgendaConfigurada(grade: readonly FaixaDisponivel[]): boolean {
  return grade.length > 0;
}
