// "Resumo da conversa" + "Próximo passo sugerido" (IA no atendimento,
// 30/10/2026).
//
// O que já existia: o dossiê da IA (`lead_observacoes_ia`) com
// `resumo_executivo` e `proximo_passo_sugerido`, refeito a cada rajada pelo
// webhook. Ele continua — é a ficha da IA de atendimento. Só que ele foi
// escrito para IMOBILIÁRIA (o prompt diz "imobiliária"), sai em tópicos
// longos, e só é refeito quando o extrator roda (debounce, privacidade).
//
// Este resumo é para o PROFISSIONAL retomar a conversa em 10 segundos: três
// linhas fixas (o que o cliente quer, dúvidas/objeções, o que já foi
// combinado) e UMA ação concreta, no vocabulário do ramo da conta. É gerado
// SOB DEMANDA, quando alguém abre a ficha ou a conversa e chegaram mensagens
// desde o último resumo; o cache fica no lead (colunas da 0248).
//
// Módulo PURO: regra de quando refazer, prompt e leitura da resposta.

import { configDoRamo, nomeDoRamo, vocabularioDoRamo, type Ramo } from "@/lib/ramos/ramos";
import { TEXTO_NAO_GUARDADO } from "@/lib/whatsapp/privacidadeDaConversa";
import { ehMarcadorDeAudio } from "@/lib/whatsapp/transcricaoNoGrupo";
import type { RotuloDaNota } from "./notaDoLead";

export type ResumoDaConversa = {
  /** O que o cliente quer, numa frase. */
  quer: string;
  /** Dúvidas e objeções ainda abertas; `null` se nenhuma. */
  objecoes: string | null;
  /** O que já ficou combinado; `null` se nada. */
  combinado: string | null;
  /** UMA ação concreta para quem atende. */
  proximoPasso: string;
  /** A leitura da IA, que só REFINA a nota (`refinarComAIa`). */
  temperatura: RotuloDaNota | null;
};

/** O cache gravado no lead. */
export type CacheDoResumo = {
  resumo: ResumoDaConversa;
  /** Quando foi gerado. */
  geradoEm: string;
  /** A mensagem mais nova que ele cobre (`created_at`). */
  ate: string;
};

/** Teto de cada linha do cartão. */
export const TETO_DA_LINHA = 160;
/** Quantas falas vão para o modelo (as mais recentes). */
export const FALAS_NO_RESUMO = 40;
/** Teto do texto da conversa no prompt. */
export const TETO_DA_CONVERSA = 8000;
/** Intervalo mínimo entre dois resumos do mesmo lead, sozinho e pelo botão. */
export const INTERVALO_AUTOMATICO_MS = 10 * 60_000;
export const INTERVALO_DO_BOTAO_MS = 60_000;
/**
 * Resumos por dia por grupo. PROVISÓRIO (30/10/2026): ~R$ 0,005 cada com o
 * gpt-4.1-mini, então 300/dia é teto de ~R$ 1,50/dia por conta no pior caso.
 */
export const RESUMOS_POR_DIA = 300;

export type DecisaoDoResumo =
  /** Chama a IA. */
  | "gerar"
  /** Nada de novo desde o último resumo. */
  | "em_dia"
  /** Há mensagem nova, mas o último resumo é recente demais: usa o cache. */
  | "espera"
  /** Conversa curta demais para resumir. */
  | "sem_conversa"
  /** A cota de respostas do mês acabou, ou o grupo está suspenso. */
  | "sem_cota"
  /** O teto de resumos do dia do grupo foi atingido. */
  | "teto_do_dia";

/**
 * Refaz o resumo? A regra inteira, testada à parte:
 * - menos de duas falas na conversa: não há o que resumir;
 * - sem mensagem nova desde o cache: está em dia (o botão força, respeitando
 *   o intervalo do botão);
 * - com mensagem nova: refaz, mas no máximo uma vez a cada 10 min sozinho
 *   (abrir e fechar a ficha não pode virar uma chamada por clique);
 * - antes de chamar: cota do mês e teto do dia do grupo.
 */
