// O custo da IA por grupo e por mês (plataforma, 21/10/2026).
//
// Módulo PURO: tokens somados do mês × preço do modelo × câmbio. A leitura
// (agregada no banco, 0233) mora em `src/lib/plataforma/saude.ts`.
//
// ESTIMATIVA, não fatura: o provedor cobra pelo que mede; aqui vale o que o
// livro do consumo gravou (`ia_consumo`, 0233: uma linha por chamada paga,
// de qualquer funcionalidade). Serve para o dono ver se a mensalidade de um
// grupo cobre a IA dele.

/**
 * Para que a IA foi chamada. Vocabulário FECHADO: quem chama um provedor
 * diz qual destas é, e a tela mostra o custo de cada uma. Finalidade nova
 * entra aqui e em `ROTULO_DA_FINALIDADE` (o banco só confere o formato).
 */
export type FinalidadeDaIa =
  | "atendimento"
  | "dossie"
  | "recusa"
  | "transcricao_audio"
  | "resumo_conversa"
  | "consultor"
  | "financeiro"
  | "retorno_ligacao"
  | "campanha"
  | "descricao_imovel"
  | "pdf_imovel"
  | "planta"
  | "tabela_precos"
  | "importacao_leads"
  | "email_recebido"
  | "agenda"
  | "arte_texto"
  | "arte_imagem"
  | "video"
  | "comando";

export const ROTULO_DA_FINALIDADE: Record<FinalidadeDaIa, string> = {
  atendimento: "Atendimento no WhatsApp",
  dossie: "Ficha do cliente (a cada mensagem)",
  recusa: "Leitura de recusa",
  transcricao_audio: "Transcrição de áudio",
  // Resumo da conversa + próximo passo, sob demanda na ficha (30/10/2026).
  resumo_conversa: "Resumo da conversa",
  consultor: "Consultor",
  financeiro: "Assistente do financeiro",
  retorno_ligacao: "Retorno da ligação",
  campanha: "Campanhas",
  descricao_imovel: "Descrição de imóvel",
  pdf_imovel: "Imóvel a partir de PDF",
  planta: "Leitura de planta",
  tabela_precos: "Tabela de preços",
  importacao_leads: "Importação de leads",
  email_recebido: "E-mail dos portais",
  agenda: "Agenda por mensagem",
  arte_texto: "Artes (texto do pedido)",
  arte_imagem: "Artes (imagem gerada)",
  video: "Vídeos",
  comando: "Comandos pelo WhatsApp (número central)",
};

/** O rótulo da finalidade; a telemetria antiga (antes da 0233) cai no nome cru. */
export function rotuloDaFinalidade(finalidade: string): string {
  return (ROTULO_DA_FINALIDADE as Record<string, string>)[finalidade] ?? finalidade;
}

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
  // Imagem — estimado por agregadores (29/10/2026), conferir em
  // openai.com/api/pricing: texto de entrada 5, imagem de entrada 8, saída 30.
  // A entrada fica no preço do texto: a saída é quase todo o custo da arte.
  "gpt-image-2": { entrada: 5, saida: 30 },
};

/**
 * Transcrição cobrada por DURAÇÃO, em USD por minuto. Conferir (29/10/2026):
 * OpenAI US$ 0,003/min; Groq US$ 0,04/hora, com mínimo de 10 s por chamada
 * (aplicado por quem grava, porque é por chamada e aqui só chega a soma).
 */
export const PRECO_POR_MINUTO_DE_AUDIO: Record<string, number> = {
  "gpt-4o-mini-transcribe": 0.003,
  "whisper-large-v3-turbo": 0.04 / 60,
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

export type TokensDoModelo = {
  modelo: string;
  tokensEntrada: number;
  tokensSaida: number;
  /** Duração cobrada, para os modelos de `PRECO_POR_MINUTO_DE_AUDIO`. */
  segundosDeAudio?: number;
  finalidade?: string;
  chamadas?: number;
};

export type CustoDaFinalidade = { finalidade: string; rotulo: string; chamadas: number; custoBrl: number };

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
  /** De onde vem o custo, da finalidade mais cara para a mais barata. */
  porFinalidade: CustoDaFinalidade[];
};

/** O custo em dólar de uma linha: duração quando o modelo cobra por minuto, senão tokens. */
function custoUsdDaLinha(t: TokensDoModelo, preco: PrecoDoModelo): number {
  const porMinuto = PRECO_POR_MINUTO_DE_AUDIO[nomeBase(t.modelo)];
  if (porMinuto !== undefined) return (Math.max(0, t.segundosDeAudio ?? 0) / 60) * porMinuto;
  return (Math.max(0, t.tokensEntrada) / 1_000_000) * preco.entrada + (Math.max(0, t.tokensSaida) / 1_000_000) * preco.saida;
}

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
  const finalidades = new Map<string, { chamadas: number; usd: number }>();
  for (const t of p.tokens) {
    const preco = precoDoModelo(t.modelo);
    const porMinuto = PRECO_POR_MINUTO_DE_AUDIO[nomeBase(t.modelo)] !== undefined;
    if (!preco.conhecido && !porMinuto && t.modelo !== "desconhecido" && t.modelo !== "nenhum") semPreco.add(t.modelo);
    const usd = custoUsdDaLinha(t, preco);
    custoUsd += usd;
    if (t.finalidade) {
      const f = finalidades.get(t.finalidade) ?? { chamadas: 0, usd: 0 };
      finalidades.set(t.finalidade, { chamadas: f.chamadas + (t.chamadas ?? 0), usd: f.usd + usd });
    }
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
    porFinalidade: [...finalidades.entries()]
      .map(([finalidade, f]) => ({ finalidade, rotulo: rotuloDaFinalidade(finalidade), chamadas: f.chamadas, custoBrl: f.usd * p.cambio }))
      .sort((a, b) => b.custoBrl - a.custoBrl || a.finalidade.localeCompare(b.finalidade)),
  };
}
