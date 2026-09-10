/**
 * O que a casca de chat (`ChatBase`) precisa saber — e nada além disso.
 *
 * Módulo PURO: a casca é `"use client"`, e valor compartilhado entre servidor
 * e cliente não pode viajar dentro de módulo com `server-only` (a pedra do
 * `limitesPdf.ts` e do `pessoasTipos.ts`). Aqui só há tipos, que somem na
 * compilação.
 *
 * A casca conhece UM vocabulário de `dados`: `"pergunta"`, porque os chips de
 * resposta num toque são mecanismo do chat, não do domínio. Todo o resto
 * (proposta de arte, roteiro de vídeo, cartão de imóvel, simulação) chega por
 * `renderAcima` / `renderAbaixo` — senão cada chat novo acrescentaria um `if`
 * aqui dentro, que foi exatamente o que o Estúdio começou a fazer.
 */

/** Uma pergunta de refinamento, com alternativas tocáveis. */
export type PerguntaDeChat = {
  tipo: "pergunta";
  /** Chave estável para casar a escolha com a pergunta. */
  id: string;
  texto: string;
  /** De 2 a 4. Alternativa é o que faz alguém responder num toque. */
  alternativas: string[];
};

/** O mínimo que a casca lê de uma mensagem. `D` é o vocabulário do domínio. */
export type MensagemDeChat<D extends { tipo: string } = { tipo: string }> = {
  id: string;
  papel: "corretor" | "ia";
  conteudo: string;
  dados: D | null;
  createdAt: string;
};

/** O mínimo que a lista lateral lê de uma conversa. */
export type ConversaDeChat = {
  id: string;
  titulo: string;
  atualizadoEm: string;
};
