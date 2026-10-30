import { AINDA_NAO, ONDA_ATUAL, ferramenta, textoDaAjuda } from "./ferramentas";
import type { MidiaDoPedido } from "./midia";
import type { ItemDaProposta } from "./proposta";
import { TRATADORES_DAS_ONDAS } from "./tratadores";

/**
 * Roda o que o cérebro pede (spec 4.3 e 4.4).
 *
 * O contexto (corretor, imobiliária, papel) vem da identificação, nunca do
 * cérebro. Consulta roda e responde; ação NÃO grava: vira item de proposta,
 * que só roda depois do "sim". O que é de onda futura, ou não tem tratador,
 * responde "ainda não sei".
 */

export type ContextoDoCentral = {
  corretorId: string;
  grupoId: string;
  papel: "corretor" | "gestor";
  nome: string;
  imobiliaria: string;
  /**
   * A foto (documento) ou a planilha que veio com o pedido (onda 2), posta
   * pela conversa, nunca pela IA. Só existe enquanto a mensagem é tratada:
   * quem precisa dela depois do "sim" guarda nos `dados` a referência (foto)
   * ou o que já leu (planilha), nunca o arquivo.
   */
  midia?: MidiaDoPedido;
};

export type Consulta = (ctx: ContextoDoCentral, argumentos: Record<string, unknown>) => Promise<unknown>;

/**
 * O que a ação faz ANTES do "sim" (onda 1). Os argumentos vêm do cérebro,
 * em texto ("o João"); `preparar` resolve no banco (qual João, de quem) e
 * devolve:
 * - `proposta`: o resumo que a pessoa confirma e os `dados` JÁ RESOLVIDOS
 *   (ids), que são o que `executar` recebe. O "sim" nunca reinterpreta texto;
 * - `resposta`: nada a gravar agora (ambiguidade "qual João?", lead que não
 *   é dele, falta o telefone inteiro, ou uma leitura como o resumo da IA do
 *   cliente). O resultado volta ao cérebro, que conversa com a pessoa.
 *
 * Nunca grava. Toda escrita fica em `executar`.
 */
export type Preparo =
  | { tipo: "proposta"; resumo: string; dados: Record<string, unknown> }
  | { tipo: "resposta"; resultado: unknown };

/**
 * O que a ação fez. `desfazer` é o que `Acao.desfazer` precisa para voltar
 * atrás (spec 4.6: até 24 h; lead cadastrado volta arquivado, campos e etapa
 * voltam ao valor anterior). Sem `desfazer`, a ação não tem volta.
 */
export type ResultadoDaAcao = { ok: boolean; texto: string; desfazer?: Record<string, unknown> };

export type Acao = {
  preparar: (ctx: ContextoDoCentral, argumentos: Record<string, unknown>) => Promise<Preparo>;
  executar: (ctx: ContextoDoCentral, dados: Record<string, unknown>) => Promise<ResultadoDaAcao>;
  desfazer?: (ctx: ContextoDoCentral, desfazer: Record<string, unknown>) => Promise<{ ok: boolean; texto: string }>;
};
export type Tratadores = { consultas: Record<string, Consulta>; acoes: Record<string, Acao> };

/**
 * Onda 0: só a ajuda. Os tratadores das ondas seguintes moram em
 * `tratadores/` e já entram aqui: o portão é a `onda` de cada ferramenta
 * contra `ONDA_ATUAL`, não a presença do tratador.
 */
export const TRATADORES: Tratadores = {
  consultas: { ajuda: async () => ({ texto: textoDaAjuda() }), ...TRATADORES_DAS_ONDAS.consultas },
  acoes: { ...TRATADORES_DAS_ONDAS.acoes },
};

export function criarExecutor(ctx: ContextoDoCentral, tratadores: Tratadores = TRATADORES, onda: number = ONDA_ATUAL) {
  const itensPropostos: ItemDaProposta[] = [];
  const executar = async (nome: string, argumentos: Record<string, unknown>): Promise<unknown> => {
    const f = ferramenta(nome);
    if (!f) return { erro: "Não conheço esse pedido." };
    if (f.soGestor && ctx.papel !== "gestor") return { erro: "Isso é só para o gestor da imobiliária." };
    if (f.onda > onda) return { aindaNao: true, mensagem: AINDA_NAO };
    try {
      if (f.tipo === "consulta") {
        const consulta = tratadores.consultas[nome];
        return consulta ? await consulta(ctx, argumentos) : { aindaNao: true, mensagem: AINDA_NAO };
      }
      const acao = tratadores.acoes[nome];
      if (!acao) return { aindaNao: true, mensagem: AINDA_NAO };
      const preparo = await acao.preparar(ctx, argumentos);
      if (preparo.tipo === "resposta") return preparo.resultado;
      itensPropostos.push({ ferramenta: nome, argumentos, resumo: preparo.resumo, dados: preparo.dados });
      return { proposto: true, resumo: preparo.resumo, aviso: "Nada foi feito ainda: a pessoa confirma com sim." };
    } catch {
      return { erro: "Não consegui fazer isso agora." };
    }
  };
  return { executar, itensPropostos };
}

/** Um item feito que tem volta: o que o "desfaz" (24 h) precisa. */
export type FeitoDesfazivel = { ferramenta: string; resumo: string; desfazer: Record<string, unknown> };

/** Roda os itens de uma proposta confirmada, um por um, com os dados resolvidos no `preparar`. */
export async function executarProposta(
  ctx: ContextoDoCentral,
  itens: ItemDaProposta[],
  tratadores: Tratadores = TRATADORES,
): Promise<{ resultados: { ok: boolean; texto: string }[]; desfaziveis: FeitoDesfazivel[] }> {
  const resultados: { ok: boolean; texto: string }[] = [];
  const desfaziveis: FeitoDesfazivel[] = [];
  for (const item of itens) {
    const acao = tratadores.acoes[item.ferramenta];
    if (!acao) {
      resultados.push({ ok: false, texto: AINDA_NAO });
      continue;
    }
    try {
      const r = await acao.executar(ctx, item.dados);
      resultados.push({ ok: r.ok, texto: r.texto });
      if (r.ok && r.desfazer && acao.desfazer) {
        desfaziveis.push({ ferramenta: item.ferramenta, resumo: item.resumo, desfazer: r.desfazer });
      }
    } catch {
      resultados.push({ ok: false, texto: `Não consegui: ${item.resumo}` });
    }
  }
  return { resultados, desfaziveis };
}
