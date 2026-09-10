"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { deMensagemRow, type MensagemRow } from "./Chat";
import type { MensagemConversa } from "./acoes";

/**
 * Tempo real de UMA conversa — o que a gaveta de Pessoas precisa.
 *
 * `ConversasClient` assina a caixa INTEIRA (canal `conversas-live`, sem
 * filtro: a RLS já recorta por corretor, e um `in.(...)` com a carteira toda
 * estouraria o parâmetro). Ele precisa disso porque mantém a lista, a prévia
 * de cada linha e o contador de não lidas de todo mundo.
 *
 * A gaveta não mantém nada disso: tem uma conversa na tela e a lista de
 * Pessoas atrás, que o servidor já renderizou. Assinar a caixa inteira seria
 * pagar o preço de um recurso que ela não usa — e teria um efeito colateral
 * pior, abaixo.
 *
 * O nome do canal leva o id de propósito. Dois canais com o MESMO nome no
 * mesmo cliente Supabase é a classe de defeito que só aparece quando alguém
 * abre as duas telas em abas irmãs, e que falha calada: um dos dois para de
 * receber e a tela simplesmente não atualiza mais.
 *
 * O que este hook NÃO faz, e é decisão: marcar lida, mesclar no cache e
 * preservar a avaliação local no UPDATE. Isso é estado de quem chama — o
 * mesmo motivo pelo qual `turnoDeAtendimento` devolve o que responder e não
 * envia nada.
 */
export function useConversaAoVivo({
  conversaId,
  aoInserir,
  aoAtualizar,
}: {
  conversaId: string | null;
  aoInserir: (mensagem: MensagemConversa) => void;
  /** Ack de entrega (0051) e vínculo de telemetria (0040) chegam como UPDATE. */
  aoAtualizar: (mensagem: MensagemConversa) => void;
}) {
  useEffect(() => {
    if (!conversaId) return;

    const supabase = createClient();
    const alvo = {
      schema: "public",
      table: "whatsapp_mensagens",
      filter: `conversa_id=eq.${conversaId}`,
    } as const;

    const canal = supabase
      .channel(`conversa-live:${conversaId}`)
      .on("postgres_changes", { event: "INSERT", ...alvo }, (payload) => {
        aoInserir(deMensagemRow(payload.new as MensagemRow));
      })
      .on("postgres_changes", { event: "UPDATE", ...alvo }, (payload) => {
        aoAtualizar(deMensagemRow(payload.new as MensagemRow));
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
    /*
     * As duas funções precisam vir de `useCallback` no chamador. Sem isso o
     * efeito roda a cada render, e cada render derruba e reassina o canal —
     * a assinatura nunca fica de pé tempo suficiente para entregar nada.
     */
  }, [conversaId, aoInserir, aoAtualizar]);
}
