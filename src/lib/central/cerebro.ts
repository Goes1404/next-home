import "server-only";

import { registrarConsumoDaIa, type QuemPagaAIa } from "@/lib/planos/consumoDaIa";
import { precoDoModelo } from "@/lib/planos/custoDaIa";

/**
 * O cérebro do número central (spec 4.3): um cliente da OpenAI com
 * FERRAMENTAS e HISTÓRICO.
 *
 * A IA de hoje (`chamarLlmJson`) devolve um JSON por chamada, sem histórico e
 * sem ferramentas. O central precisa escolher entre as 33 capacidades da
 * spec, conversar em várias mensagens e encadear consultas, então fala com
 * `/v1/chat/completions` direto, com `tools` e `tool_choice: "auto"`.
 *
 * Nunca lança: erro, timeout ou falta de crédito (aconteceu em 27/10/2026)
 * viram `{ ok: false, indisponivel: true }`, e quem chama responde "estou
 * indisponível agora" em vez de ficar mudo (spec 7.2).
 */

const BASE_URL = "https://api.openai.com/v1/chat/completions";
/** Teto de idas e voltas com ferramentas por mensagem do corretor. */
export const MAXIMO_DE_VOLTAS = 4;
/** O orçamento da mensagem inteira (todas as voltas). */
export const ORCAMENTO_PADRAO_MS = 25_000;
/**
 * Primeira linha com chamada de ferramentas (decisão do dono, spec 4.3).
 * O valor final sai do eval (`npm run eval:central`) e vai na variável
 * `CENTRAL_MODELO`.
 */
export const MODELO_PADRAO = "gpt-4.1";

export type MensagemDoHistorico = { papel: "pessoa" | "central"; texto: string; em: string };

export type DeclaracaoDeFerramenta = {
  nome: string;
  descricao: string;
  parametros: Record<string, unknown>;
};

export type ChamadaFeita = { nome: string; argumentos: Record<string, unknown>; resultado: unknown };

export type ResultadoDoCerebro =
  | {
      ok: true;
      texto: string;
      chamadas: ChamadaFeita[];
      modelo: string;
      tokensEntrada: number;
      tokensSaida: number;
      custoUsd: number;
    }
  | { ok: false; indisponivel: true; motivo: string; chamadas: ChamadaFeita[]; custoUsd: number };

/**
 * A foto que o corretor mandou (onda 1, capacidade 3), já baixada e conferida
 * pela conversa (tipo e tamanho). Vai só nesta mensagem: nunca entra no
 * histórico guardado nem no registro.
 */
export type ImagemDoCerebro = { base64: string; mimeType: "image/jpeg" | "image/png" | "image/webp" };

/**
 * `high`, não `low`: com `low` a foto chega ao modelo em 512 px, e um print de
 * conversa (720×1600) vira letra de 5 px, telefone ilegível. O que a foto
 * precisa entregar é justamente o número inteiro. Medida da OpenAI: um print
 * desses dá ~8 blocos de 512 px, ~1.450 tokens de entrada por volta (centavos
 * no gpt-4.1, dentro dos R$ 0,05–0,15 por comando da spec 7.1), contra 85 do
 * `low`. Contado pelo `prompt_tokens` de cada volta, como o resto.
 */
export const DETALHE_DA_FOTO = "high" as const;

type ParteDoConteudo =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: typeof DETALHE_DA_FOTO } };

type MensagemDaApi =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ParteDoConteudo[] }
  | { role: "assistant"; content: string | null; tool_calls?: ChamadaDaApi[] }
  | { role: "tool"; tool_call_id: string; content: string };

type ChamadaDaApi = { id: string; type: "function"; function: { name: string; arguments: string } };

export type EntradaDoCerebro = {
  sistema: string;
  historico: MensagemDoHistorico[];
  mensagem: string;
  /** A foto desta mensagem; `mensagem` leva a legenda. */
  imagem?: ImagemDoCerebro;
  ferramentas: DeclaracaoDeFerramenta[];
  /** Roda a ferramenta pedida. Nunca deve lançar; o erro vira resultado. */
  executar: (nome: string, argumentos: Record<string, unknown>) => Promise<unknown>;
  quemPaga: QuemPagaAIa;
  orcamentoMs?: number;
  modelo?: string;
  /** Para os testes. */
  fetchImpl?: typeof fetch;
  /** Para os testes. */
  registrar?: typeof registrarConsumoDaIa;
};

export function modeloDoCentral(): string {
  return process.env.CENTRAL_MODELO?.trim() || MODELO_PADRAO;
}

function custoUsd(modelo: string, entrada: number, saida: number): number {
  const preco = precoDoModelo(modelo);
  return (entrada * preco.entrada + saida * preco.saida) / 1_000_000;
}

/** Sem foto, o texto puro (o corpo de sempre); com foto, a legenda e a imagem em data URL. */
function conteudoDaMensagem(e: EntradaDoCerebro): string | ParteDoConteudo[] {
  if (!e.imagem) return e.mensagem;
  return [
    { type: "text", text: e.mensagem },
    { type: "image_url", image_url: { url: `data:${e.imagem.mimeType};base64,${e.imagem.base64}`, detail: DETALHE_DA_FOTO } },
  ];
}

