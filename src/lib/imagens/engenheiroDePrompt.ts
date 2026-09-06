import "server-only";

import { chamarLlmJson } from "@/lib/whatsapp/llm";
import { receitaPor, type Receita } from "./receitas";

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
 * teto diário. Por isso este passo NÃO consome cota, pela mesma razão que
 * `melhorarPedido` não consome: o passo que evita o desperdício não pode ser
 * o passo que custa.
 *
 * ## Por que a espinha continua fora daqui
 *
 * `receitas.ts` entra por composição, na rota. Foi ela que entregou o salto de
 * qualidade na medição — a IA acrescenta CONTROLE, não a base. Se a espinha
 * virasse instrução para o modelo de texto, viraria probabilística; hoje ela é
 * determinística e vale mesmo com o motor fora do ar.
 *
 * ## O prompt final é em inglês, a explicação em português
 *
 * Inglês porque é o idioma nativo dos modelos de imagem. Português ao lado
 * porque prompt que o corretor não lê é prompt que ele não conserta — e a
 * explicação é o que o ensina a pedir melhor da próxima vez.
 */

/** Curto: isto acontece com a pessoa parada olhando para a tela. */
const ORCAMENTO_PERGUNTAS_MS = 12_000;
const ORCAMENTO_PROMPT_MS = 15_000;

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

export type PromptPronto = {
  /** O que vai para o provedor, antes da espinha e da cláusula. */
  promptEn: string;
  /** Por que cada escolha está ali. O corretor lê isto, não o inglês. */
  explicacaoPt: string;
  /** `false` quando o motor não respondeu e caiu no caminho determinístico. */
  daIa: boolean;
};

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

/**
 * O prompt final, na estrutura de alta conversão dos geradores de imagem:
 * sujeito e ação, ambiente, estilo, luz e atmosfera, detalhe técnico.
 */
export async function montarPromptFinal(params: {
  ideia: string;
  respostas: Resposta[];
  receita: string;
  formato: string;
}): Promise<PromptPronto> {
  const ideia = params.ideia.trim();
  const receita: Receita = receitaPor(params.receita);

  // A reserva é o caminho de hoje: o pedido do corretor, em português, que a
  // rota vai compor com a espinha da receita. Funciona sem motor nenhum.
  const reserva: PromptPronto = {
    promptEn: ideia,
    explicacaoPt:
      "A IA não respondeu agora, então o pedido segue como você escreveu — a " +
      "receita técnica continua sendo aplicada por baixo.",
    daIa: false,
  };
  if (!ideia) return reserva;

  const escolhas = params.respostas
    .filter((r) => r.escolha.trim())
    .map((r) => `- ${r.pergunta}: ${r.escolha}`)
    .join("\n");

  const prompt = `Você é engenheiro de prompt sênior para geradores de imagem
(Midjourney, DALL·E, gpt-image). Trabalha para uma imobiliária brasileira.

Ideia do corretor: "${ideia}"
Trabalho escolhido: ${receita.rotulo} — ${receita.ajuda}
Formato: ${params.formato}
${escolhas ? `\nRespostas dele ao refinamento:\n${escolhas}` : ""}

Escreva o prompt final EM INGLÊS, seguindo exatamente esta ordem:
[subject and action] + [environment] + [artistic style / medium] +
[lighting and atmosphere] + [technical camera and render details]

Regras do prompt:
- Um parágrafo corrido, 40 a 90 palavras. Sem listas, sem cabeçalhos.
- Concreto: materiais, cores, hora do dia, lente, altura da câmera.
- NUNCA inclua texto, letreiro, placa, logotipo ou qualquer palavra a ser
  desenhada na cena. O texto da peça é composto depois, por fora.
- Nunca invente metragem, número de dormitórios, andar ou preço.
- Sem pessoas com rosto reconhecível.

E escreva uma EXPLICAÇÃO EM PORTUGUÊS, de 2 a 4 frases, dizendo por que você
escolheu aquelas palavras-chave — o que cada bloco está controlando. Escreva
para um corretor, não para um técnico.

Responda apenas com JSON: {"prompt_en":"...","explicacao_pt":"..."}`;

  const r = await chamarLlmJson(prompt, { temperature: 0.6, orcamentoMs: ORCAMENTO_PROMPT_MS });
  if (!r.ok || !r.json || typeof r.json !== "object") return reserva;

  const j = r.json as Record<string, unknown>;
  const promptEn = limpar(j.prompt_en);
  const explicacaoPt = limpar(j.explicacao_pt);

  // Piso de tamanho pelo mesmo motivo de `textoDoJson` em melhorarPedido:
  // substituir o pedido da pessoa por duas palavras é pior que não ter tentado.
  if (promptEn.length < 60) return reserva;

  return {
    promptEn: promptEn.slice(0, 1400),
    explicacaoPt: explicacaoPt || "Prompt montado a partir das suas escolhas.",
    daIa: true,
  };
}
