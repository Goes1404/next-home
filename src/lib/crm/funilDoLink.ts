import { ehClienteDePessoa } from "@/lib/whatsapp/medicaoDoLink";

/**
 * Do clique à conversa (0159, 05/10/2026): onde o clique no link se perde.
 *
 * Função pura sobre o que a tela já leu do banco. Os degraus, em ordem:
 *
 *   cliques de pessoa → pessoas → escreveram ao corretor → viraram lead
 *
 * "Escreveram" junta quem mandou a mensagem pronta (virou lead) e quem
 * escreveu outra coisa logo depois do clique e foi ignorado pelo porteiro.
 * O número de pessoas que escreveram sem a mensagem pronta é um teto: o
 * número do corretor é o pessoal dele, e um conhecido que escreve logo
 * depois de um clique cai na mesma conta. A linha de comparação
 * (`semCliquePorDia`) diz quanto desse ruído acontece num dia comum.
 */

/** Até quantos minutos depois do clique a mensagem conta como de quem clicou. A mesma janela da 0143. */
export const JANELA_DEPOIS_DO_CLIQUE_MIN = 15;

export type CliqueLido = {
  id: string;
  origem: string;
  created_at: string;
  user_agent: string | null;
  visitante: string | null;
  lead_id: string | null;
  /** Toque de pessoa (0174). Ausente ou nulo: vale o filtro de navegador. */
  de_pessoa?: boolean | null;
};

export type BarradoLido = {
  dia: string;
  minutos_desde_clique: number | null;
  clique_id: string | null;
  citou_imovel: boolean;
};

export type LinhaDoFunil = {
  /** `anuncio/<slug>` vira o slug; todo botão do site vira uma linha só. */
  chave: string;
  rotulo: string;
  doAnuncio: boolean;
  cliques: number;
  /** Nulo quando nenhum clique da linha tem o resumo de pessoa (cliques de antes de 05/10). */
  pessoas: number | null;
  leads: number;
  escreveramSemAMensagem: number;
  citaramOImovel: number;
};

export type FunilDoLink = {
  linhas: LinhaDoFunil[];
  total: Omit<LinhaDoFunil, "chave" | "rotulo" | "doAnuncio">;
  /** Média de números desconhecidos por dia que escreveram sem clique nenhum por perto. */
  semCliquePorDia: number;
  dias: number;
};

function chaveDaOrigem(origem: string): { chave: string; doAnuncio: boolean } {
  if (origem.startsWith("anuncio/")) return { chave: origem.slice("anuncio/".length) || "anuncio", doAnuncio: true };
  return { chave: "site", doAnuncio: false };
}

export function montarFunilDoLink(p: {
  cliques: CliqueLido[];
  barrados: BarradoLido[];
  nomes: Record<string, string>;
  dias: number;
}): FunilDoLink {
  const dePessoa = p.cliques.filter((c) => c.de_pessoa ?? ehClienteDePessoa(c.user_agent));
  const chavePorClique = new Map<string, string>();
  const grupos = new Map<string, { doAnuncio: boolean; cliques: CliqueLido[] }>();
  for (const c of dePessoa) {
    const { chave, doAnuncio } = chaveDaOrigem(c.origem);
    chavePorClique.set(c.id, chave);
    const g = grupos.get(chave) ?? { doAnuncio, cliques: [] };
    g.cliques.push(c);
    grupos.set(chave, g);
  }

  const escreveram = new Map<string, { total: number; citaram: number }>();
  let semClique = 0;
  for (const b of p.barrados) {
    if (b.minutos_desde_clique === null) {
      semClique += 1;
      continue;
    }
    if (b.minutos_desde_clique > JANELA_DEPOIS_DO_CLIQUE_MIN || !b.clique_id) continue;
    const chave = chavePorClique.get(b.clique_id);
    if (!chave) continue;
    const atual = escreveram.get(chave) ?? { total: 0, citaram: 0 };
    escreveram.set(chave, { total: atual.total + 1, citaram: atual.citaram + (b.citou_imovel ? 1 : 0) });
  }

  const pessoasDe = (cliques: CliqueLido[]): number | null => {
    const comResumo = cliques.filter((c) => c.visitante);
    if (comResumo.length === 0) return null;
    return new Set(comResumo.map((c) => c.visitante)).size;
  };

  const linhas: LinhaDoFunil[] = [...grupos.entries()]
    .map(([chave, g]) => ({
      chave,
      rotulo: g.doAnuncio ? (p.nomes[chave] ?? chave) : "Botões do site",
      doAnuncio: g.doAnuncio,
      cliques: g.cliques.length,
      pessoas: pessoasDe(g.cliques),
      leads: g.cliques.filter((c) => c.lead_id).length,
      escreveramSemAMensagem: escreveram.get(chave)?.total ?? 0,
      citaramOImovel: escreveram.get(chave)?.citaram ?? 0,
    }))
    .sort((a, b) => Number(b.doAnuncio) - Number(a.doAnuncio) || b.cliques - a.cliques);

  const soma = (k: "cliques" | "leads" | "escreveramSemAMensagem" | "citaramOImovel") =>
    linhas.reduce((t, l) => t + l[k], 0);

  return {
    linhas,
    total: {
      cliques: soma("cliques"),
      pessoas: pessoasDe(dePessoa),
      leads: soma("leads"),
      escreveramSemAMensagem: soma("escreveramSemAMensagem"),
      citaramOImovel: soma("citaramOImovel"),
    },
    semCliquePorDia: p.dias > 0 ? Math.round((semClique / p.dias) * 10) / 10 : 0,
    dias: p.dias,
  };
}

/** "de cada 100 pessoas, N" — abaixo de 20 pessoas, contagem e não porcentagem. */
export function proporcao(parte: number, todo: number | null): string | null {
  if (!todo || todo < 20) return null;
  return `${Math.round((parte / todo) * 1000) / 10}%`.replace(".", ",");
}
