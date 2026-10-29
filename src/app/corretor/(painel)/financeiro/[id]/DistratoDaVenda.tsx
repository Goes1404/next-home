"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "../../_componentes/Avisos";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { validarDistrato } from "@/lib/financeiro/venda";
import { avisarDistrato, desfazerDistrato, distratarVenda, type ResultadoVenda } from "../acoes";

const campo =
  "text-fluid-sm border-linha-forte bg-campo text-corpo min-h-11 w-full min-w-0 rounded-lg border px-3 disabled:opacity-50";
const rotulo = "text-fluid-xs mb-1 block text-tenue";

function useAcao() {
  const [pendente, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();
  const router = useRouter();
  const rodar = (acao: () => Promise<ResultadoVenda>, depois?: () => void) =>
    iniciar(async () => {
      try {
        const r = await acao();
        if (r.erro) {
          falhar(r.erro);
          return;
        }
        if (r.ok) avisar(r.ok);
        depois?.();
        router.refresh();
      } catch (e) {
        falhar(ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Não deu para completar. Confira a conexão e tente de novo.");
      }
    });
  return { pendente, rodar };
}

const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/**
 * O distrato (0232). Gestor: registra com data, motivo e a decisão sobre as
 * parcelas em aberto (sem escolha pré-marcada: comissão continua devida se o
 * desfazimento não foi culpa do corretor, e é o gestor quem sabe). Corretor:
 * só avisa, e o aviso vira alerta para o gestor.
 */
export function DistratoDaVenda({
  vendaId,
  gestor,
  hoje,
  distratada,
  distratadaEm,
  motivo,
  decisao,
  avisadoEm,
  aviso,
  temParcelaAberta,
}: {
  vendaId: string;
  gestor: boolean;
  hoje: string;
  distratada: boolean;
  distratadaEm: string | null;
  motivo: string | null;
  decisao: "manter" | "cancelar" | null;
  avisadoEm: string | null;
  aviso: string | null;
  temParcelaAberta: boolean;
}) {
  const { pendente, rodar } = useAcao();
  const [aberto, setAberto] = useState(false);
  const [data, setData] = useState(hoje);
  const [texto, setTexto] = useState("");
  const [parcelas, setParcelas] = useState<"manter" | "cancelar" | null>(temParcelaAberta ? null : "manter");
  const [tentou, setTentou] = useState(false);

  if (distratada) {
    return (
      <section className="cartao space-y-2 p-4 sm:p-5">
        <h2 className="text-fluid-base text-titulo font-medium">Distrato</h2>
        <p className="text-fluid-sm text-corpo">
          Distratada em {distratadaEm ? dataBr(distratadaEm) : "—"}.{" "}
          {decisao === "cancelar" ? "As parcelas em aberto foram canceladas." : "As parcelas em aberto continuam devidas."}
        </p>
        {motivo && <p className="text-fluid-sm text-apoio break-words">Motivo: {motivo}</p>}
        {gestor && (
          <button
            type="button"
            disabled={pendente}
            onClick={() => rodar(() => desfazerDistrato(vendaId))}
            className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha min-h-11 rounded-xl border px-4 font-medium disabled:opacity-50"
          >
            {pendente ? "Desfazendo…" : "Desfazer distrato"}
          </button>
        )}
      </section>
    );
  }

  if (!gestor) {
    return (
      <section className="cartao space-y-2 p-4 sm:p-5">
        <h2 className="text-fluid-base text-titulo font-medium">Distrato</h2>
        {avisadoEm ? (
          <p className="text-fluid-sm text-corpo">
            Você avisou o distrato em {dataBr(avisadoEm)}. O gestor decide e registra.
          </p>
        ) : !aberto ? (
          <button
            type="button"
            onClick={() => setAberto(true)}
            className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha min-h-11 rounded-xl border px-4 font-medium"
          >
            Avisar distrato
          </button>
        ) : (
          <div className="space-y-2">
            <label className={rotulo} htmlFor="aviso-distrato">
              O que aconteceu (opcional)
            </label>
            <textarea id="aviso-distrato" rows={2} maxLength={500} value={texto} onChange={(e) => setTexto(e.target.value)} className={`${campo} py-2`} />
            <button
              type="button"
              disabled={pendente}
              onClick={() => rodar(() => avisarDistrato(vendaId, texto), () => setAberto(false))}
              className="text-fluid-sm bg-acento text-sobre-cor min-h-11 rounded-xl px-5 font-bold disabled:opacity-60"
            >
              {pendente ? "Avisando…" : "Avisar o gestor"}
            </button>
          </div>
        )}
      </section>
    );
  }

  const problemas = validarDistrato({ data, motivo: texto, parcelas }, hoje);
  return (
    <section className="cartao space-y-3 p-4 sm:p-5">
      <h2 className="text-fluid-base text-titulo font-medium">Distrato</h2>
      {avisadoEm && (
        <p className="text-fluid-sm border-alerta-linha bg-alerta-lavado text-titulo rounded-xl border p-3 break-words">
          Um corretor avisou o distrato em {dataBr(avisadoEm)}
          {aviso ? `: “${aviso}”` : "."}
        </p>
      )}
      {!aberto ? (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha min-h-11 rounded-xl border px-4 font-medium"
        >
          Registrar distrato
        </button>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={rotulo} htmlFor="distrato-data">
                Data do distrato
              </label>
              <input id="distrato-data" type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} className={campo} />
            </div>
            <div>
              <label className={rotulo} htmlFor="distrato-motivo">
                Motivo
              </label>
              <input id="distrato-motivo" maxLength={500} value={texto} onChange={(e) => setTexto(e.target.value)} className={campo} />
            </div>
          </div>
          {temParcelaAberta && (
            <fieldset className="space-y-2">
              <legend className={rotulo}>E as parcelas que ainda não entraram?</legend>
              {(
                [
                  ["manter", "Continuam devidas", "O distrato não foi culpa do corretor: a comissão segue."],
                  ["cancelar", "Cancelar", "Saem do caixa; o ajuste cai no mês do distrato."],
                ] as const
              ).map(([valor, titulo, explicacao]) => (
                <label key={valor} className="border-linha flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-3">
                  <input
                    type="radio"
                    name="distrato-parcelas"
                    value={valor}
                    checked={parcelas === valor}
                    onChange={() => setParcelas(valor)}
                    className="mt-1"
                  />
                  <span>
                    <span className="text-fluid-sm text-titulo block font-medium">{titulo}</span>
                    <span className="text-fluid-xs text-tenue block">{explicacao}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {tentou && problemas.length > 0 && (
            <p role="alert" className="text-fluid-sm text-perigo">
              {problemas[0]}
            </p>
          )}
          <button
            type="button"
            disabled={pendente}
            onClick={() => {
              setTentou(true);
              if (problemas.length > 0) return;
              rodar(() => distratarVenda(vendaId, { data, motivo: texto, parcelas }), () => setAberto(false));
            }}
            className="text-fluid-sm border-perigo bg-perigo text-sobre-cor min-h-11 rounded-xl border px-5 font-bold disabled:opacity-60"
          >
            {pendente ? "Registrando…" : "Registrar distrato"}
          </button>
        </div>
      )}
    </section>
  );
}
