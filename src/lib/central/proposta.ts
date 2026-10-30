import { lerRespostaCurta } from "@/lib/agenda/comandos/respostasCurtas";

/**
 * A proposta e o "sim" (spec 3.0 e 4.3). Puro.
 *
 * Toda ação do central (grava, envia ou apaga) vira item de uma proposta: o
 * resumo do que vai acontecer, em português, que só roda depois do "sim". Um
 * pedido composto vira UMA proposta com os itens numerados e um "sim" só.
 *
 * A proposta vale 1 hora (decisão do dono). Ela é guardada à parte do
 * histórico: um "sim" 45 min depois confirma, mesmo com o histórico de 30 min
 * vencido. Qualquer outra mensagem vai ao cérebro com a proposta no contexto:
 * se ele montar outra (correção, "não, a renda é 6 mil"), a nova substitui; se
 * não montar, a antiga cai (outro pedido cancela).
 */

export const VALIDADE_DA_PROPOSTA_MS = 60 * 60 * 1000;

/**
 * `argumentos`: o que o cérebro pediu (texto, para o registro). `dados`: o
 * que `preparar` resolveu (ids), e é só isso que o "sim" executa.
 */
export type ItemDaProposta = {
  ferramenta: string;
  argumentos: Record<string, unknown>;
  resumo: string;
  dados: Record<string, unknown>;
};
export type Proposta = { itens: ItemDaProposta[]; criadaEm: string; expiraEm: string };

export function criarProposta(itens: ItemDaProposta[], agora: Date): Proposta {
  return {
    itens,
    criadaEm: agora.toISOString(),
    expiraEm: new Date(agora.getTime() + VALIDADE_DA_PROPOSTA_MS).toISOString(),
  };
}

export function textoDaProposta(p: Proposta): string {
  const corpo =
    p.itens.length === 1
      ? p.itens[0].resumo
      : p.itens.map((item, i) => `${i + 1}) ${item.resumo}`).join("\n");
  return `Vou fazer isto:\n${corpo}\n\nResponda *sim* para confirmar ou *não* para cancelar.`;
}

export type LeituraDaResposta = { tipo: "confirmar" } | { tipo: "cancelar" } | { tipo: "expirou" } | { tipo: "outro" };

export function lerRespostaAProposta(p: Proposta, texto: string, agora: Date): LeituraDaResposta {
  const curta = lerRespostaCurta(texto);
  const venceu = agora.getTime() > Date.parse(p.expiraEm);
  if (curta?.tipo === "sim") return venceu ? { tipo: "expirou" } : { tipo: "confirmar" };
  if (curta?.tipo === "nao") return { tipo: "cancelar" };
  return { tipo: "outro" };
}

/** Para o prompt do cérebro: a proposta que espera o "sim". */
export function propostaNoContexto(p: Proposta | null, agora: Date): string | null {
  if (!p || agora.getTime() > Date.parse(p.expiraEm)) return null;
  return `Há uma proposta esperando "sim": ${p.itens.map((i) => i.resumo).join("; ")}. Se a pessoa corrigir algo, monte a proposta de novo com a correção.`;
}
