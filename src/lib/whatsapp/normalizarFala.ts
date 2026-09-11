/**
 * A normalização da fala do cliente — uma só, e é por isso que ela mora
 * sozinha.
 *
 * Nasceu privada em `jogada.ts`. Quando `recusaDoCliente.ts` passou a
 * precisar dela (11/09/2026), exportá-la de lá criaria um CICLO: o detector
 * importa o planner e o planner importa o detector. Módulos ES toleram
 * ciclo de função declarada, mas é o tipo de coisa que funciona até alguém
 * mexer na ordem de avaliação — e aí falha calada, no runtime.
 *
 * Copiar a função nos dois lugares seria pior: duas normalizações divergem
 * no primeiro "Antônio" que entrar, e aí o planner e o detector passam a
 * discordar sobre o que o cliente escreveu. É a mesma lição de
 * `limitesPdf.ts` e `pessoasTipos.ts` — o que dois lados usam mora sozinho.
 *
 * Não mexe na PONTUAÇÃO de propósito: o "?" é o que `ehPergunta` lê.
 */
export function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
