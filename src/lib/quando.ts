const FUSO = "America/Sao_Paulo";

const HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  hour: "2-digit",
  minute: "2-digit",
});
const DIA_DA_SEMANA = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "short" });
const DIA_E_MES = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "numeric", month: "short" });
const DIA_MES_ANO = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "numeric",
  month: "short",
  year: "2-digit",
});

/** O dia civil em São Paulo, como número, para comparar datas sem hora. */
function diaCivil(d: Date): number {
  const [dia, mes, ano] = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .format(d)
    .split("/")
    .map(Number);
  return ano! * 10000 + mes! * 100 + dia!;
}

/** Tira o ponto que o pt-BR põe em "set." e "sáb." — na lista ele só ocupa espaço. */
function semPonto(s: string): string {
  return s.replace(/\./g, "");
}

/**
 * "20 ago", "20 ago 25" — o pt-BR escreve "20 de ago. de 25", e os dois "de"
 * são seis caracteres que a coluna de 14rem não tem para dar.
 */
function dataCompacta(formatador: Intl.DateTimeFormat, data: Date): string {
  return formatador
    .formatToParts(data)
    .filter((p) => p.type === "day" || p.type === "month" || p.type === "year")
    .map((p) => semPonto(p.value))
    .join(" ");
}

/**
 * Quando isto aconteceu, em uma ou duas palavras: "agora", "14:32", "ontem",
 * "sáb", "3 set", "3 set 25".
 *
 * ## Por que a lista de conversas precisava disto
 *
 * O histórico do consultor e do Estúdio mostrava só títulos, todos com o
 * mesmo peso e o mesmo tamanho: vinte linhas de texto parecido, sem nenhuma
 * pista de qual era a de ontem e qual a de junho. `atualizado_em` já vinha do
 * banco em `ConversaDeChat` e não aparecia em lugar nenhum — dado carregado e
 * jogado fora.
 *
 * ## As decisões de formato
 *
 * - **A largura manda.** Isto vive numa coluna de 14rem no computador e ao
 *   lado de um título truncado no celular: "há 3 dias" não cabe junto do
 *   título, "3 set" cabe. Por isso nada de `RelativeTimeFormat` por extenso.
 * - **Hoje é HORA, não "hoje".** Quem abre o painel de manhã e de novo à
 *   tarde tem várias conversas do mesmo dia; a hora separa, "hoje" não.
 * - **O dia é o CIVIL de São Paulo**, não o intervalo de 24 horas: às 00:30,
 *   algo das 23:00 é "ontem" para quem viveu o dia, e "há 1 hora" para uma
 *   subtração de milissegundos. A pessoa está certa, a subtração não.
 * - **O ano só aparece quando não é este.** Repetir "25" em toda linha de
 *   2025 gasta o espaço que o título precisa.
 *
 * `agora` entra por parâmetro para o teste ser determinístico — a mesma régua
 * de `ehRecente` em `format.ts`.
 */
export function quandoCurto(iso: string, agora: Date = new Date()): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";

  const segundos = (agora.getTime() - data.getTime()) / 1000;
  // Futuro (relógio do servidor à frente do navegador) cai em "agora": uma
  // conversa com data de amanhã é ruído de relógio, não informação.
  if (segundos < 60) return "agora";

  const hoje = diaCivil(agora);
  const dia = diaCivil(data);
  if (dia === hoje) return HORA.format(data);

  const ontem = new Date(agora.getTime() - 86_400_000);
  if (dia === diaCivil(ontem)) return "ontem";

  if (segundos < 7 * 86_400) return semPonto(DIA_DA_SEMANA.format(data));

  const mesmoAno = Math.floor(dia / 10000) === Math.floor(hoje / 10000);
  return dataCompacta(mesmoAno ? DIA_E_MES : DIA_MES_ANO, data);
}
