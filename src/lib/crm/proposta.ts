/**
 * Proposta por link (0123, 26/09/2026) — regras puras.
 *
 * O corretor escreve imóvel, unidade, valor e condição; o cliente abre no
 * celular e responde "aceito" ou "quero conversar". O valor é escrito pelo
 * CORRETOR, nunca pela IA: a regra "a IA não fala valores" continua de pé.
 *
 * O que viaja no link é só o que o cliente precisa ver. Renda, dossiê e
 * observação interna nunca entram em `dados`: o link pode ser encaminhado
 * a quem decide junto.
 */

export const TETO_CONDICAO = 600;
export const VALIDADES_DA_PROPOSTA = [3, 7, 15] as const;

export type DadosDaProposta = {
  imovel: string;
  empreendimentoId: string | null;
  unidade: string | null;
  valor: number;
  condicao: string;
  validaAte: string;
};

export type EntradaDaProposta = {
  imovel: unknown;
  empreendimentoId?: unknown;
  unidade?: unknown;
  valor: unknown;
  condicao: unknown;
  validadeDias: unknown;
};

/** Valida o que chega pela rede. Devolve o motivo ou os dados prontos. */
export function validarProposta(e: EntradaDaProposta, agora = new Date()): { erro: string } | { dados: DadosDaProposta } {
  const imovel = typeof e.imovel === "string" ? e.imovel.trim() : "";
  if (imovel.length < 2 || imovel.length > 120) return { erro: "Escreva o nome do imóvel." };
  const valor = typeof e.valor === "number" ? e.valor : Number(e.valor);
  if (!Number.isFinite(valor) || valor < 10_000 || valor > 100_000_000) {
    return { erro: "Informe o valor total da proposta." };
  }
  const condicao = typeof e.condicao === "string" ? e.condicao.trim() : "";
  if (condicao.length < 5) return { erro: "Escreva a condição (entrada, parcelas, financiamento)." };
  if (condicao.length > TETO_CONDICAO) return { erro: `A condição passa de ${TETO_CONDICAO} caracteres.` };
  const dias = Number(e.validadeDias);
  if (!(VALIDADES_DA_PROPOSTA as readonly number[]).includes(dias)) return { erro: "Escolha a validade da proposta." };
  const unidade = typeof e.unidade === "string" && e.unidade.trim() ? e.unidade.trim().slice(0, 40) : null;
  const empreendimentoId =
    typeof e.empreendimentoId === "string" && /^[0-9a-f-]{36}$/i.test(e.empreendimentoId) ? e.empreendimentoId : null;

  return {
    dados: {
      imovel,
      empreendimentoId,
      unidade,
      valor: Math.round(valor),
      condicao,
      validaAte: new Date(agora.getTime() + dias * 86_400_000).toISOString(),
    },
  };
}

/** Lê `dados` do link de volta, sem confiar na forma. */
export function lerProposta(dados: Record<string, unknown>): DadosDaProposta | null {
  const valor = Number(dados.valor);
  if (typeof dados.imovel !== "string" || !Number.isFinite(valor) || typeof dados.condicao !== "string") return null;
  return {
    imovel: dados.imovel,
    empreendimentoId: typeof dados.empreendimentoId === "string" ? dados.empreendimentoId : null,
    unidade: typeof dados.unidade === "string" ? dados.unidade : null,
    valor,
    condicao: dados.condicao,
    validaAte: typeof dados.validaAte === "string" ? dados.validaAte : new Date(0).toISOString(),
  };
}

export function propostaVencida(p: Pick<DadosDaProposta, "validaAte">, agora = new Date()): boolean {
  return new Date(p.validaAte).getTime() <= agora.getTime();
}

export type RespostaDaProposta = "aceitou" | "quer_conversar";

/** A resposta mais recente do cliente vale; "aceito" depois de "conversar" é avanço. */
export function ultimaResposta(eventos: Array<{ tipo: string; created_at: string }>): RespostaDaProposta | null {
  const r = eventos
    .filter((e) => e.tipo === "aceitou" || e.tipo === "quer_conversar")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .at(-1);
  return (r?.tipo as RespostaDaProposta | undefined) ?? null;
}
