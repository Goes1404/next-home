/**
 * Teste A/B da mensagem de campanha.
 *
 * ## O número que motiva
 *
 * Medido em 01/09/2026: **102 disparos entregues, 1 resposta** — 0,98%. A
 * assistente não está falhando; ela não chega a conversar, porque quase
 * ninguém responde à abertura. Quem decide isso é a mensagem, a lista e o
 * horário — e nada no sistema permitia comparar duas aberturas.
 *
 * Sem comparação, "melhorar a mensagem" vira a mesma anedota que travou o
 * prompt por quatro versões: troca-se o texto, o número não se move de
 * forma legível, e ninguém sabe se foi a mudança ou o acaso.
 *
 * ## O sorteio é BALANCEADO, não moeda por item
 *
 * Moeda honesta numa fila de 20 sai 14 x 6 com frequência incômoda, e a
 * comparação nasce torta. Aqui as letras se alternam a partir de um começo
 * sorteado: metade de cada, sempre, e sem que a variante A fique presa aos
 * primeiros da lista — a ordem da fila é a ordem do disparo, e o horário
 * também influencia a resposta.
 *
 * ## O piso de amostra é a parte que protege de si mesma
 *
 * "A: 8% e B: 0%" com 12 envios de cada lado não significa nada — e é
 * exatamente o tipo de número que faz alguém reescrever a mensagem que
 * estava funcionando. É a mesma disciplina que o relatório semanal já usa
 * para não reportar cobertura com menos de 5 conversas, e a mesma do
 * comparador de rodadas do eval: faixa que se toca é empate.
 */

export type Variante = "A" | "B";

/**
 * A letra de cada item, alternada a partir de um começo sorteado.
 *
 * `comecarEm` existe para o teste: em produção é aleatório, para a variante
 * A não cair sempre no primeiro da fila.
 */
export function distribuirVariantes(quantidade: number, comecarEm: Variante = "A"): Variante[] {
  const primeira = comecarEm;
  const segunda: Variante = primeira === "A" ? "B" : "A";

  return Array.from({ length: quantidade }, (_, i) => (i % 2 === 0 ? primeira : segunda));
}

/** Em produção o começo é sorteado; isolado para o teste poder fixá-lo. */
export function comecoAleatorio(): Variante {
  return Math.random() < 0.5 ? "A" : "B";
}

export interface PlacarDaVariante {
  variante: Variante;
  enviados: number;
  respostas: number;
  /** Percentual com uma casa. `null` quando ninguém recebeu ainda. */
  taxa: number | null;
}

export interface ResultadoAB {
  a: PlacarDaVariante;
  b: PlacarDaVariante;
  /** A frase que a tela mostra. Nunca declara vencedor sem amostra. */
  leitura: string;
  /** Só true quando há base para agir. */
  temVencedor: boolean;
}

/**
 * Envios mínimos POR VARIANTE antes de a tela falar em vencedor.
 *
 * Com 30 de cada lado e taxas na casa de 1%, ainda é pouco para
 * significância estatística — e é justamente por isso que a frase abaixo
 * fala em "sinal", nunca em prova. O piso existe para impedir o pior caso:
 * decidir com 5 envios.
 */
export const ENVIOS_MINIMOS = 30;

function taxaDe(enviados: number, respostas: number): number | null {
  if (enviados === 0) return null;
  return Math.round((respostas / enviados) * 1000) / 10;
}

export function resultadoAB(entrada: {
  a: { enviados: number; respostas: number };
  b: { enviados: number; respostas: number };
}): ResultadoAB {
  const a: PlacarDaVariante = {
    variante: "A",
    ...entrada.a,
    taxa: taxaDe(entrada.a.enviados, entrada.a.respostas),
  };
  const b: PlacarDaVariante = {
    variante: "B",
    ...entrada.b,
    taxa: taxaDe(entrada.b.enviados, entrada.b.respostas),
  };

  const faltam = Math.max(0, ENVIOS_MINIMOS - Math.min(a.enviados, b.enviados));

  if (faltam > 0) {
    return {
      a,
      b,
      temVencedor: false,
      leitura:
        `Ainda sem base para comparar: faltam ${faltam} envio(s) na versão de menor volume ` +
        `(mínimo de ${ENVIOS_MINIMOS} de cada lado). Os números abaixo são só o andamento.`,
    };
  }

  if (a.respostas === b.respostas) {
    return { a, b, temVencedor: false, leitura: "Empate: as duas versões tiveram a mesma resposta." };
  }

  const vencedora = (a.taxa ?? 0) > (b.taxa ?? 0) ? a : b;
  const perdedora = vencedora === a ? b : a;

  /*
   * "Sinal", não "prova". Com taxas de campanha na casa de 1%, mesmo 30
   * envios de cada lado é amostra pequena — dizer "vencedor" faria alguém
   * reescrever a mensagem certa. A frase pede repetição, que é o que
   * transforma sinal em conclusão.
   */
  return {
    a,
    b,
    temVencedor: true,
    leitura:
      `Sinal a favor da versão ${vencedora.variante}: ${vencedora.taxa}% contra ` +
      `${perdedora.taxa}% de resposta. Repita numa próxima campanha antes de aposentar a outra.`,
  };
}
