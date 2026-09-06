import type { EtapaFunil } from "@/lib/types";

/**
 * Tipos e constantes da lista de Pessoas — em módulo PURO, sem `server-only`.
 *
 * Isto não é organização: é obrigação. `ListaPessoas.tsx` é `"use client"` e
 * precisa de `PESSOAS_POR_PAGINA`. Tipo é apagado na compilação e viaja de
 * graça, mas CONSTANTE é valor: importá-la de `pessoas.ts` arrasta o módulo
 * inteiro — e com ele `server-only`, o cliente do Supabase e a sessão — para
 * o grafo do cliente. O build reprova com "'server-only' cannot be imported
 * from a Client Component module".
 *
 * É a mesma pedra do `limitesPdf.ts`, que nasceu porque um componente de
 * cliente importava um NÚMERO de um módulo que puxava o `sharp`. A regra da
 * casa: constante que os dois lados usam mora sozinha.
 */

export const PESSOAS_POR_PAGINA = 40;

export type PessoaNaLista = {
  /** Chave estável da linha: `c:<uuid>` ou `l:<uuid>`. */
  id: string;
  conversaId: string | null;
  leadId: string | null;
  /** Já resolvido para exibição — nunca vazio (cai no telefone). */
  nome: string;
  telefone: string | null;
  etapa: EtapaFunil | null;
  ultimaAtividade: string;
  previa: string | null;
  naoLidas: number;
  temConversa: boolean;
};

export type FiltroPessoas = {
  busca?: string;
  etapas?: EtapaFunil[];
  /** Só quem tem mensagem não lida — o recorte "me responde". */
  soNaoLidas?: boolean;
};
