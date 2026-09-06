import { chamarGeminiJson } from "../../src/lib/whatsapp/gemini";
import { chamarGroqJson } from "../../src/lib/whatsapp/groq";
import { chamarNvidiaJson } from "../../src/lib/whatsapp/nvidia";
import { chamarOpenaiJson, modeloOpenai } from "../../src/lib/whatsapp/openai";
import type { ResultadoLlm } from "../../src/lib/whatsapp/llmTipos";
import type { Persona } from "./personas";

/**
 * O cliente do outro lado da conversa.
 *
 * ## Por que ele NÃO pode rodar no mesmo provedor do agente
 *
 * É a mesma regra do juiz, e pelo mesmo motivo. Modelo conversando consigo
 * mesmo produz uma conversa artificialmente cooperativa: ele entende a
 * própria pergunta mal formulada, aceita a resposta ambígua e nunca
 * reproduz o mal-entendido — que é exatamente onde o atendimento de verdade
 * quebra. A conversa fica boa, o eval dá nota alta, e nada foi medido.
 *
 * `EVAL_CLIENTE_PROVEDOR` escolhe (padrão `groq`); coincidir com o provedor
 * do agente ABORTA a rodada em vez de rodar e produzir um número que parece
 * válido.
 *
 * A Groq é o padrão por medida, não por gosto: a fala do cliente é curta —
 * a média medida da casa é 47 caracteres — e o prompt da persona é pequeno,
 * então o teto de 8.000 tokens/min, que derruba o agente, aqui não aperta.
 */

type Provedor = "groq" | "gemini" | "nvidia" | "openai";

const CHAMADAS: Record<
  Provedor,
  (p: string, o: { temperature?: number; timeoutMs: number; modelo?: string }) => Promise<ResultadoLlm>
> = {
  groq: chamarGroqJson,
  gemini: chamarGeminiJson,
  nvidia: chamarNvidiaJson,
  openai: chamarOpenaiJson,
};

export function provedorDoCliente(): Provedor {
  const escolhido = (process.env.EVAL_CLIENTE_PROVEDOR || "groq").toLowerCase();
  if (escolhido in CHAMADAS) return escolhido as Provedor;
  throw new Error(
    `EVAL_CLIENTE_PROVEDOR="${escolhido}" não existe. Use: ${Object.keys(CHAMADAS).join(", ")}.`,
  );
}

/**
 * Trava explícita, no lugar de um aviso que ninguém lê.
 *
 * Rodar mesmo assim geraria um relatório com número, gráfico e conclusão —
 * tudo derivado de um modelo se entrevistando. Melhor não ter medida do que
 * ter uma medida falsa que ninguém sabe que é falsa.
 */
/** O modelo que o cliente simulado vai usar neste provedor. */
export function modeloDoCliente(provedor: Provedor): string | undefined {
  return (
    process.env.EVAL_CLIENTE_MODELO || (provedor === "groq" ? "openai/gpt-oss-20b" : undefined)
  );
}

/**
 * A trava, e a única fresta que ela admite.
 *
 * Provedor diferente é o normal e não tem conversa. Provedor IGUAL era
 * abortar sempre — e isso deixava a rodada impossível para quem só tem a
 * chave de um provedor, que é a situação real de quem desenvolve aqui.
 *
 * A fresta é a MESMA que o juiz já usa desde 26/08 (`juizIndependente` no
 * `rodarEval.ts`): mesmo provedor passa, desde que o MODELO seja outro e
 * escolhido de propósito — e o resultado sai CARIMBADO, para ninguém
 * comparar esta rodada com uma de cliente independente como se fossem a
 * mesma régua. Família igual (gpt-4o-mini contra gpt-4.1-mini) ainda
 * enviesa um pouco para a cooperação; o carimbo é o que impede a nota de
 * ser lida como se não enviesasse.
 *
 * O que continua ABORTANDO é o caso que a trava sempre existiu para
 * impedir: o mesmo modelo dos dois lados, que é o modelo se entrevistando.
 */
export function conferirProvedores(provedorDoAgente: string): { clienteIndependente: boolean } {
  const cliente = provedorDoCliente();
  if (cliente !== provedorDoAgente) return { clienteIndependente: true };

  const modeloCliente = modeloDoCliente(cliente);
  const modeloAgente = cliente === "openai" ? modeloOpenai() : process.env.IA_MODELO;

  if (!modeloCliente) {
    throw new Error(
      `O cliente simulado e o agente rodariam no mesmo provedor (${cliente}) e no mesmo modelo. ` +
        `Modelo conversando consigo mesmo produz conversa cooperativa demais e o score não vale nada. ` +
        `Use outro provedor em EVAL_CLIENTE_PROVEDOR, ou fixe um modelo diferente em EVAL_CLIENTE_MODELO.`,
    );
  }

  if (modeloAgente && modeloCliente === modeloAgente) {
    throw new Error(
      `EVAL_CLIENTE_MODELO="${modeloCliente}" é o MESMO modelo do agente. ` +
        `Escolha outro — mesmo modelo dos dois lados é o modelo se entrevistando.`,
    );
  }

  console.warn(
    `[eval] cliente simulado no MESMO provedor do agente (${cliente}), em modelo diferente ` +
      `(${modeloCliente} contra ${modeloAgente ?? "padrão"}). A rodada sai carimbada como ` +
      `clienteIndependente: false — não compare com rodada de cliente independente.`,
  );
  return { clienteIndependente: false };
}

