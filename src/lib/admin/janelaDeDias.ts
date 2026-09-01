/**
 * A janela de N dias que a tela de Anúncios usa.
 *
 * ## Por que isto é um módulo e não duas linhas na página
 *
 * `Date.now()` chamado no corpo de um Server Component é impureza durante
 * o render, e a regra `react-hooks/purity` reprova — com razão: o valor
 * muda a cada render, e componente que não é idempotente dá resultado
 * instável quando o React resolve renderizar de novo.
 *
 * Num Server Component dinâmico "agora" é exatamente o que se quer, então
 * a saída não é fingir pureza: é tirar o relógio de dentro do render. Aqui
 * fora, ler a hora é o trabalho normal de um módulo — e de quebra a conta
 * dos dias vira função testável, que ela não era.
 */

const UM_DIA_MS = 86_400_000;

export interface JanelaDeDias {
  /** O instante do corte, para filtrar por `created_at`. */
  corte: Date;
  /** O dia do corte em YYYY-MM-DD, para filtrar coluna `date`. */
  corteDia: string;
  /** Um item por dia da janela, do mais antigo ao mais recente. */
  dias: { chave: string; rotulo: string }[];
}

/**
 * `agora` é parâmetro com padrão: a página chama sem argumento (e a
 * impureza fica aqui, fora do render), e o teste passa um instante fixo.
 */
export function janelaDeDias(quantos: number, agora: Date = new Date()): JanelaDeDias {
  const corte = new Date(agora.getTime() - quantos * UM_DIA_MS);

  const dias = Array.from({ length: quantos }, (_, i) => {
    const d = new Date(agora.getTime() - (quantos - 1 - i) * UM_DIA_MS);
    return {
      chave: d.toISOString().slice(0, 10),
      rotulo: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    };
  });

  return { corte, corteDia: corte.toISOString().slice(0, 10), dias };
}
