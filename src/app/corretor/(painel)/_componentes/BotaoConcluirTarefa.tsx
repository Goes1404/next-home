"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { concluirTarefa } from "@/app/corretor/(painel)/leads/[id]/acoes";
import { useAvisos } from "./Avisos";

/**
 * Concluir a tarefa sem sair do Início — o gesto que a fila herdou do bloco
 * "Para hoje". Some da tela na hora, porque a resposta do servidor não muda
 * nada do que o corretor faria em seguida.
 *
 * Duas correções em cima da versão anterior:
 *
 * 1. Ela DESCARTAVA o resultado (`await concluirTarefa(id)` e mais nada). Se
 *    o servidor recusasse, a tarefa sumia, voltava no próximo carregamento e
 *    ninguém sabia por quê — o desfecho em que "não funcionou" e "funcionou"
 *    são indistinguíveis. Agora a falha desfaz o sumiço e diz o motivo.
 * 2. O ícone era `text-transparent` até o `hover`, e o painel é usado no
 *    CELULAR, onde hover não existe: na prática era um círculo vazio ao lado
 *    de cada tarefa. Agora ele é visível sempre; o hover só reforça.
 */
export function BotaoConcluirTarefa({ tarefaId, titulo }: { tarefaId: string; titulo: string }) {
  const [feita, setFeita] = useState(false);
  const [pendente, iniciar] = useTransition();
  const { falhar } = useAvisos();

  if (feita) return null;

  return (
    <button
      type="button"
      aria-label={`Concluir: ${titulo}`}
      title="Concluir"
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          setFeita(true);
          try {
            const r = await concluirTarefa(tarefaId);
            if (r?.erro) {
              setFeita(false);
              falhar(r.erro);
            }
          } catch {
            setFeita(false);
            falhar("Não deu para concluir a tarefa. Confira a conexão.");
          }
        })
      }
      className="border-linha-forte text-apoio hover:border-ok hover:text-ok my-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center self-center rounded-full border transition-colors disabled:opacity-60"
    >
      <Check className="h-5 w-5" />
    </button>
  );
}
