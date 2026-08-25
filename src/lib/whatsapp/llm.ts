import "server-only";

import { chamarGeminiJson, geminiConfigurado, modeloGemini } from "./gemini";
import { chamarGroqJson, groqConfigurada, modeloGroq, promptCabeNaGroq } from "./groq";
import { chamarNvidiaJson, modeloNvidia, nvidiaConfigurada } from "./nvidia";
import { chamarOpenaiJson, modeloOpenai, openaiConfigurada } from "./openai";
import { valeRetentar, type MotivoFalhaLlm, type ResultadoLlm } from "./llmTipos";

/**
 * O motor de IA — o único ponto do sistema que decide COM QUEM falar.
 *
 * **Hoje é UM só: a OpenAI (`gpt-4.1-mini`), que é paga.** Isso é uma
 * mudança deliberada de 24/08/2026, e o motivo não é técnico, é de
 * atendimento: quatro provedores diferentes escrevem de quatro jeitos
 * diferentes, e a cascata trocava de provedor NO MEIO da conversa, sem
 * ninguém perceber. O cliente sentia a mudança — o registro caía de tom, o
 * jeito de perguntar mudava, a mensagem ficava mais informal — como se
 * outra pessoa tivesse assumido o chat. Ninguém contrata quatro corretoras
 * para revezar dentro de uma mesma conversa.
 *
 * A cascata resolvia um problema real (queda de provedor gratuito) criando
 * um pior: consistência quebrada em TODA conversa em que um elo tropeçava.
 * O provedor pago é justamente o que não morre no meio: cota é comercial,
 * não um balde de 20 chamadas por dia. Alguns centavos por conversa custam
 * menos que um lead que percebe que está falando com um robô mal costurado.
 *
 * O que ficou registrado da medição anterior, porque continua verdadeiro e
 * é o que justifica a escolha de qual provedor fica:
 *
 * | provedor | latência | por que NÃO é o motor |
 * |---|---|---|
 * | OpenAI (`gpt-4.1-mini`) | ~2,6s | **é o motor** — 5/5 no bench, pago, sem teto diário |
 * | Groq (`gpt-oss-120b`) | 1,4s | teto de 8k tokens/min: o prompt do agente já não cabe |
 * | Gemini 3.5 Flash | 5–7s | cota gratuita de 20 chamadas/DIA por modelo |
 * | NVIDIA (`mistral-nemotron`) | 6–9s | 35 de 44 modelos nem existem para a conta |
 *
 * Os outros três continuam no código e continuam testados — não como
 * cascata silenciosa, mas como duas coisas:
 *
 * 1. **Rede de segurança para AUSÊNCIA de motor.** Sem `OPENAI_API_KEY`
 *    configurada, o sistema não pode simplesmente emudecer: aí sim a
 *    ordem antiga vale, com aviso no log. É a diferença entre "o motor
 *    falhou nesta chamada" (contingência, e a conversa continua com a
 *    mesma voz) e "não existe motor nenhum" (o serviço está desconfigurado).
 * 2. **`IA_ORDEM_PROVEDORES`**, para eval e benchmark, que precisam medir
 *    um provedor específico sem deploy.
 *
 * Regra que sobreviveu ao desenho antigo e continua valendo:
 * **orçamento por PRAZO, não por tentativa.** Com um motor só, ele recebe
 * o orçamento quase inteiro e a retentativa herda o que sobrou — nunca um
 * teto novo, senão o pior caso estoura os 60s da função do webhook e o
 * cliente troca uma contingência por um 504, em que não recebe nada.
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
 *
 * Só vale quando há MAIS DE UM provedor na fila. Com motor único, dividir o
 * orçamento em fatias seria desperdiçar prazo do cliente: sobraria tempo
 * para ninguém gastar. Ver `FATIA_MOTOR_UNICO`.
 */
const FATIA_MAXIMA = 0.4;
/**
 * Com um motor só, a primeira tentativa leva a maior parte do orçamento e a
 * retentativa herda o resto. Não é 1,0 de propósito: `valeRetentar` existe
 * para o que falha RÁPIDO (5xx, JSON estranho), e sem folga a retentativa
 * nunca aconteceria — a única falha que o cliente veria seria a definitiva.
 */
const FATIA_MOTOR_UNICO = 0.6;
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

/** O motor. Um só, e é o pago — ver o cabeçalho deste arquivo. */
const MOTOR = "openai";

