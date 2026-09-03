/**
 * Tipos e constantes do gerador de imagem — em módulo PURO, sem `server-only`.
 *
 * A tela é `"use client"` e precisa do teto diário e dos tamanhos. Tipo é
 * apagado na compilação e viaja de graça, mas CONSTANTE é valor: importá-la de
 * `gerarImagem.ts` arrastaria o módulo de servidor inteiro para o grafo do
 * cliente e o build reprovaria. É a mesma pedra de `limitesPdf.ts` e
 * `pessoasTipos.ts` — constante que os dois lados usam mora sozinha.
 */

/**
 * Quantas imagens um corretor pode gerar por dia.
 *
 * Geração é a única coisa do painel que custa dinheiro POR CLIQUE, e um laço
 * de tentativas ("agora sem o sofá", "agora mais claro") vira fatura sem que
 * ninguém perceba. O projeto já tem esse vocabulário: cota de campanha, teto
 * de fila, teto do quadro. Um número baixo o bastante para doer no bolso só
 * se alguém estiver claramente exagerando.
 */
export const TETO_DIARIO = 20;

/** Formatos que fazem sentido no ramo, com o nome de quem usa. */
export const TAMANHOS = [
  { chave: "quadrado", rotulo: "Quadrado — post", largura: 1024, altura: 1024 },
  { chave: "retrato", rotulo: "Retrato — story", largura: 1024, altura: 1536 },
  { chave: "paisagem", rotulo: "Paisagem — capa", largura: 1536, altura: 1024 },
] as const;

export type ChaveTamanho = (typeof TAMANHOS)[number]["chave"];

/**
 * `low` é o padrão de propósito: é a diferença entre alguns centavos e alguns
 * décimos de dólar por imagem, e o corretor está iterando — a maioria das
 * gerações é descartada no caminho até a que presta.
 *
 * NÃO EXISTE "caprichada" (`high`), e isso foi MEDIDO em 03/09/2026, não
 * suposto. Contra o mesmo pedido, em retrato 1024x1536:
 *
 *   | qualidade | latência | arquivo | tokens de saída |
 *   |-----------|----------|---------|-----------------|
 *   | low       |   14,5 s |  1,2 MB |             196 |
 *   | medium    |   37,4 s |  2,5 MB |           1.372 |
 *   | high      |   95,0 s |  2,4 MB |           5.488 |
 *
 * O teto de função do plano Hobby é de 60 SEGUNDOS e não se estica. `high`
 * passa dele com folga — o botão falharia SEMPRE, e botão que sempre falha é
 * pior que botão que não existe (a régua desta casa). Caberia como trabalho
 * assíncrono (linha nascendo `pendente`, worker, tela buscando depois), e não
 * se constrói isso antes de alguém pedir: `medium` já entrega arte publicável.
 *
 * Repare também que `high` gasta 4x os tokens de `medium` para produzir um
 * arquivo MENOR — mais detalhe fino comprime melhor. Tamanho de arquivo não
 * mede custo aqui; token de saída mede.
 */
export const QUALIDADES = [
  { chave: "low", rotulo: "Rápida" },
  { chave: "medium", rotulo: "Boa" },
] as const;

export type ChaveQualidade = (typeof QUALIDADES)[number]["chave"];

export type ImagemGerada = {
  id: string;
  prompt: string;
  url: string;
  largura: number | null;
  altura: number | null;
  referenciaUrl: string | null;
  criadaEm: string;
};

/** O que a tela precisa saber para decidir se deixa gerar. */
export type EstadoDoTeto = { usadasHoje: number; teto: number };

/**
 * O instante em que o dia começou em São Paulo, em ISO — a fronteira do teto
 * diário.
 *
 * O dia NUNCA sai de `getDate()` nem de `toISOString()`. Em produção o
 * servidor roda em UTC, e das 21h à meia-noite de Brasília lá já é o dia
 * seguinte: a contagem viraria três horas cedo, devolvendo o teto zerado para
 * quem acabou de gerar vinte imagens. É a mesma armadilha que quebrou
 * `calendarioProximosDias` (três horas por noite, ensinando ao modelo a data
 * errada) e que `agendaDeVisitas.ts` já evita do mesmo jeito.
 *
 * `-03:00` fixo: o Brasil não tem horário de verão desde 2019.
 *
 * Mora aqui, e não em `galeria.ts`, porque função pura enterrada em módulo
 * `server-only` não tem teste — e esta é justamente a que precisa de um.
 */
export function inicioDoDiaEmSaoPaulo(agora: Date = new Date()): string {
  const emSp = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  return `${emSp}T00:00:00-03:00`;
}