export async function pensar(e: EntradaDoCerebro): Promise<ResultadoDoCerebro> {
  const chamadas: ChamadaFeita[] = [];
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, indisponivel: true, motivo: "sem_api_key", chamadas, custoUsd: 0 };

  const modelo = e.modelo || modeloDoCentral();
  const familiaNova = /^(gpt-5|o[34])/.test(modelo);
  const fazerFetch = e.fetchImpl ?? fetch;
  const registrar: typeof registrarConsumoDaIa = e.registrar ?? ((uso, gasto) => registrarConsumoDaIa(uso, gasto));
  const prazo = Date.now() + (e.orcamentoMs ?? ORCAMENTO_PADRAO_MS);

  const mensagens: MensagemDaApi[] = [
    { role: "system", content: e.sistema },
    ...e.historico.map(
      (h): MensagemDaApi =>
        h.papel === "pessoa" ? { role: "user", content: h.texto } : { role: "assistant", content: h.texto },
    ),
    { role: "user", content: conteudoDaMensagem(e) },
  ];
  const tools = e.ferramentas.map((f) => ({
    type: "function" as const,
    function: { name: f.nome, description: f.descricao, parameters: f.parametros },
  }));

  let tokensEntrada = 0;
  let tokensSaida = 0;

  for (let volta = 0; volta < MAXIMO_DE_VOLTAS; volta++) {
    const restante = prazo - Date.now();
    if (restante <= 0) {
      return { ok: false, indisponivel: true, motivo: "timeout", chamadas, custoUsd: custoUsd(modelo, tokensEntrada, tokensSaida) };
    }

    let corpo: {
      choices?: { message?: { content?: string | null; tool_calls?: ChamadaDaApi[] } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      const controle = new AbortController();
      const relogio = setTimeout(() => controle.abort(), restante);
      const res = await fazerFetch(BASE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: controle.signal,
        body: JSON.stringify({
          model: modelo,
          messages: mensagens,
          ...(tools.length > 0 ? { tools, tool_choice: "auto", parallel_tool_calls: true } : {}),
          ...(familiaNova ? { max_completion_tokens: 2048 } : { max_tokens: 2048, temperature: 0.2 }),
        }),
      });
      clearTimeout(relogio);
      if (!res.ok) {
        const texto = await res.text().catch(() => "");
        const motivo =
          res.status === 429 && /insufficient_quota|credits/i.test(texto) ? "sem_credito" : `http_${res.status}`;
        return { ok: false, indisponivel: true, motivo, chamadas, custoUsd: custoUsd(modelo, tokensEntrada, tokensSaida) };
      }
      corpo = await res.json();
    } catch (erro) {
      const abortou = erro instanceof Error && erro.name === "AbortError";
      return {
        ok: false,
        indisponivel: true,
        motivo: abortou ? "timeout" : "rede",
        chamadas,
        custoUsd: custoUsd(modelo, tokensEntrada, tokensSaida),
      };
    }

    const entrada = corpo.usage?.prompt_tokens ?? 0;
    const saida = corpo.usage?.completion_tokens ?? 0;
    tokensEntrada += entrada;
    tokensSaida += saida;
    // O livro do consumo (0233): uma linha por volta, com o que ela gastou.
    await registrar({ finalidade: "comando", quemPaga: e.quemPaga }, { modelo, tokensEntrada: entrada, tokensSaida: saida }).catch(
      () => undefined,
    );

    const mensagem = corpo.choices?.[0]?.message;
    const pedidas = mensagem?.tool_calls ?? [];
    if (pedidas.length === 0) {
      const texto = (mensagem?.content ?? "").trim();
      if (!texto) {
        return { ok: false, indisponivel: true, motivo: "resposta_vazia", chamadas, custoUsd: custoUsd(modelo, tokensEntrada, tokensSaida) };
      }
      return { ok: true, texto, chamadas, modelo, tokensEntrada, tokensSaida, custoUsd: custoUsd(modelo, tokensEntrada, tokensSaida) };
    }

    mensagens.push({ role: "assistant", content: mensagem?.content ?? null, tool_calls: pedidas });
    for (const pedida of pedidas) {
      let argumentos: Record<string, unknown> = {};
      let resultado: unknown;
      try {
        argumentos = JSON.parse(pedida.function.arguments || "{}") as Record<string, unknown>;
        resultado = await e.executar(pedida.function.name, argumentos);
      } catch {
        resultado = { erro: "Não consegui ler o pedido dessa ação." };
      }
      chamadas.push({ nome: pedida.function.name, argumentos, resultado });
      mensagens.push({ role: "tool", tool_call_id: pedida.id, content: JSON.stringify(resultado ?? null) });
    }
  }

  // Quatro voltas sem fechar a resposta: pede para refazer em vez de inventar.
  return {
    ok: true,
    texto: "Não consegui terminar esse pedido. Pode repetir de outro jeito, um pedido por vez?",
    chamadas,
    modelo,
    tokensEntrada,
    tokensSaida,
    custoUsd: custoUsd(modelo, tokensEntrada, tokensSaida),
  };
}
