// O custo da IA por grupo e por mês (plataforma, 21/10/2026).
//
// Módulo PURO: tokens somados do mês × preço do modelo × câmbio. A leitura
// dos tokens (agregada no banco, 0211) mora em `src/lib/plataforma/saude.ts`.
//
// ESTIMATIVA, não fatura: o provedor cobra pelo que mede; aqui vale o que a
// telemetria gravou (`ia_interacoes.tokens_*`). Serve para o dono ver se a
// mensalidade de um grupo cobre a IA dele.

/** Preço público em dólar por 1 milhão de tokens. */
export type PrecoDoModelo = { entrada: number; saida: number };

/**
 * Preços por modelo, USD por 1M de tokens. Chave = nome do modelo SEM o
 * prefixo do provedor (`openai/gpt-oss-120b` casa `gpt-oss-120b`).
 *
 * CONFERIR com a página de preços de cada provedor antes de decidir preço de
 * plano: valores de tabela pública conhecidos em 21/10/2026; os marcados
 * "estimado" não tinham tabela confirmada e seguem o modelo irmão.
 */
export const PRECOS_POR_MODELO: Record<string, PrecoDoModelo> = {
  // OpenAI — conferir em openai.com/api/pricing (21/10/2026).
  "gpt-4.1-mini": { entrada: 0.4, saida: 1.6 },
  "gpt-4.1": { entrada: 2, saida: 8 },
  "gpt-4o-mini": { entrada: 0.15, saida: 0.6 },
  // Google — conferir em ai.google.dev/pricing (21/10/2026).
  "gemini-2.5-flash": { entrada: 0.3, saida: 2.5 },
  "gemini-3.5-flash": { entrada: 0.3, saida: 2.5 }, // estimado: igual ao 2.5 Flash
  "gemini-3.5-flash-lite": { entrada: 0.1, saida: 0.4 }, // estimado: igual ao 2.5 Flash-Lite
  // Groq — conferir em groq.com/pricing (21/10/2026).
  "gpt-oss-120b": { entrada: 0.15, saida: 0.75 },
  "gpt-oss-20b": { entrada: 0.1, saida: 0.5 },
  // NVIDIA (catálogo de teste, sem cobrança por token).
  "mistral-nemotron": { entrada: 0, saida: 0 },
};

/** Modelo sem preço na tabela: conta pelo motor padrão e avisa na tela. */
export const MODELO_DE_REFERENCIA = "gpt-4.1-mini";

/** Câmbio padrão se `CAMBIO_USD_BRL` não vier (ou vier inválido). Conferir. */
export const CAMBIO_PADRAO_USD_BRL = 5.5;

/** Acima desta fração da mensalidade, o custo da IA acende o alerta. */
export const LIMIAR_DE_CUSTO_DA_IA = 0.3;

/** O câmbio USD→BRL do ambiente (`CAMBIO_USD_BRL`, ponto ou vírgula decimal). */
export function cambioUsdBrl(env: Record<string, string | undefined> = process.env): number {
  const n = Number((env.CAMBIO_USD_BRL ?? "").trim().replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : CAMBIO_PADRAO_USD_BRL;
}

/** O nome do modelo sem prefixo de provedor, em minúsculas. */
function nomeBase(modelo: string): string {
  const m = modelo.trim().toLowerCase();
  return m.includes("/") ? m.slice(m.lastIndexOf("/") + 1) : m;
}

/** O preço do modelo; `conhecido: false` quando caiu no modelo de referência. */
export function precoDoModelo(modelo: string): PrecoDoModelo & { conhecido: boolean } {
  const base = nomeBase(modelo);
  const direto = PRECOS_POR_MODELO[base];
  if (direto) return { ...direto, conhecido: true };
  // Versões datadas (`gpt-4.1-mini-2025-04-14`): o maior nome da tabela que é prefixo.
  const prefixo = Object.keys(PRECOS_POR_MODELO)
    .filter((k) => base.startsWith(`${k}-`))
    .sort((a, b) => b.length - a.length)[0];
  if (prefixo) return { ...PRECOS_POR_MODELO[prefixo], conhecido: true };
  return { ...PRECOS_POR_MODELO[MODELO_DE_REFERENCIA], conhecido: false };
}

export type TokensDoModelo = { modelo: string; tokensEntrada: number; tokensSaida: number };

export type CustoDaIa = {
  custoUsd: number;
  custoBrl: number;
  /** Em reais; `null` sem nenhuma resposta no mês. */
  custoPorResposta: number | null;
  /** Mensalidade − custo, em reais; `null` sem mensalidade (plano de custo). */
  margem: number | null;
  /** Custo ÷ mensalidade (0–1+); `null` sem mensalidade. */
  fracaoDaMensalidade: number | null;
  /** O custo passou de 30% da mensalidade. */
  alerta: boolean;
  /** Modelos sem preço na tabela (contados pelo de referência). */
  modelosSemPreco: string[];
};

/** A conta toda: tokens do mês por modelo → custo, custo por resposta e margem. */
export function custoDaIa(p: {
  tokens: TokensDoModelo[];
  /** Respostas da IA no mês (a cota). */
  respostas: number;
  /** Mensalidade em reais; `null`/0 = não cobrada. */
  mensalidade: number | null;
  cambio: number;
}): CustoDaIa {
  let custoUsd = 0;
  const semPreco = new Set<string>();
  for (const t of p.tokens) {
    const preco = precoDoModelo(t.modelo);
    if (!preco.conhecido && t.modelo !== "desconhecido" && t.modelo !== "nenhum") semPreco.add(t.modelo);
    custoUsd += (Math.max(0, t.tokensEntrada) / 1_000_000) * preco.entrada;
    custoUsd += (Math.max(0, t.tokensSaida) / 1_000_000) * preco.saida;
  }
  const custoBrl = custoUsd * p.cambio;
  const mensalidade = p.mensalidade !== null && p.mensalidade > 0 ? p.mensalidade : null;
  const fracao = mensalidade !== null ? custoBrl / mensalidade : null;
  return {
    custoUsd,
    custoBrl,
    custoPorResposta: p.respostas > 0 ? custoBrl / p.respostas : null,
    margem: mensalidade !== null ? mensalidade - custoBrl : null,
    fracaoDaMensalidade: fracao,
    alerta: fracao !== null && fracao > LIMIAR_DE_CUSTO_DA_IA,
    modelosSemPreco: [...semPreco].sort(),
  };
}