export function decidirResumo(p: {
  cache: { geradoEm: string; ate: string } | null;
  ultimaMensagemEm: string | null;
  totalDeFalas: number;
  agora: Date;
  forcar: boolean;
  resumosHoje: number;
  tetoDoDia?: number;
  semCota: boolean;
  /**
   * A última TENTATIVA de gerar, com ou sem sucesso (revisão de 30/10/2026).
   * O intervalo contava só o resumo gravado: resposta da IA ilegível deixava
   * o cache como estava, e cada abertura da ficha chamava a IA de novo.
   */
  ultimaTentativaEm?: string | null;
}): DecisaoDoResumo {
  if (!p.ultimaMensagemEm || p.totalDeFalas < 2) return "sem_conversa";
  const novas = !p.cache || new Date(p.ultimaMensagemEm).getTime() > new Date(p.cache.ate).getTime();
  if (!novas && !p.forcar) return "em_dia";
  const ultimaVez = Math.max(
    p.cache ? new Date(p.cache.geradoEm).getTime() || 0 : 0,
    p.ultimaTentativaEm ? new Date(p.ultimaTentativaEm).getTime() || 0 : 0,
  );
  if (ultimaVez > 0) {
    const desde = p.agora.getTime() - ultimaVez;
    if (desde < (p.forcar ? INTERVALO_DO_BOTAO_MS : INTERVALO_AUTOMATICO_MS)) return novas ? "espera" : "em_dia";
  }
  if (p.semCota) return "sem_cota";
  if (p.resumosHoje >= (p.tetoDoDia ?? RESUMOS_POR_DIA)) return "teto_do_dia";
  return "gerar";
}

/** O cache está atrás da conversa (há fala que ele não viu)? */
export function resumoDesatualizado(cache: { ate: string } | null, ultimaMensagemEm: string | null): boolean {
  if (!ultimaMensagemEm) return false;
  if (!cache) return true;
  return new Date(ultimaMensagemEm).getTime() > new Date(cache.ate).getTime();
}

export type FalaDaConversa = { remetente: "cliente" | "bot" | "corretor"; texto: string; em: string };

/** Fala que não é fala: a linha sem texto guardado e os marcadores de áudio. */
function ehFalaDeVerdade(texto: string): boolean {
  const t = texto.trim();
  return t.length > 0 && t !== TEXTO_NAO_GUARDADO && !ehMarcadorDeAudio(t);
}

/** As falas que vão para o modelo: as mais recentes, em ordem de tempo. */
export function falasParaOResumo(mensagens: FalaDaConversa[]): FalaDaConversa[] {
  return [...mensagens]
    .filter((m) => ehFalaDeVerdade(m.texto))
    .sort((a, b) => a.em.localeCompare(b.em))
    .slice(-FALAS_NO_RESUMO);
}

/**
 * O prompt, no vocabulário do ramo: "cliente"/"paciente", "corretor"/
 * "advogado", "visita"/"consulta". Não toca o prompt do atendimento
 * (`promptDoRamo`): é outra chamada, com outro papel.
 */
