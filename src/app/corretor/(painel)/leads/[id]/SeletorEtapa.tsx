"use client";

import { useOptimistic, useTransition } from "react";
import { moverEtapa } from "@/app/corretor/actions";
import { ETIQUETA_ETAPA } from "@/app/corretor/(painel)/_componentes/etapas";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { ETAPA_LABEL, ETAPAS_FUNIL, type EtapaFunil } from "@/lib/types";

/**
 * Mover o lead de etapa direto da ficha — o mesmo `moverEtapa` do quadro.
 *
 * Otimista como o quadro, e pelo mesmo motivo de lá: o RLS pode negar, e
 * `moverEtapa` devolve erro quando nenhuma linha é afetada.
 *
 * O que faltava: o retorno era DESCARTADO (`await moverEtapa(...)` e mais
 * nada). Quando o servidor recusava, o `useOptimistic` devolvia o seletor ao
 * valor antigo e nada explicava — a etapa "voltava sozinha" e quem estava
 * olhando concluía que o toque não pegou, tentava de novo e via voltar de
 * novo. É o mesmo defeito que `BotaoConcluirTarefa` já tinha corrigido na
 * fila do Início: quando a única pista é a ausência de mudança, "não
 * funcionou" e "funcionou" são a mesma tela.
 */
export function SeletorEtapa({ leadId, etapa }: { leadId: string; etapa: EtapaFunil }) {
  const [, iniciar] = useTransition();
  const [etapaVisivel, verEtapa] = useOptimistic(etapa);
  const { falhar } = useAvisos();

  return (
    <label className="inline-flex items-center gap-2">
      <span className="sr-only">Etapa do funil</span>
      <select
        value={etapaVisivel}
        onChange={(e) => {
          const nova = e.target.value as EtapaFunil;
          iniciar(async () => {
            verEtapa(nova);
            try {
              const r = await moverEtapa(leadId, nova);
              if (r?.erro) falhar(r.erro);
            } catch {
              // Erro de rede não devolve `{ erro }` — devolve exceção. Sem
              // este ramo o seletor volta e a tela segue muda.
              falhar("Não deu para mudar a etapa. Confira a conexão e tente de novo.");
            }
          });
        }}
        /*
         * `min-h-11`: era `py-1.5`, ~30px — e este é o controle PRIMÁRIO do
         * cabeçalho da ficha, num painel usado no celular.
         */
        className={`text-fluid-xs min-h-11 cursor-pointer rounded-full px-3 font-medium ${ETIQUETA_ETAPA[etapaVisivel]}`}
      >
        {ETAPAS_FUNIL.map((e) => (
          <option key={e} value={e} className="bg-superficie text-corpo">
            {ETAPA_LABEL[e]}
          </option>
        ))}
      </select>
    </label>
  );
}