const INSTRUCOES_DE_COMPORTAMENTO: Record<string, string> = {
  escreve_em_rajada:
    "Às vezes mande 2 ou 3 mensagens seguidas em vez de uma só, como se estivesse digitando rápido no celular — é assim que gente escreve no WhatsApp.",
  insiste_no_preco:
    "Você quer saber o valor e vai perguntar mais de uma vez, de formas diferentes. Se ela desviar, insista pelo menos uma vez.",
  elogia_imovel_alheio:
    "Você viu um empreendimento de OUTRA imobiliária e gostou. Fale bem dele e compare.",
  muda_de_ideia:
    "Lá pela terceira mensagem, mude o que você quer — algo menor, ou outro estágio de obra. Não avise que mudou; só peça diferente.",
  pede_foto_varias_vezes:
    "Peça foto, e depois peça mais fotos, e depois peça de novo. Você quer ver bastante antes de decidir.",
  escreve_errado:
    "Você digita rápido e erra: escreva nomes de empreendimento com erro de grafia e use abreviações (vc, pra, tbm).",
  responde_monossilabico:
    "Responda curto. Uma ou duas palavras quando der. Você não está a fim de escrever textão.",
  sem_interrogacao:
    "Pergunte sem usar ponto de interrogação: 'qual o valor', 'tem foto', 'onde fica'. É assim que você digita.",
  pede_desconto:
    "Peça desconto ou condição especial mais de uma vez, de formas diferentes. Se recusarem, tente por outro ângulo pelo menos uma vez antes de aceitar.",
  recusa_visita:
    "Quando oferecerem visita, recuse: você quer resolver pelo chat. Só considere ir pessoalmente se a conversa te convencer de que vale — e nunca na primeira oferta.",
  decide_com_outra_pessoa:
    "Você não decide sozinho. A qualquer proposta de compromisso, responda que precisa falar com a outra pessoa antes.",
  enrola_sem_decidir:
    "Responda propostas com 'vou pensar', 'depois te falo', 'vou ver aqui'. Você não fecha nada nesta conversa — mas também não vai embora se te tratarem bem.",
  pergunta_se_e_robo:
    "Lá pela terceira ou quarta mensagem, pergunte diretamente se está falando com um robô ou com uma pessoa. Reaja ao que responderem.",
};

function promptDoCliente(persona: Persona, conversa: { quem: "cliente" | "assistente"; texto: string }[]): string {
  const comportamentos = persona.comportamentos
    .map((c) => `- ${INSTRUCOES_DE_COMPORTAMENTO[c] ?? c}`)
    .join("\n");

  const transcricao = conversa
    .map((m) => `${m.quem === "cliente" ? "Você" : "Atendente"}: ${m.texto}`)
    .join("\n");

  return `Você está fingindo ser um CLIENTE conversando com a atendente de uma imobiliária pelo WhatsApp. Escreva como o cliente escreveria, não como um assistente de IA.

QUEM VOCÊ É: ${persona.descricao}
O QUE VOCÊ QUER: ${persona.objetivo}
NÃO ABRE MÃO DE: ${persona.restricoes.join("; ")}

COMO VOCÊ SE COMPORTA:
${comportamentos}

REGRAS DO PAPEL:
1. Escreva MENSAGEM DE CLIENTE: curta, informal, sem formatação, sem markdown, sem assinar. CURTA DE VERDADE: a mediana do cliente real desta casa é 17 caracteres por balão, e quase metade das mensagens tem 15 ou menos. Nada de frase completa com sujeito e verbo quando meia frase resolve ("e a metragem", "tem de 2 dorm", "manda foto"). Passar de 100 caracteres num balão é exceção rara.
2. NÃO facilite. Não responda o que não foi perguntado, não organize a informação para ela, não seja educado demais. Cliente real dá informação aos pedaços.
3. Se ela não responder o que você perguntou, PERGUNTE DE NOVO — é assim que gente reage.
4. Se ela repetir algo que você já disse ou já perguntou, demonstre impaciência.
5. Encerre (encerrar: true) só quando seu objetivo tiver sido atingido OU quando você desistir da conversa por ela não estar ajudando.
6. Você NUNCA é a atendente. Nunca ofereça imóvel, nunca dê informação de catálogo.

CONVERSA ATÉ AGORA:
${transcricao || "(ainda não começou)"}

Responda SOMENTE com JSON:
{"mensagem": ["balão 1", "balão 2"], "encerrar": false, "porque": "por que você respondeu assim, em até 10 palavras"}

"mensagem" é uma lista de balões — normalmente um só; use mais de um apenas se o seu comportamento pedir.`;
}

