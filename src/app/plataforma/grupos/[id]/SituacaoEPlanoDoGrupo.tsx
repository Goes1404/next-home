"use client";

import { useState, useTransition } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { PLANOS, ROTULO_DO_PLANO, type Plano, type Situacao } from "@/lib/plataforma/rotulosDoGrupo";
import { mudarPlanoDoGrupo } from "../../acoes";
import { reativarGrupo, suspenderGrupo } from "../../cobrancaAcoes";

const BOTAO_PRINCIPAL =
  "text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 cursor-pointer items-center rounded-xl px-5 font-bold disabled:opacity-60";
const BOTAO_SECUNDARIO =
  "botao-secundario text-fluid-sm text-titulo flex min-h-11 cursor-pointer items-center rounded-xl px-4 font-medium disabled:opacity-60";
const BOTAO_PERIGO =
  "text-fluid-sm bg-perigo text-sobre-cor flex min-h-11 cursor-pointer items-center rounded-xl px-5 font-bold disabled:opacity-60";
const CAMPO =
  "text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento min-h-11 w-full rounded-xl border px-3.5 py-2.5 focus:outline-none sm:w-auto";

/** Classes por extenso: montada em tempo de execução, a classe não existiria. */
const SITUACAO: Record<Situacao, { rotulo: string; classe: string }> = {
  ativo: { rotulo: "Ativo", classe: "bg-ok-lavado text-ok border-ok-linha" },
  suspenso: { rotulo: "Suspenso", classe: "bg-alerta-lavado text-alerta border-alerta-linha" },
  encerrado: { rotulo: "Encerrado", classe: "bg-perigo-lavado text-perigo border-perigo-linha" },
};

type Confirmando = null | "suspender" | "reativar" | "plano";

/**
 * Situação e plano do grupo, no alto da página (29/10/2026). Antes a
 * suspensão manual morava no fim do cartão de Cobrança, e o plano não se
 * editava. Toda ação daqui pede confirmação num segundo clique, com o efeito
 * escrito: suspender para a IA do grupo inteiro, e mudar o plano muda os
 * tetos na hora.
 */
