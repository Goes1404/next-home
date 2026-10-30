import { AINDA_NAO, ONDA_ATUAL, ferramenta, textoDaAjuda } from "./ferramentas";
import type { ItemDaProposta } from "./proposta";

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
};

export type Consulta = (ctx: ContextoDoCentral, argumentos: Record<string, unknown>) => Promise<unknown>;
export type Acao = {
  /** O resumo em português que a pessoa confirma com "sim". */
  resumir: (argumentos: Record<string, unknown>) => string;
  executar: (ctx: ContextoDoCentral, argumentos: Record<string, unknown>) => Promise<{ ok: boolean; texto: string }>;
};
export type Tratadores = { consultas: Record<string, Consulta>; acoes: Record<string, Acao> };

/** Onda 0: só a ajuda. Nenhuma ação grava nada. */
export const TRATADORES: Tratadores = {
  consultas: { ajuda: async () => ({ texto: textoDaAjuda() }) },
  acoes: {},
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
      const resumo = acao.resumir(argumentos);
      itensPropostos.push({ ferramenta: nome, argumentos, resumo });
      return { proposto: true, resumo, aviso: "Nada foi feito ainda: a pessoa confirma com sim." };
    } catch {
      return { erro: "Não consegui fazer isso agora." };
    }
  };
  return { executar, itensPropostos };
}

/** Roda os itens de uma proposta confirmada, um por um. */
export async function executarProposta(
  ctx: ContextoDoCentral,
  itens: ItemDaProposta[],
  tratadores: Tratadores = TRATADORES,
): Promise<{ ok: boolean; texto: string }[]> {
  const resultados: { ok: boolean; texto: string }[] = [];
  for (const item of itens) {
    const acao = tratadores.acoes[item.ferramenta];
    if (!acao) {
      resultados.push({ ok: false, texto: AINDA_NAO });
      continue;
    }
    try {
      resultados.push(await acao.executar(ctx, item.argumentos));
    } catch {
      resultados.push({ ok: false, texto: `Não consegui: ${item.resumo}` });
    }
  }
  return resultados;
}
