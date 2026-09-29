import Link from "next/link";
import { ETAPA_LABEL, type EtapaFunil } from "@/lib/types";
import { maiorVazamento, passagemDoFunil } from "@/lib/graficos/calculos";
import { BARRA_ETAPA } from "../etapas";
import { CartaoDeGrafico, GraficoVazio } from "./Moldura";

/**
 * "Onde eu perco gente?" (28/09/2026) — desenhado como FUNIL de verdade.
 *
 * Cada faixa tem a largura de quantos CHEGARAM àquela etapa e fica centrada,
 * então o formato do funil já mostra onde ele afina. Entre uma faixa e a
 * seguinte vai a passagem ("75% seguiram"); o passo que mais perde ganha a
 * marca escrita "maior perda", em cor de alerta.
 *
 * As faixas usam a rampa das etapas (`BARRA_ETAPA`), a mesma do quadro e das
 * etiquetas: a etapa tem ordem, e a cor que a pessoa já conhece do resto do
 * painel diz qual é antes do texto. O texto dentro da faixa é `sobre-cor`, o
 * par já conferido em contraste para essas cores nos dois temas.
 *
 * O link abre quem ESTÁ na etapa agora, não todos que passaram por ela: por
 * isso a faixa diz os dois números.
 */

/** Largura mínima da faixa, para o rótulo sempre caber. */
const PISO = 52;

export function PassagemDoFunil({ contagens }: { contagens: Partial<Record<EtapaFunil, number>> }) {
  const passos = passagemDoFunil(contagens);
  const vazamento = maiorVazamento(passos);
  const perdidos = contagens.perdido ?? 0;
  const topo = Math.max(1, passos[0].alcancaram);
  const ganhos = passos[passos.length - 1].alcancaram;

  return (
    <CartaoDeGrafico
      titulo="Onde os contatos ficam pelo caminho"
      subtitulo="Cada faixa é quantos chegaram àquela etapa. Entre elas, quanto do passo anterior seguiu."
      rodape={
        perdidos > 0
          ? `${perdidos} ${perdidos === 1 ? "contato perdido fica" : "contatos perdidos ficam"} fora da conta: a etapa atual deles não diz até onde foram.`
          : undefined
      }
    >
      {passos[0].alcancaram === 0 ? (
        <GraficoVazio texto="Quando os primeiros contatos entrarem na carteira, este gráfico mostra em que etapa eles param." />
      ) : (
        <>
          <p className="text-fluid-sm text-apoio">
            De cada 100 que entram,{" "}
            <strong className="text-titulo text-fluid-lg font-semibold tabular-nums">
              {Math.round((ganhos / topo) * 100)}
            </strong>{" "}
            chegam a fechar.
          </p>
          <ol aria-label="Funil de passagem pelas etapas" className="mx-auto max-w-xl">
            {passos.map((p) => {
              const largura = Math.max(PISO, Math.round((p.alcancaram / topo) * 100));
              const agora = contagens[p.etapa] ?? 0;
              const perda = p.etapa === vazamento;
              return (
                <li key={p.etapa}>
                  {p.doAnterior !== null && (
                    <div className="flex items-center justify-center gap-2 py-1.5" aria-hidden={!perda}>
                      <span className="bg-linha-forte h-3 w-px" />
                      <span
                        className={
                          perda
                            ? "bg-alerta-lavado text-alerta border-alerta-linha text-fluid-xs rounded-full border px-2.5 py-0.5 font-semibold"
                            : "text-fluid-xs text-apoio tabular-nums"
                        }
                      >
                        {p.doAnterior}% seguiram{perda ? " · maior perda" : ""}
                      </span>
                      <span className="bg-linha-forte h-3 w-px" />
                    </div>
                  )}
                  <Link
                    href={`/corretor/leads?etapa=${p.etapa}`}
                    title={`${ETAPA_LABEL[p.etapa]}: ${p.alcancaram} chegaram, ${agora} nesta etapa agora`}
                    className={`${BARRA_ETAPA[p.etapa]} text-sobre-cor mx-auto flex min-h-11 items-center justify-between gap-2 rounded-xl px-3 py-2 shadow-sm transition-[transform,width] duration-700 hover:-translate-y-0.5 active:scale-[0.99] motion-reduce:transition-none ${
                      perda ? "ring-alerta ring-2 ring-offset-2 ring-offset-transparent" : ""
                    }`}
                    style={{ width: `${largura}%` }}
                  >
                    <span className="text-fluid-sm min-w-0 truncate font-medium">{ETAPA_LABEL[p.etapa]}</span>
                    <span className="text-fluid-base shrink-0 font-bold tabular-nums">{p.alcancaram}</span>
                  </Link>
                  <p className="text-fluid-xs text-tenue mt-1 text-center tabular-nums">
                    {agora} nesta etapa agora
                  </p>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </CartaoDeGrafico>
  );
}
