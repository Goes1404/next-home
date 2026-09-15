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

/**
 * O piso quando JÁ EXISTE foto — bem menor, e de propósito.
 *
 * Criar do zero exige descrever enquadramento, luz e material, e isso não cabe
 * em menos de uma frase. EDITAR não: a cena já está na foto, e "deixe o céu do
 * fim de tarde e escreva a frase no rodapé" é um pedido completo. Cobrar os 80
 * de criação aqui empurraria o modelo a encher linguiça sobre uma imagem que
 * ele não vê — que é exatamente o defeito que a instrução de edição existe
 * para matar.
 */
export const PISO_DE_EDICAO = 40;

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
 * A instrução para quando o corretor ANEXOU foto — e o motivo dela existir.
 *
 * O tradutor é uma chamada de TEXTO: `chamarLlmJson` recebe uma string, e
 * `EntradaDoTradutor` carrega um booleano, nunca a imagem. Mesmo assim a
 * instrução antiga mandava "descreva a cena a partir dela". Duas pressões
 * impossíveis de satisfazer ao mesmo tempo — descrever o que não se vê, e
 * cobrir as quatro seções em 200 a 600 caracteres — e o modelo fazia a única
 * coisa que sobrava: INVENTAVA uma cena. Medido em produção (15/09/2026): com
 * a foto de uma TORRE anexada e o pedido "deixe a primeira imagem parecida com
 * a segunda", voltou "um apartamento moderno, sala de estar, sofá elegante e
 * mesa de centro" — nada disso estava na foto nem no pedido.
 *
 * Aqui a regra se inverte: quem VÊ as fotos é o gerador (`gpt-image-2` recebe
 * `image[]`). O tradutor escreve só a EDIÇÃO, e trata as fotos pela POSIÇÃO —
 * é assim que "a primeira parecida com a segunda" atravessa intacto até quem
 * consegue olhar para elas.
 */
export function instrucaoDeEdicao(quantasFotos: number): string {
  const quadro =
    quantasFotos === 1
      ? "O corretor anexou 1 foto."
      : `O corretor anexou ${quantasFotos} fotos, nesta ordem: ${Array.from(
          { length: quantasFotos },
          (_, i) => `a ${i + 1}ª`,
        ).join(", ")}.`;

  return `${quadro}

VOCÊ NÃO ESTÁ VENDO ESSAS FOTOS. Quem as vê é o gerador de imagem, que recebe
todas junto com o texto que você escrever. Então:

- NUNCA descreva o que há nelas. Você não sabe, e chutar troca a foto do
  corretor por uma cena inventada.
- Escreva APENAS o que deve MUDAR, ser MANTIDO ou ser ENFATIZADO.
- Refira-se às fotos pela posição ("a 1ª foto", "a 2ª foto"), do mesmo jeito
  que o corretor se referiu a elas. É o que permite ao gerador saber qual é
  qual.
- Se o corretor pediu para uma ficar parecida com a outra, diga isso com essas
  palavras — não tente adivinhar o que as duas têm.

Regras de forma:
- Concreto, não adjetivo solto: "luz quente e rasante do fim de tarde" em vez
  de "bonito".
- Texto que deva aparecer NA IMAGEM vai entre aspas, soletrado letra a letra,
  com a posição e o tipo de letra.
- Entre 80 e 500 caracteres. Instrução de edição é curta: o que não muda, a
  foto já resolve.`;
}

/*
 * As marcas de cada seção.
 *
 * Deliberadamente generosas. O erro é assimétrico: acusar de menos custa uma
 * dica que não apareceu na tela; acusar de mais manda o corretor consertar o
 * que já estava certo — e este projeto já perdeu tempo CINCO vezes com
 * critério que reprova o comportamento correto (Leblon, preco-mais-barato,
 * ofereceVisita, deveFazerPergunta, afirmaPrazo).
 */
const MARCAS: Record<ChaveSecao, RegExp> = {
  cena: /\b(vista|plano|enquadr|ângulo|angulo|contra-plong|close|panor|fotografia|render|ilustra|aérea|aerea|frontal|lateral|grande-angular|lente|composi)\w*/i,
  sujeito:
    /\b(fachada|edif|prédio|predio|torre|sala|quarto|cozinha|varanda|piscina|academia|living|salão|salao|hall|churrasqueira|playground|apartamento|casa|terreno|planta|fundo)\w*/i,
  detalhes:
    /\b(luz|iluminad|sol|manhã|manha|tarde|entardecer|noite|golden|sombra|concreto|vidro|madeira|mármore|marmore|porcelanato|cor|paleta|textura|céu|ceu|nublado|difus)\w*/i,
  restricoes: /\b(sem|não|nao|nenhum|evite|exclua|proib)\w*/i,
};

/**
 * O que faltou cobrir — e por que EDIÇÃO não tem pendência nenhuma.
 *
 * As quatro seções descrevem uma cena a ser criada do zero. Cobrá-las de um
 * pedido de edição acusaria de incompleto um texto que está certo ("deixe a 1ª
 * foto com a luz da 2ª" não fala de material, e não deve mesmo) — e a tela
 * mandaria o corretor consertar o que já servia. Esta base já perdeu tempo
 * SEIS vezes com critério que reprova o comportamento correto.
 */
export function conferir(prompt: string, modo: "criacao" | "edicao" = "criacao"): ChaveSecao[] {
  if (modo === "edicao") return [];
  const texto = prompt.trim();
  if (texto.length < PISO_DE_PROMPT) return SECOES.map((s) => s.chave);
  return SECOES.filter((s) => !MARCAS[s.chave].test(texto)).map((s) => s.chave);
}