export function SituacaoEPlanoDoGrupo({
  grupoId,
  situacao,
  plano,
  cancelado,
  suspensoPorAtraso,
  temAjusteDeLimite,
  planoFixo,
}: {
  grupoId: string;
  situacao: Situacao;
  plano: Plano;
  /** Com cancelamento registrado, a situação se mexe pelo cartão de cancelamento. */
  cancelado: boolean;
  /** A conta da cobrança suspendeu por atraso (`grupos.situacao` segue `ativo`). */
  suspensoPorAtraso: boolean;
  /** Algum teto (IA, artes, vídeos, listas) foi ajustado à mão. */
  temAjusteDeLimite: boolean;
  /** A Next Home: fica no preço de custo. */
  planoFixo: boolean;
}) {
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [pendente, iniciar] = useTransition();
  const [confirmando, setConfirmando] = useState<Confirmando>(null);
  const [planoNovo, setPlanoNovo] = useState<Plano>(plano);
  const [voltarAoPadrao, setVoltarAoPadrao] = useState(false);

  const agir = (acao: () => Promise<{ ok: true } | { ok: false; erro: string }>, sucesso: string) =>
    iniciar(async () => {
      setAviso(null);
      try {
        const r = await acao();
        setAviso(r.ok ? { texto: sucesso, erro: false } : { texto: r.erro, erro: true });
        if (r.ok) setConfirmando(null);
      } catch (e) {
        setAviso({
          texto: ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Não foi possível falar com o servidor. Tente de novo.",
          erro: true,
        });
      }
    });

  const estado = SITUACAO[situacao];
  const mudouPlano = planoNovo !== plano;
  const podeEnviarPlano = mudouPlano || (voltarAoPadrao && temAjusteDeLimite);

  return (
    <section className="cartao flex flex-col gap-5 p-5" aria-labelledby="titulo-situacao">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="titulo-situacao" className="text-fluid-sm text-titulo font-bold">
          Situação e plano
        </h2>
        <span className={`text-fluid-xs rounded-full border px-2.5 py-1 ${estado.classe}`}>{estado.rotulo}</span>
      </div>

      {aviso && (
        <p
          role={aviso.erro ? "alert" : "status"}
          className={`text-fluid-sm rounded-xl border px-4 py-3 ${
            aviso.erro ? "border-perigo-linha bg-perigo-lavado text-perigo" : "border-ok-linha bg-ok-lavado text-ok"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-fluid-sm text-titulo font-medium">Suspender ou reativar</h3>
        <p className="text-fluid-xs text-apoio">
          Suspenso, o grupo perde a IA no WhatsApp, as listas de transmissão, as artes e os vídeos. O painel, o login e
          o site continuam, e o cliente final não vê erro: o corretor atende à mão.
        </p>
        {cancelado ? (
          <p className="text-fluid-xs text-apoio">Este grupo tem cancelamento registrado: a situação muda pelo cartão de cancelamento.</p>
        ) : situacao === "suspenso" ? (
          confirmando === "reativar" ? (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                disabled={pendente}
                onClick={() => agir(() => reativarGrupo(grupoId), "Grupo reativado: a IA, as listas, as artes e os vídeos voltam.")}
                className={BOTAO_PRINCIPAL}
              >
                {pendente ? "Reativando…" : "Confirmar reativação"}
              </button>
              <button type="button" disabled={pendente} onClick={() => setConfirmando(null)} className={BOTAO_SECUNDARIO}>
                Voltar
              </button>
            </div>
          ) : (
            <div>
              <button type="button" onClick={() => setConfirmando("reativar")} className={BOTAO_PRINCIPAL}>
                Reativar grupo
              </button>
            </div>
          )
        ) : situacao === "ativo" ? (
          <>
            {suspensoPorAtraso && (
              <p className="text-fluid-xs text-alerta">
                Está suspenso por atraso de pagamento: registrar o pagamento em Cobrança reativa sozinho.
              </p>
            )}
            {confirmando === "suspender" ? (
              <div className="flex flex-col gap-3">
                <p className="text-fluid-xs text-titulo">
                  Suspender agora? A IA do grupo inteiro fica calada até alguém reativar aqui.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() => agir(() => suspenderGrupo(grupoId), "Grupo suspenso.")}
                    className={BOTAO_PERIGO}
                  >
                    {pendente ? "Suspendendo…" : "Confirmar suspensão"}
                  </button>
                  <button type="button" disabled={pendente} onClick={() => setConfirmando(null)} className={BOTAO_SECUNDARIO}>
                    Voltar
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <button type="button" onClick={() => setConfirmando("suspender")} className={BOTAO_SECUNDARIO}>
                  Suspender grupo
                </button>
              </div>
            )}
          </>
        ) : (
          <p className="text-fluid-xs text-apoio">Grupo encerrado: não suspende nem reativa por aqui.</p>
        )}
      </div>

      <div className="border-linha flex flex-col gap-3 border-t pt-5">
        <h3 className="text-fluid-sm text-titulo font-medium">Plano</h3>
        {planoFixo ? (
          <p className="text-fluid-xs text-apoio">A Next Home fica no plano a preço de custo: ela paga o que usar e nunca é cobrada.</p>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (podeEnviarPlano) setConfirmando("plano");
            }}
          >
            <label className="text-fluid-xs text-apoio flex min-w-0 flex-col gap-1">
              Plano do grupo
              <select
                name="plano"
                value={planoNovo}
                onChange={(e) => {
                  setPlanoNovo(e.target.value as Plano);
                  setConfirmando(null);
                }}
                className={CAMPO}
              >
                {PLANOS.map((p) => (
                  <option key={p} value={p}>
                    {ROTULO_DO_PLANO[p]}
                    {p === plano ? " (atual)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {temAjusteDeLimite && (
              <label className="text-fluid-xs text-corpo flex min-h-11 cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={voltarAoPadrao}
                  onChange={(e) => {
                    setVoltarAoPadrao(e.target.checked);
                    setConfirmando(null);
                  }}
                  className="mt-0.5 size-4 shrink-0"
                />
                <span>
                  Voltar respostas da IA, artes, vídeos e listas ao padrão do plano. Sem marcar, os tetos ajustados à
                  mão continuam valendo.
                </span>
              </label>
            )}
            <p className="text-fluid-xs text-apoio">
              Vale na hora: os tetos que não foram ajustados à mão passam a ser os do plano escolhido. A mensalidade
              não muda sozinha; ajuste em Cobrança. O plano a preço de custo deixa o grupo isento de cobrança.
            </p>
            {confirmando === "plano" ? (
              <div className="flex flex-col gap-3">
                <p className="text-fluid-xs text-titulo">
                  {mudouPlano
                    ? `Mudar de ${ROTULO_DO_PLANO[plano]} para ${ROTULO_DO_PLANO[planoNovo]}`
                    : `Manter ${ROTULO_DO_PLANO[plano]}`}
                  {voltarAoPadrao && temAjusteDeLimite ? " e voltar os tetos ao padrão do plano?" : "?"}
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={pendente}
                    onClick={() =>
                      agir(
                        () => mudarPlanoDoGrupo(grupoId, { plano: planoNovo, voltarLimitesAoPadrao: voltarAoPadrao && temAjusteDeLimite }),
                        mudouPlano ? `Plano mudado para ${ROTULO_DO_PLANO[planoNovo]}.` : "Tetos de volta ao padrão do plano.",
                      )
                    }
                    className={BOTAO_PRINCIPAL}
                  >
                    {pendente ? "Salvando…" : "Confirmar"}
                  </button>
                  <button type="button" disabled={pendente} onClick={() => setConfirmando(null)} className={BOTAO_SECUNDARIO}>
                    Voltar
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <button type="submit" disabled={!podeEnviarPlano} className={BOTAO_PRINCIPAL}>
                  Mudar plano
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
