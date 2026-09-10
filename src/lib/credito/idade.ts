/**
 * Há quanto tempo os parâmetros de crédito foram conferidos — módulo PURO.
 *
 * ## Por que isto é um módulo e não duas linhas em cada tela
 *
 * A conta acontece em DOIS lugares: no bloco que entra no prompt (para o
 * consultor avisar que os números podem estar velhos) e na tela do gestor
 * (para ele ver o quanto). Duas contas do mesmo número divergem — foi assim
 * que `montarResumo` virou a única verdade sobre carga por corretor.
 *
 * E `Date.now()` no corpo de um componente é impureza durante o render; a
 * regra `react-hooks/purity` reprova, com razão. A saída não é fingir pureza:
 * é tirar o relógio de dentro do render. Aqui fora, ler a hora é o trabalho
 * normal de um módulo — e a conta vira testável.
 */

const UM_DIA_MS = 86_400_000;

/** Acima disso, os parâmetros deixam de ser afirmação e viram lembrete. */
export const DIAS_ATE_ENVELHECER = 120;

/**
 * `agora` é parâmetro com padrão: a tela chama sem argumento (e a impureza
 * fica aqui), e o teste passa um instante fixo.
 *
 * O meio-dia UTC na data de conferência evita a virada de fuso: com
 * meia-noite, das 21h às 24h de Brasília a conta daria um dia a mais.
 */
export function diasDesdeConferencia(conferidoEm: string, agora: Date = new Date()): number {
  const conferido = new Date(`${conferidoEm}T12:00:00Z`).getTime();
  if (!Number.isFinite(conferido)) return 0;
  return Math.max(0, Math.floor((agora.getTime() - conferido) / UM_DIA_MS));
}

export function estaEnvelhecido(conferidoEm: string, agora: Date = new Date()): boolean {
  return diasDesdeConferencia(conferidoEm, agora) > DIAS_ATE_ENVELHECER;
}
