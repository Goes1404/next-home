import "server-only";

import { chamarGeminiJson, geminiConfigurado, modeloGemini } from "./gemini";
import { chamarGroqJson, groqConfigurada, modeloGroq, promptCabeNaGroq } from "./groq";
import { chamarNvidiaJson, modeloNvidia, nvidiaConfigurada } from "./nvidia";
import { chamarOpenaiJson, modeloOpenai, openaiConfigurada } from "./openai";
import { valeRetentar, type MotivoFalhaLlm, type ResultadoLlm } from "./llmTipos";

/**
 * A cascata de provedores de IA — o único ponto do sistema que decide COM
 * QUEM falar.
 *
 * Existe porque um provedor só é um ponto único de falha, e isso não é
 * teoria: em agosto de 2026 o Gemini estourou cota (`http_429`) e o cliente
 * passou a receber mensagem de contingência. Trocar de fornecedor não
 * resolveria — o tier gratuito da NVIDIA também tem teto (~40 req/min). O
 * que resolve é ter DOIS: quando o primeiro recusa, demora ou cai, o
 * segundo responde e ninguém percebe.
 *
 * Ordem: **Groq → Gemini → NVIDIA**, e ela foi MEDIDA, não escolhida por
 * preferência. Velocidade decide a frente; confiabilidade decide o resto:
 *
 * | provedor | latência | confiabilidade medida |
 * |---|---|---|
 * | Groq (`gpt-oss-120b`) | 1,4s | teto de 8k tokens/min → ~2 chamadas/min |
 * | Gemini 2.5 Flash | 5–7s | 16 de 16 respostas em produção |
 * | NVIDIA (`mistral-nemotron`) | 6–9s | 35 de 44 modelos nem existem; 3 a 6 falhas em 10 |
 *
 * A NVIDIA já esteve na frente e foi rebaixada por medição: dos 44
 * candidatos de chat do catálogo, 21 devolvem `404 Not found for account`
 * e 14 estouram o tempo. Os que respondem oscilam entre 5,5s e timeout na
 * mesma tarde. Ela fica como terceiro fôlego, não como linha de frente.
 *
 * Um primeiro provedor de 1,4s não é só conforto: é o que deixa três elos
 * caberem no teto de 60s da função do webhook. E o 429 da Groq — que
 * acontece o tempo todo, dado o teto de tokens — custa 60ms: é a aposta
 * mais barata da cascata.
 *
 * Duas regras que sustentam o desenho:
 *
 * 1. **Provedor sem chave é pulado, não é falha.** Sem `NVIDIA_API_KEY` o
 *    sistema inteiro continua no Gemini, exatamente como antes — dá para
 *    subir este código antes de existir chave nenhuma.
 * 2. **Orçamento por PRAZO, não por tentativa.** O segundo provedor recebe
 *    o tempo que sobrou, não um teto novo. Somar os dois tetos dobraria o
 *    pior caso e estouraria os 60s da função do webhook — trocando uma
 *    resposta de contingência por um 504, em que o cliente não recebe nada.
 */

/** Cliente esperando na tela: é o orçamento que vale a pena gastar. */
export const ORCAMENTO_AGENTE_MS = 26_000;
/** Dossiê roda DEPOIS de as mensagens saírem — ninguém está esperando. */
export const ORCAMENTO_DOSSIE_MS = 12_000;

/**
 * Teto de cada provedor dentro do orçamento, como fração do total.
 *
 * Com dois provedores era 0,55; com três, essa fatia deixaria o terceiro
 * sem tempo útil (0,55 + 0,45 = tudo). Em 0,40 o pior caso fica em
 * 0,40 + 0,40 + o resto — e mesmo assim o Groq, que vem primeiro, quase
 * nunca chega perto do seu teto.
 */
const FATIA_MAXIMA = 0.4;
/** Abaixo disso não vale começar — só gastaria o resto do prazo para nada. */
const MINIMO_UTIL_MS = 3_000;

type Provedor = {
  nome: string;
  configurado: () => boolean;
  modelo: () => string;
  chamar: (p: string, o: { temperature?: number; timeoutMs: number }) => Promise<ResultadoLlm>;
  /*
   * Este provedor consegue atender ESTE prompt? Diferente de
   * `configurado`, que é sobre ter chave, isto é sobre o pedido caber no
   * orçamento dele. Só a Groq usa hoje, e por um motivo medido: o prompt
   * do agente passou dos 8.000 tokens/min da conta e ela devolve HTTP 413
   * em toda mensagem desde a v6 do prompt. Um provedor que não pode
   * responder não deve ser contado como disponível — nem no laço, nem na
   * tela de diagnóstico.
   */
  cabe?: (prompt: string) => boolean;
};

