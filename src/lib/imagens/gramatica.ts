/**
 * As boas práticas de prompt de imagem como DADO, não como parágrafo solto
 * dentro de um prompt de LLM.
 *
 * ## A estrutura não foi inventada
 *
 * É a que a documentação oficial de image prompting recomenda: seções
 * rotuladas de CENA, SUJEITO, DETALHES e RESTRIÇÕES. Estar aqui, e não
 * embutida numa string do tradutor, é o que permite CONFERIR o que ele
 * devolveu — instrução de prompt é probabilística e falha justo na resposta
 * que importa; função determinística vale sempre e é testável. É a mesma
 * escolha de `vozHumana.ts` e `semValores.ts`.
 *
 * ## Aspas e soletração não são preciosismo
 *
 * A F0 de 10/09/2026 mediu: com o texto entre aspas, soletrado letra a letra e
 * com a posição dita, o modelo acertou 2 em 2 (`MUDE AINDA ESTE ANO` e
 * `PRONTO PARA MORAR`, ambos perfeitos). A linha de base desta base, sem a
 * técnica, era 3 em 4. Por isso a exigência vive na instrução, não na cabeça
 * de quem escreve o prompt do dia.
 *
 * Módulo PURO de propósito — a tela é `"use client"` e mostra ao corretor o
 * que ficou de fora. Constante é valor: importá-la de um módulo `server-only`
 * arrastaria o grafo do servidor e o build reprovaria (a pedra de
 * `limitesPdf.ts`, `pessoasTipos.ts` e `imagensTipos.ts`).
 */

export type ChaveSecao = "cena" | "sujeito" | "detalhes" | "restricoes";

export const SECOES = [
  {
    chave: "cena",
    rotulo: "Cena",
    pede: "onde se passa, que tipo de imagem é (foto, render, ilustração) e o enquadramento",
  },
  {
    chave: "sujeito",
    rotulo: "Sujeito",
    pede: "o que aparece em primeiro plano e o que ele está mostrando",
  },
  {
    chave: "detalhes",
    rotulo: "Detalhes",
    pede: "luz, hora do dia, materiais, cores e textura",
  },
  {
    chave: "restricoes",
    rotulo: "Restrições",
    pede: "o que NÃO pode aparecer",
  },
] as const satisfies readonly { chave: ChaveSecao; rotulo: string; pede: string }[];

/**
 * Abaixo disto não há descrição de cena nenhuma.
 *
 * O número não é arbitrário: em 09/09/2026 uma geração real mandou a palavra
 * `Torre.` — seis caracteres — para uma imagem paga, e voltou um prédio
 * genérico. Um pedido que diz enquadramento, luz e material não cabe em menos
 * de uma frase inteira.
 */
export const PISO_DE_PROMPT = 80;

export function instrucaoDaGramatica(): string {
  const secoes = SECOES.map((s) => `- ${s.rotulo}: ${s.pede}.`).join("\n");
  return `Escreva um parágrafo corrido, em português, que cubra as quatro coisas abaixo.
Não use títulos nem lista — as seções são o que o texto precisa CONTER, não como
ele se organiza.

${secoes}

Regras de forma:
- Concreto, não adjetivo solto: "luz quente e rasante do fim de tarde" em vez de "bonito".
- Câmera e lente são pistas de aparência, não garantia física — pode citá-las.
- Texto que deva aparecer NA IMAGEM vai entre aspas, soletrado letra a letra, com
  a posição e o tipo de letra. Só o texto que o corretor escreveu.
- Entre 200 e 600 caracteres.`;
}

/**
 * O que a tela cobra de volta como dica.
 *
 * Eram as quatro seções, com `sujeito` casando uma lista de imóveis
 * (`fachada|prédio|sala|piscina…`) e `restricoes` exigindo uma negação. Com o
 * Estúdio aberto a qualquer assunto (11/09/2026), as duas passaram a acusar o
 * comportamento CERTO: um retrato de cachorro não tem "fachada" e não precisa
 * de proibição nenhuma.
 *
 * Sobraram as duas que melhoram QUALQUER imagem — enquadramento e luz. As
 * quatro seções continuam na instrução mandada ao motor: elas dizem o que o
 * texto deve CONTER, e isso não mudou. O que mudou é o que se cobra de volta.
 *
 * O erro aqui é assimétrico, e esta base já pagou por ele cinco vezes (Leblon,
 * preco-mais-barato, ofereceVisita, deveFazerPergunta, afirmaPrazo): acusar de
 * menos custa uma dica que não apareceu; acusar de mais manda o corretor
 * consertar o que já estava certo.
 */
export const CONFERIDAS = ["cena", "detalhes"] as const satisfies readonly ChaveSecao[];

const MARCAS: Record<(typeof CONFERIDAS)[number], RegExp> = {
  cena: /\b(vista|plano|enquadr|ângulo|angulo|contra-plong|close|panor|fotografia|render|ilustra|retrato|aérea|aerea|frontal|lateral|grande-angular|lente|composi)\w*/i,
  detalhes:
    /\b(luz|iluminad|sol|manhã|manha|tarde|entardecer|noite|golden|sombra|concreto|vidro|madeira|mármore|marmore|porcelanato|cor|paleta|textura|céu|ceu|nublado|difus)\w*/i,
};

export function conferir(prompt: string): ChaveSecao[] {
  const texto = prompt.trim();
  if (texto.length < PISO_DE_PROMPT) return [...CONFERIDAS];
  return CONFERIDAS.filter((chave) => !MARCAS[chave].test(texto));
}
