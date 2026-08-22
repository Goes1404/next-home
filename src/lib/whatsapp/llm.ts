import "server-only";

import { chamarGeminiJson, geminiConfigurado, MODELO_GEMINI } from "./gemini";
import { chamarGroqJson, groqConfigurada, modeloGroq } from "./groq";
import { chamarNvidiaJson, modeloNvidia, nvidiaConfigurada } from "./nvidia";
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
 * Ordem: **Groq → NVIDIA → Gemini**, e a ordem foi medida, não escolhida
 * por preferência:
 *
 * | provedor | latência com o prompt real |
 * |---|---|
 * | Groq (`gpt-oss-120b`) | ~0,8s |
 * | NVIDIA (`mistral-nemotron`) | ~5,5s, instável |
 * | Gemini 2.5 Flash | 4,9–6,9s |
 *
 * Um primeiro provedor sub-segundo não é só conforto: é o que deixa a
 * cascata inteira caber com folga no teto de 60s da função do webhook. Se
 * a Groq falha, sobram ~25s de orçamento para os outros dois — quando o
 * primeiro gastava 14s, sobrava quase nada.
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
};

const PROVEDORES: Provedor[] = [
  {
    nome: "groq",
    configurado: groqConfigurada,
    modelo: modeloGroq,
    chamar: chamarGroqJson,
  },
  {
    nome: "nvidia",
    configurado: nvidiaConfigurada,
    modelo: modeloNvidia,
    chamar: chamarNvidiaJson,
  },
  {
    nome: "gemini",
    configurado: geminiConfigurado,
    modelo: () => MODELO_GEMINI,
    chamar: chamarGeminiJson,
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
    (p) => p.configurado() && (!provedorForcado() || p.nome === provedorForcado()),
  );
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

/** Nomes dos provedores com chave, na ordem de tentativa. Usado em diagnóstico. */
export function provedoresDisponiveis(): string[] {
  return PROVEDORES.filter((p) => p.configurado()).map((p) => p.nome);
}

export function algumProvedorConfigurado(): boolean {
  return provedoresDisponiveis().length > 0;
}