export function montarPromptDoResumo(p: { ramo: Ramo; ramoDescricao?: string | null; falas: FalaDaConversa[] }): string {
  const v = vocabularioDoRamo(p.ramo);
  // A imobiliária não tem contexto de IA no ramo (o prompt dela é o de
  // sempre); o "Outro" com texto livre usa o que a conta escreveu.
  const descricao = p.ramo === "outro" && p.ramoDescricao ? nomeDoRamo(p.ramo, p.ramoDescricao) : null;
  const negocio = descricao
    ? `um negócio do ramo "${descricao}"`
    : (configDoRamo(p.ramo).ia?.negocio ?? `${v.empresa.genero === "f" ? "uma" : "um"} ${v.empresa.singular}`);
  const artigo = v.compromisso.genero === "f" ? "a" : "o";
  const quem = { cliente: maiuscula(v.cliente.singular), corretor: maiuscula(v.equipe.singular), bot: "Assistente (IA)" } as const;
  let conversa = p.falas.map((f) => `${quem[f.remetente]}: ${f.texto.replace(/\s+/g, " ").trim().slice(0, 400)}`).join("\n");
  if (conversa.length > TETO_DA_CONVERSA) conversa = conversa.slice(conversa.length - TETO_DA_CONVERSA);

  return `Você lê a conversa de WhatsApp entre um ${v.cliente.singular} e ${negocio}, e escreve para o ${v.equipe.singular} que vai continuar o atendimento.

Responda SÓ um objeto JSON:
{"quer": "...", "objecoes": "..." ou null, "combinado": "..." ou null, "proximoPasso": "...", "temperatura": "quente" | "morno" | "frio"}

Regras:
- "quer": uma frase, até ${TETO_DA_LINHA} caracteres, com o que o ${v.cliente.singular} procura (o ${v.oferta.singular}, prazo, faixa de valor) — só o que ele disse.
- "objecoes": dúvidas ou resistências que ele levantou e ainda não foram resolvidas, numa frase; null se não houver.
- "combinado": o que já ficou acertado (data d${artigo} ${v.compromisso.singular}, material a enviar, retorno prometido), numa frase; null se nada.
- "proximoPasso": UMA ação concreta para o ${v.equipe.singular} fazer, com verbo no infinitivo e quando. Exemplo de formato: "Ligar hoje para confirmar ${artigo} ${v.compromisso.singular} de sábado". Nunca sugira mensagem automática.
- "temperatura": "quente" se ele pediu o próximo passo ou marcou ${v.compromisso.singular}; "frio" se recusou ou parou de responder; "morno" no resto.
- Não invente nada que não esteja na conversa. Português do Brasil, sem emojis.

--- CONVERSA (da mais antiga para a mais recente) ---
${conversa}`;
}

function maiuscula(t: string): string {
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

function linha(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  if (!t || /^(null|nenhum[a]?|n\/a|-|—)\.?$/i.test(t)) return null;
  return t.length > TETO_DA_LINHA ? `${t.slice(0, TETO_DA_LINHA - 1).trimEnd()}…` : t;
}

/** A resposta do modelo, normalizada; `null` se faltar o essencial. */
export function lerSaidaDoResumo(bruto: unknown): ResumoDaConversa | null {
  const o = (bruto ?? {}) as Record<string, unknown>;
  const quer = linha(o.quer);
  const proximoPasso = linha(o.proximoPasso);
  if (!quer || !proximoPasso) return null;
  const t = o.temperatura;
  return {
    quer,
    objecoes: linha(o.objecoes),
    combinado: linha(o.combinado),
    proximoPasso,
    temperatura: t === "quente" || t === "morno" || t === "frio" ? t : null,
  };
}

/** O cache lido das colunas do lead (0248), validado. */
export function cacheDaLinha(linhaDoLead: {
  resumo_conversa?: unknown;
  resumo_conversa_em?: string | null;
  resumo_conversa_ate?: string | null;
}): CacheDoResumo | null {
  const resumo = lerSaidaDoResumo(linhaDoLead.resumo_conversa);
  if (!resumo || !linhaDoLead.resumo_conversa_em || !linhaDoLead.resumo_conversa_ate) return null;
  return { resumo, geradoEm: linhaDoLead.resumo_conversa_em, ate: linhaDoLead.resumo_conversa_ate };
}

/**
 * A última tentativa de resumo gravada no próprio `resumo_conversa`
 * (`tentativaEm`, revisão de 30/10/2026): sem coluna nova, e o resumo bom
 * continua lá quando a tentativa falha.
 */
export function tentativaDoResumo(resumoConversa: unknown): string | null {
  const t = (resumoConversa as { tentativaEm?: unknown } | null)?.tentativaEm;
  return typeof t === "string" && Number.isFinite(new Date(t).getTime()) ? t : null;
}

/** O `resumo_conversa` com a tentativa carimbada (o resumo anterior, se houver, fica). */
export function comTentativa(resumoConversa: unknown, em: string): Record<string, unknown> {
  const base =
    resumoConversa && typeof resumoConversa === "object" && !Array.isArray(resumoConversa)
      ? (resumoConversa as Record<string, unknown>)
      : {};
  return { ...base, tentativaEm: em };
}
