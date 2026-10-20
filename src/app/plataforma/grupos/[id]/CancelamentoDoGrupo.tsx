"use client";

import { useState, useTransition } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { DIAS_DE_RETENCAO, apagarEm, diasAteApagar } from "@/lib/grupos/encerramentoRegras";
import { desfazerCancelamento, registrarCancelamento } from "../../acoes";

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });

const BOTAO_PRINCIPAL =
  "text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 cursor-pointer items-center rounded-xl px-5 font-bold disabled:opacity-60";
const BOTAO_PERIGO =
  "text-fluid-sm bg-perigo text-sobre-cor flex min-h-11 cursor-pointer items-center rounded-xl px-5 font-bold disabled:opacity-60";

/**
 * O cancelamento do grupo na tela da plataforma (resposta 7 do dono, 0202).
 *
 * Registrar tira o grupo do ar e começa a contar os 90 dias; dentro deles dá
 * para desfazer. A planilha dos dados só se baixa daqui depois de cancelado
 * (é a entrega ao cliente que saiu); depois de apagado, o link abre a cópia
 * guardada. A rotina que apaga pode estar desligada no ambiente — a tela diz.
 */
export function CancelamentoDoGrupo({
  grupoId,
  canceladoEm,
  dadosApagadosEm,
  rotinaLigada,
}: {
  grupoId: string;
  canceladoEm: string | null;
  dadosApagadosEm: string | null;
  rotinaLigada: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [pendente, iniciar] = useTransition();

  const agir = (acao: () => Promise<{ ok: true } | { ok: false; erro: string }>, sucesso: string) =>
    iniciar(async () => {
      setAviso(null);
      try {
        const r = await acao();
        setAviso(r.ok ? { texto: sucesso, erro: false } : { texto: r.erro, erro: true });
        if (r.ok) setConfirmando(false);
      } catch (e) {
        setAviso({
          texto: ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Não foi possível falar com o servidor. Tente de novo.",
          erro: true,
        });
      }
    });

  const linkDaPlanilha = `/plataforma/grupos/${grupoId}/exportar`;

  return (
    <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-cancelamento">
      <h2 id="titulo-cancelamento" className="text-fluid-sm text-titulo font-bold">
        Cancelamento e dados
      </h2>

      {dadosApagadosEm ? (
        <>
          <p className="text-fluid-sm text-apoio">
            Os dados deste grupo foram apagados em {DATA.format(new Date(dadosApagadosEm))}. Ficou guardada a planilha
            gerada antes de apagar.
          </p>
          <div>
            <a href={linkDaPlanilha} className="botao-secundario text-fluid-sm inline-flex min-h-11 items-center rounded-xl px-4">
              Baixar a cópia guardada
            </a>
          </div>
        </>
      ) : canceladoEm ? (
        <>
          <p className="text-fluid-sm text-apoio">
            Cancelado em {DATA.format(new Date(canceladoEm))}. O grupo está fora do ar. Os dados serão apagados a partir
            de {DATA.format(apagarEm(canceladoEm))}
            {diasAteApagar(canceladoEm) > 0 ? ` (faltam ${diasAteApagar(canceladoEm)} dias)` : ""}.
          </p>
          {!rotinaLigada && (
            <p className="text-fluid-xs text-tenue">
              A rotina que apaga está desligada neste ambiente: nada é apagado sozinho até alguém ligá-la.
            </p>
          )}
          <p className="text-fluid-sm text-apoio">
            Entregue ao cliente a planilha com os leads, os imóveis, os corretores e as vendas. Conversas não entram.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href={linkDaPlanilha} className="botao-secundario text-fluid-sm inline-flex min-h-11 items-center rounded-xl px-4">
              Baixar os dados do grupo
            </a>
            <button
              type="button"
              disabled={pendente}
              onClick={() => agir(() => desfazerCancelamento(grupoId), "Cancelamento desfeito. O grupo voltou ao ar.")}
              className={BOTAO_PRINCIPAL}
            >
              {pendente ? "Desfazendo…" : "Desfazer cancelamento"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-fluid-sm text-apoio">
            Se o cliente cancelar, registre aqui. O grupo sai do ar, os dados ficam guardados por {DIAS_DE_RETENCAO} dias
            (dá para desfazer nesse prazo) e depois são apagados, com uma cópia guardada antes.
          </p>
          {confirmando ? (
            <div className="border-perigo-linha bg-perigo-lavado flex flex-col gap-3 rounded-xl border p-4">
              <p className="text-fluid-sm text-perigo">
                Confirmar o cancelamento? O site e o painel deste grupo param agora.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => agir(() => registrarCancelamento(grupoId), "Cancelamento registrado.")}
                  className={BOTAO_PERIGO}
                >
                  {pendente ? "Registrando…" : "Sim, cancelar o grupo"}
                </button>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => setConfirmando(false)}
                  className="botao-secundario text-fluid-sm min-h-11 rounded-xl px-4"
                >
                  Voltar
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className="botao-secundario text-fluid-sm min-h-11 rounded-xl px-4"
              >
                Registrar cancelamento
              </button>
            </div>
          )}
        </>
      )}

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
    </section>
  );
}