export type FalaDoClienteSimulado = {
  baloes: string[];
  encerrar: boolean;
  porque?: string;
};

export async function proximaFalaDoCliente(
  persona: Persona,
  conversa: { quem: "cliente" | "assistente"; texto: string }[],
): Promise<FalaDoClienteSimulado | null> {
  // A primeira fala é FIXA por persona: a rodada precisa ser comparável
  // entre versões de prompt, e uma abertura sorteada pelo modelo faria cada
  // execução medir uma conversa diferente.
  if (conversa.length === 0) {
    return { baloes: [persona.primeiraMensagem], encerrar: false, porque: "abertura fixa da persona" };
  }

  /*
   * `EVAL_CLIENTE_MODELO` existe pela mesma razão do modelo do juiz: a cota
   * gratuita do Gemini conta por MODELO. Cliente e juiz no mesmo modelo
   * disputam 20 chamadas/dia, e quem fica sem é sempre o juiz — as
   * conversas saem sem nota justo na rodada que você queria ler.
   */
  const provedor = provedorDoCliente();
  const opcoes = {
    temperature: 0.8,
    // 30s cabe nos modelos rápidos; modelos de raciocínio (3.6-flash) estouram
    // esse teto de forma intermitente e o cliente cala no meio da conversa —
    // parece cota, mas é timeout. EVAL_CLIENTE_TIMEOUT_MS estica quando o
    // único modelo com cota sobrando é um de raciocínio.
    timeoutMs: Number(process.env.EVAL_CLIENTE_TIMEOUT_MS ?? 30_000),
    /*
     * Na Groq o padrão é o `gpt-oss-20b`, não o 120b do agente: balde de
     * tokens/minuto SEPARADO, e fala de cliente não precisa do modelo
     * grande. `maxTokens` baixo é o que faz a fábrica caber no minuto — o
     * limitador da Groq reserva o max_tokens pedido contra o teto da conta.
     */
    modelo: modeloDoCliente(provedor),
    maxTokens: 600,
  };

  let resultado = await CHAMADAS[provedor](promptDoCliente(persona, conversa), opcoes);

  /*
   * Uma retentativa, com espera de meio minuto: o limite da Groq é por
   * JANELA DE UM MINUTO, então "esperar a janela virar" resolve o caso
   * comum. Sem isto, um único 429 no meio derruba a conversa inteira como
   * `cliente_mudo` — e conversa não medida é rodada perdida.
   */
  if (!resultado.ok) {
    await new Promise((r) => setTimeout(r, 30_000));
    resultado = await CHAMADAS[provedor](promptDoCliente(persona, conversa), opcoes);
  }

  /*
   * RESERVA PAGA (decisão do usuário, 25/08): cota gratuita esgotada não
   * pode mais matar a rodada — o cliente cai para a OpenAI. Num modelo
   * DIFERENTE do agente de propósito (`gpt-4o-mini` contra `gpt-4.1-mini`):
   * mesmo modelo dos dois lados é o modelo se entrevistando, que é o que a
   * trava de provedor existe para impedir. Família igual ainda enviesa um
   * pouco para a cooperação — por isso a reserva é o ÚLTIMO recurso, não o
   * padrão, e o log grita quando ela assume.
   */
  if (!resultado.ok && provedor !== "openai") {
    console.warn(
      "[eval] cliente simulado SEM COTA no provedor gratuito — reserva paga assumiu (gpt-4o-mini)",
    );
    resultado = await CHAMADAS.openai(promptDoCliente(persona, conversa), {
      ...opcoes,
      modelo: process.env.EVAL_CLIENTE_MODELO_RESERVA || "gpt-4o-mini",
    });
  }

  if (!resultado.ok) return null;

  const json = resultado.json as { mensagem?: unknown; encerrar?: unknown; porque?: unknown };
  const baloes = (Array.isArray(json.mensagem) ? json.mensagem : [json.mensagem])
    .filter((b): b is string => typeof b === "string" && b.trim().length > 0)
    .map((b) => b.trim());

  if (baloes.length === 0) return null;

  return {
    baloes,
    encerrar: json.encerrar === true,
    porque: typeof json.porque === "string" ? json.porque : undefined,
  };
}