/**
 * Ordem de tentativa dos provedores. Com motor configurado, a lista tem UM
 * item — a consistência de voz dentro de uma conversa vale mais que a
 * disponibilidade marginal que um segundo provedor traria.
 *
 * Duas saídas dessa regra, e as duas são explícitas:
 *
 * - **`IA_ORDEM_PROVEDORES=gemini,openai`** manda em tudo. É o que o eval e
 *   o benchmark usam para medir um provedor específico sem deploy. Nome
 *   desconhecido é ignorado; se NENHUM nome resolver (typo em tudo), cai no
 *   padrão em vez de ficar sem motor — um erro de digitação não pode
 *   emudecer o atendimento.
 * - **Motor sem chave.** Se `OPENAI_API_KEY` não existe, não há o que
 *   preservar: a escolha passa a ser entre a voz de outro provedor e
 *   silêncio. A ordem antiga volta, com aviso no log — é uma configuração
 *   incompleta do ambiente, não um modo de operação.
 */
export function ordemDosProvedores(): Provedor[] {
  const bruto = (process.env.IA_ORDEM_PROVEDORES || "").trim();

  if (bruto) {
    const escolhidos: Provedor[] = [];
    for (const nome of bruto.split(",").map((n) => n.trim().toLowerCase())) {
      const p = PROVEDORES.find((x) => x.nome === nome);
      if (p && !escolhidos.includes(p)) escolhidos.push(p);
    }
    if (escolhidos.length > 0) return escolhidos;
  }

  const motor = PROVEDORES.find((p) => p.nome === MOTOR)!;
  if (motor.configurado()) return [motor];

  console.warn(
    `[ia] ${MOTOR.toUpperCase()}_API_KEY não configurada — o motor único está fora do ar. ` +
      `Usando os provedores de reserva, o que faz o tom da conversa mudar quando um deles falha. ` +
      `Configure a chave do motor para voltar ao normal.`,
  );
  return PROVEDORES.filter((p) => p.nome !== MOTOR);
}

export async function chamarLlmJson(
  prompt: string,
  opts?: { temperature?: number; orcamentoMs?: number },
): Promise<ResultadoLlm> {
  const orcamentoMs = opts?.orcamentoMs ?? ORCAMENTO_AGENTE_MS;
  const prazoFinal = Date.now() + orcamentoMs;

  const disponiveis = ordemDosProvedores().filter(
    (p) =>
      p.configurado() &&
      (p.cabe?.(prompt) ?? true) &&
      (!provedorForcado() || p.nome === provedorForcado()),
  );

  const tetoPorProvedor = Math.floor(
    orcamentoMs * (disponiveis.length === 1 ? FATIA_MOTOR_UNICO : FATIA_MAXIMA),
  );
  /*
   * Avisar quando um provedor com chave fica de fora por não caber. Sem
   * isto, o elo mais rápido da cascata some em silêncio — foi assim que a
   * Groq passou cinco versões de prompt fora do ar sem ninguém notar.
   *
   * Só quem está na ORDEM DO MOTOR conta: com motor único na OpenAI e a
   * chave da Groq no ambiente, avisar "groq PULADO" a cada chamada é ruído
   * sobre um provedor que nunca seria chamado.
   */
  for (const p of ordemDosProvedores()) {
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
 * Quem vai de fato atender, na ordem de tentativa. Usado em diagnóstico.
 *
 * Sai de `ordemDosProvedores`, e não da lista completa, por um motivo
 * prático: com motor único a resposta é `["openai"]` mesmo havendo quatro
 * chaves configuradas na Vercel. A tela precisa mostrar QUEM RESPONDE, não
 * quem tem chave — senão promete uma cascata que não existe mais, e o
 * corretor procura defeito no provedor errado.
 *
 * `prompt` é opcional de propósito: sem ele a resposta é a fila do motor;
 * COM ele, é "quem pode atender ESTA mensagem" — as duas divergem desde que
 * o prompt do agente passou do teto de tokens da Groq.
 */
export function provedoresDisponiveis(prompt?: string): string[] {
  return ordemDosProvedores()
    .filter((p) => p.configurado() && (prompt === undefined || (p.cabe?.(prompt) ?? true)))
    .map((p) => p.nome);
}

export function algumProvedorConfigurado(): boolean {
  return provedoresDisponiveis().length > 0;
}
