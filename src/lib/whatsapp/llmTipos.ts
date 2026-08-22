/**
 * Vocabulário comum aos provedores de IA.
 *
 * Mora fora dos adaptadores porque a lógica aqui é de HTTP e de decisão, não
 * de fornecedor: um 429 é cota estourada tanto no Gemini quanto na NVIDIA, e
 * quem chama não deveria precisar saber com quem falou para entender por que
 * falhou.
 */

/** Por que a chamada falhou, em vocabulário fechado. */
export type MotivoFalhaLlm =
  | "sem_api_key"
  | "timeout"
  | "http_4xx"
  | "http_429"
  | "http_5xx"
  | "resposta_vazia"
  | "json_invalido"
  | "desconhecido";

export type ResultadoLlm =
  | {
      ok: true;
      json: unknown;
      latenciaMs: number;
      tokensEntrada: number | null;
      tokensSaida: number | null;
      /** Quem de fato respondeu — vai para `ia_interacoes.modelo`. */
      modelo: string;
    }
  | { ok: false; erro: MotivoFalhaLlm; detalhe?: string; latenciaMs: number };

/** Traduz o status HTTP para o vocabulário fechado de `MotivoFalhaLlm`. */
export function motivoDoStatus(status: number): MotivoFalhaLlm {
  if (status === 429) return "http_429";
  if (status >= 400 && status < 500) return "http_4xx";
  if (status >= 500) return "http_5xx";
  return "desconhecido";
}

/**
 * Só vale repetir NO MESMO provedor o que falha rápido.
 *
 * Timeout já consumiu o orçamento; cota e chave inválida dariam a mesma
 * resposta. Nesses casos o certo não é insistir, é passar a vez para o
 * outro provedor — que é o que a cascata em `llm.ts` faz.
 */
export function valeRetentar(motivo: MotivoFalhaLlm): boolean {
  return motivo === "http_5xx" || motivo === "resposta_vazia" || motivo === "desconhecido";
}

/**
 * Isola o JSON de uma resposta em texto livre.
 *
 * O Gemini aceita `responseMimeType: "application/json"` e devolve JSON
 * limpo por contrato. A API da NVIDIA é OpenAI-compatível, mas
 * `response_format` NÃO é suportado por todo modelo do catálogo — então a
 * resposta pode vir embrulhada em cerca de código (```json), com uma frase
 * de cortesia antes ("Claro! Aqui está:"), ou as duas coisas.
 *
 * Como todo o contrato do agente é JSON, esta função é a diferença entre
 * "a NVIDIA respondeu" e "caiu em contingência à toa". Daí a busca por
 * chaves BALANCEADAS em vez de um regex guloso: o JSON do agente tem
 * objetos aninhados (`visitaProposta`, `anexosMidia`), e `/\{.*\}/` pegaria
 * lixo em volta ou pararia no primeiro `}` interno.
 */
export function extrairJsonDeTexto(bruto: string): unknown | null {
  const texto = bruto.trim();
  if (!texto) return null;

  const tentar = (candidato: string): unknown | null => {
    try {
      return JSON.parse(candidato);
    } catch {
      return null;
    }
  };

  const direto = tentar(texto);
  if (direto !== null) return direto;

  // Cerca de código, com ou sem a linguagem anotada.
  const cerca = texto.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cerca) {
    const dentro = tentar(cerca[1].trim());
    if (dentro !== null) return dentro;
  }

  // Último recurso: o primeiro objeto de chaves balanceadas do texto,
  // ignorando chaves que estejam dentro de strings ou escapadas.
  const inicio = texto.indexOf("{");
  if (inicio === -1) return null;

  let profundidade = 0;
  let emString = false;
  let escapado = false;

  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];

    if (escapado) {
      escapado = false;
      continue;
    }
    if (c === "\\") {
      escapado = true;
      continue;
    }
    if (c === '"') {
      emString = !emString;
      continue;
    }
    if (emString) continue;

    if (c === "{") profundidade++;
    else if (c === "}") {
      profundidade--;
      if (profundidade === 0) return tentar(texto.slice(inicio, i + 1));
    }
  }

  return null;
}
