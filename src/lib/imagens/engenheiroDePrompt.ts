import "server-only";

import { chamarLlmJson } from "@/lib/whatsapp/llm";

/**
 * O engenheiro de prompt: pergunta o que falta, depois escreve o pedido.
 *
 * ## Por que perguntar antes
 *
 * "Sala moderna" não é um pedido, é uma categoria: sobram vinte decisões —
 * hora do dia, direção da luz, lente, altura da câmera, paleta. Cada decisão
 * que o corretor não toma, o modelo toma, e toma a mais estatisticamente
 * comum. Medido em 03/09/2026 com esse mesmo pedido: cru saiu uma sala NOTURNA
 * de LED quente virada para a TV; decidido, saiu luz do dia com vista urbana.
 *
 * Perguntar custa dois toques e evita uma geração descartada — que custa do
 * teto diário. Por isso este passo NÃO consome cota, pela mesma razão que o
 * `tradutor` não consome: o passo que evita o desperdício não pode ser o
 * passo que custa.
 *
 * ## Por que a espinha continua fora daqui
 *
 * `receitas.ts` entra por composição, na rota. Foi ela que entregou o salto de
 * qualidade na medição — a IA acrescenta CONTROLE, não a base. Se a espinha
 * virasse instrução para o modelo de texto, viraria probabilística; hoje ela é
 * determinística e vale mesmo com o motor fora do ar.
 *
 * ## Este módulo já NÃO monta o prompt final
 *
 * Até 10/09/2026 ele devolvia `promptEn` (o que ia para o provedor) e
 * `explicacaoPt` (uma paráfrase que o corretor lia). O raciocínio escrito aqui
 * era "inglês porque é o idioma nativo dos modelos de imagem, português ao
 * lado porque prompt que o corretor não lê é prompt que ele não conserta" — e
 * a segunda metade se anulava sozinha: ele lia a paráfrase, nunca o que era
 * enviado, e não havia onde editar.
 *
 * Hoje o prompt final sai de `tradutor.ts`, em português, num campo editável,
 * e é literalmente esse texto que o provedor recebe. O que sobrou aqui são as
 * PERGUNTAS com alternativas, que continuam boas: elas evitam a geração
 * descartada, que é a que custa.
 */

/** Curto: isto acontece com a pessoa parada olhando para a tela. */
const ORCAMENTO_PERGUNTAS_MS = 12_000;

/** Teto do pedido. Acima de três, deixa de ser refino e vira formulário. */
export const MAX_PERGUNTAS = 3;

export type Pergunta = {
  /** Chave estável, para a tela casar resposta com pergunta. */
  id: string;
  texto: string;
  /** De 2 a 4. Alternativa é o que faz alguém responder sem pensar muito. */
  alternativas: string[];
};

export type Resposta = { pergunta: string; escolha: string };


function limpar(v: unknown): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
}

/**
 * Só sobrevive pergunta com texto de verdade e pelo menos duas alternativas.
 *
 * Pergunta com uma alternativa não é pergunta, é afirmação; e alternativa
 * vazia vira um chip em branco na tela. Recusar aqui é mais barato que tratar
 * na interface.
 */
function perguntasDoJson(json: unknown): Pergunta[] {
  if (!json || typeof json !== "object") return [];
  const bruto = (json as { perguntas?: unknown }).perguntas;
  if (!Array.isArray(bruto)) return [];

  const saida: Pergunta[] = [];
  for (const [i, item] of bruto.entries()) {
    if (saida.length >= MAX_PERGUNTAS) break;
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const texto = limpar(o.texto);
    const alternativas = Array.isArray(o.alternativas)
      ? o.alternativas.map(limpar).filter(Boolean).slice(0, 4)
      : [];
    if (texto.length < 8 || alternativas.length < 2) continue;
    saida.push({ id: `p${i}`, texto, alternativas });
  }
  return saida;
}

export async function perguntarOQueFalta(params: {
  ideia: string;
  objetivo: string;
  formato: string;
  temReferencia: boolean;
}): Promise<Pergunta[]> {
  const ideia = params.ideia.trim();
  if (!ideia) return [];

  const prompt = `Você é engenheiro de prompt para geradores de imagem, trabalhando
para uma imobiliária. Um corretor descreveu o que quer, mas de forma incompleta.

O que ele escreveu: "${ideia}"

O que ele JÁ escolheu na tela — nunca pergunte sobre isto de novo:
- Objetivo da peça: ${params.objetivo}
- Formato: ${params.formato}
- Foto de referência: ${params.temReferencia ? "sim, ele anexou uma" : "não anexou nenhuma"}

Sua tarefa: identificar o que falta e fazer de 1 a ${MAX_PERGUNTAS} perguntas curtas
para fechar a visão. Pergunte SÓ o que a descrição dele deixou ambíguo.

Os eixos que costumam faltar:
- estilo visual ou mídia (fotografia, render 3D, ilustração)
- iluminação e atmosfera (hora do dia, tempo, clima da cena)
- paleta de cores
- ângulo de câmera e composição

Como perguntar:
- Uma linha, direta, em português, no vocabulário de quem vende imóvel — não
  de quem opera software.
- Sempre com 2 a 4 alternativas concretas, para ele responder num toque.
- Se a descrição dele já responde um eixo, PULE esse eixo. Uma pergunta boa
  vale mais que três redundantes.

Responda apenas com JSON:
{"perguntas":[{"texto":"...","alternativas":["...","..."]}]}`;

  const r = await chamarLlmJson(prompt, {
    temperature: 0.4,
    orcamentoMs: ORCAMENTO_PERGUNTAS_MS,
  });
  // Falha aqui não bloqueia: sem perguntas, o fluxo segue direto para o prompt.
  return r.ok ? perguntasDoJson(r.json) : [];
}