const PROVEDORES: Provedor[] = [
  {
    nome: "groq",
    configurado: groqConfigurada,
    modelo: modeloGroq,
    chamar: chamarGroqJson,
    cabe: promptCabeNaGroq,
  },
  {
    nome: "gemini",
    configurado: geminiConfigurado,
    modelo: modeloGemini,
    chamar: chamarGeminiJson,
  },
  {
    nome: "nvidia",
    configurado: nvidiaConfigurada,
    modelo: modeloNvidia,
    chamar: chamarNvidiaJson,
  },
  /*
   * Por ÚLTIMO, e por ser o único pago. Os três acima são gratuitos e
   * atendem a esmagadora maioria das mensagens; a OpenAI entra só quando
   * todos falharam — o momento em que hoje o cliente recebe a contingência
   * e a conversa morre. Alguns centavos valem mais que uma conversa perdida;
   * pagar por mensagem que a Groq responde de graça em 0,8s, não.
   */
  {
    nome: "openai",
    configurado: openaiConfigurada,
    modelo: modeloOpenai,
    chamar: chamarOpenaiJson,
  },
];

export async function chamarLlmJson(
  prompt: string,
  opts?: { temperature?: number; orcamentoMs?: number },
): Promise<ResultadoLlm> {
  const orcamentoMs = opts?.orcamentoMs ?? ORCAMENTO_AGENTE_MS;
  const prazoFinal = Date.now() + orcamentoMs;
  const tetoPorProvedor = Math.floor(orcamentoMs * FATIA_MAXIMA);

  const disponiveis = PROVEDORES.filter(
    (p) =>
      p.configurado() &&
      (p.cabe?.(prompt) ?? true) &&
      (!provedorForcado() || p.nome === provedorForcado()),
  );
  /*
   * Avisar quando um provedor com chave fica de fora por não caber. Sem
   * isto, o elo mais rápido da cascata some em silêncio — foi assim que a
   * Groq passou cinco versões de prompt fora do ar sem ninguém notar.
   */
  for (const p of PROVEDORES) {
    if (p.configurado() && p.cabe && !p.cabe(prompt)) {
      console.warn(
        `[ia] ${p.nome} PULADO: o prompt (${prompt.length} chars) não cabe no orçamento de tokens da conta. ` +
          `Encurtar o prompt traz este provedor de volta.`,
      );
    }
  }
  if (disponiveis.length === 0) {
    return { ok: false, erro: "sem_api_key", latenciaMs: 0 };
  }

  const inicio = Date.now();
  let ultimaFalha: MotivoFalhaLlm = "sem_api_key";
  let ultimoDetalhe: string | undefined;

  for (const provedor of disponiveis) {
    const restante = prazoFinal - Date.now();
    if (restante < MINIMO_UTIL_MS) break;

    const timeoutMs = Math.min(tetoPorProvedor, restante);
    let resultado = await provedor.chamar(prompt, { temperature: opts?.temperature, timeoutMs });

    // Uma retentativa no mesmo provedor só para o que falha rápido (5xx,
    // JSON estranho) e se ainda houver prazo. Cota, timeout e chave
    // inválida não repetem: quem cobre esses é o provedor seguinte.
    if (!resultado.ok && valeRetentar(resultado.erro)) {
      const aindaResta = prazoFinal - Date.now();
      if (aindaResta >= MINIMO_UTIL_MS) {
        resultado = await provedor.chamar(prompt, {
          temperature: opts?.temperature,
          timeoutMs: Math.min(tetoPorProvedor, aindaResta),
        });
      }
    }

    if (resultado.ok) {
      // Latência do que o cliente esperou de FATO, incluindo o provedor que
      // falhou antes — senão a telemetria mostraria só a última perna e a
      // espera real ficaria invisível.
      return { ...resultado, latenciaMs: Date.now() - inicio };
    }

    ultimaFalha = resultado.erro;
    ultimoDetalhe = resultado.detalhe;
    console.warn(
      `[ia] ${provedor.nome} (${provedor.modelo()}) falhou: ${resultado.erro}` +
        `${resultado.detalhe ? ` — ${resultado.detalhe}` : ""}`,
    );
  }

  return {
    ok: false,
    erro: ultimaFalha,
    detalhe: ultimoDetalhe,
    latenciaMs: Date.now() - inicio,
  };
}

/**
 * Restringe a cascata a UM provedor (`IA_PROVEDOR_FORCADO=nvidia|gemini`).
 *
 * Existe para o eval: sem isso, medir a NVIDIA seria impossível — ela
 * falharia num caso difícil, o Gemini responderia por baixo, e o score
 * final seria de uma mistura dos dois. Em produção fica vazio, e a cascata
 * inteira vale.
 */
function provedorForcado(): string | null {
  return process.env.IA_PROVEDOR_FORCADO || null;
}

/**
 * Nomes dos provedores com chave, na ordem de tentativa. Usado em diagnóstico.
 *
 * `prompt` é opcional de propósito: sem ele a resposta é "quem tem chave",
 * que é o que a tela de configuração quer mostrar. COM ele, a resposta é
 * "quem pode atender esta mensagem" — e as duas divergem desde que o
 * prompt passou do teto de tokens da Groq.
 */
export function provedoresDisponiveis(prompt?: string): string[] {
  return PROVEDORES.filter(
    (p) => p.configurado() && (prompt === undefined || (p.cabe?.(prompt) ?? true)),
  ).map((p) => p.nome);
}

export function algumProvedorConfigurado(): boolean {
  return provedoresDisponiveis().length > 0;
}
