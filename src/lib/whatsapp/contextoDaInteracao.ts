import type { Jogada } from "./jogada";
import type { Fala } from "./rajada";
import type { DossieClienteIA } from "./types";

/**
 * Por que a IA disse aquilo — o que falta para o corretor julgar um balão.
 *
 * `ia_interacoes` guardava modelo, latência, versão do prompt e contadores de
 * anexo: tudo sobre a MECÂNICA da resposta, nada sobre a DECISÃO. Quem abre o
 * Live Chat para dar 👍/👎 julgava o texto sozinho, sem saber qual imóvel
 * estava em foco, o que o planner mandou fazer, o que ela sabia do cliente,
 * nem quanto do histórico chegou até ela.
 *
 * **Não é o prompt.** Guardar os ~35 mil caracteres por resposta seria caro,
 * ilegível no celular e — o que decide — não responde à pergunta dele. Ele
 * quer a decisão, não a transcrição da instrução.
 *
 * `emBranco` é o campo que costuma explicar a queixa: falas gravadas sem
 * texto, que a IA não teve como ler (conversa retravada — ver
 * `privacidadeDaConversa.ts`). Sem esse número, "a IA não considerou o que eu
 * disse" e "a IA não RECEBEU o que você disse" são a mesma frase na tela — e
 * pedem correções opostas.
 *
 * Ele conta a CONVERSA inteira, não a janela, e desde a 0106 isso é o único
 * jeito de ele significar alguma coisa: a consulta da janela passou a
 * DESCARTAR a marca (ela gastava linha sem ensinar nada), então contá-la
 * dentro da janela daria zero para sempre — e número que vive em zero ensina
 * a ignorar o número.
 *
 * Módulo PURO: nenhum import de servidor, nada de banco. É o que permite
 * testá-lo sem ambiente e o que garante que a conta da tela e a conta da
 * gravação sejam a mesma.
 */
export type ContextoDaInteracao = {
  /** O imóvel que ela estava tratando, ou nada — aí ela falava do catálogo. */
  foco: { slug: string; nome: string } | null;
  /** O que o planner (`jogada.ts`) mandou fazer nesta mensagem. */
  jogada: Jogada;
  /**
   * O que ela sabia do cliente NO MOMENTO. Só os cinco campos que decidem a
   * conversa; o resumo executivo e a temperatura ficam de fora porque são
   * leitura da IA sobre a IA, e o que se julga aqui é a resposta.
   */
  dossie: {
    regiao: string | null;
    dormitorios: number | null;
    orcamentoMax: number | null;
    rendaMensal: number | null;
    formaPagamento: string | null;
  } | null;
  /** Quanto do histórico chegou ao prompt, e de quem era. */
  historico: {
    total: number;
    doCliente: number;
    doBot: number;
    doCorretor: number;
    /**
     * Falas desta CONVERSA gravadas sem texto — a IA não as recebeu. Não é um
     * recorte da janela: a janela não as traz mais (0106).
     */
    emBranco: number;
  };
  /** Quantos exemplos de conversa real entraram no prompt. */
  fewShot: number;
};

export function montarContextoDaInteracao(params: {
  foco: { slug: string; nome: string } | null;
  jogada: Jogada;
  /**
   * O dossiê que estava valendo NO MOMENTO da resposta, nunca o reextraído
   * depois dela: julgar com o de depois seria julgar com informação que a IA
   * não tinha.
   */
  dossie: DossieClienteIA | null;
  historico: Fala[];
  /**
   * Quantas falas desta conversa estão gravadas sem texto. Vem de fora porque
   * a resposta está no banco e este módulo é puro — o que também o mantém
   * testável sem ambiente.
   */
  falasNaoGravadas: number;
  fewShot: number;
}): ContextoDaInteracao {
  const { historico } = params;

  return {
    foco: params.foco,
    jogada: params.jogada,
    dossie: params.dossie
      ? {
          regiao: params.dossie.regiaoInteresse,
          dormitorios: params.dossie.dormitoriosMin,
          orcamentoMax: params.dossie.orcamentoMax,
          rendaMensal: params.dossie.rendaMensal,
          formaPagamento: params.dossie.formaPagamento,
        }
      : null,
    historico: {
      total: historico.length,
      doCliente: historico.filter((f) => f.remetente === "cliente").length,
      doBot: historico.filter((f) => f.remetente === "bot").length,
      doCorretor: historico.filter((f) => f.remetente === "corretor").length,
      // A janela não traz mais a marca (0106); o que sobra ali seria sempre
      // zero. Quem sabe quantas se perderam é o banco.
      emBranco: params.falasNaoGravadas,
    },
    fewShot: params.fewShot,
  };
}
