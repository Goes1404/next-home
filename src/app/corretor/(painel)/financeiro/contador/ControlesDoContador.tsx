"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAvisos } from "../../_componentes/Avisos";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { criarAcessoContador, fecharMes, reabrirMes, revogarAcessoContador, type ResultadoContador } from "./acoes";

const botao = "text-fluid-sm bg-acento text-sobre-cor min-h-11 rounded-xl px-4 font-medium disabled:opacity-50";
const secundario =
  "text-fluid-sm border-linha text-corpo hover:border-acento-linha min-h-11 rounded-xl border px-4 disabled:opacity-50";
const campo =
  "text-fluid-sm border-linha-forte bg-campo text-corpo min-h-11 w-full min-w-0 rounded-lg border px-3 disabled:opacity-50";

function useAcao() {
  const [pendente, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();
  const router = useRouter();
  const rodar = (acao: () => Promise<ResultadoContador>, depois?: (r: ResultadoContador) => void) =>
    iniciar(async () => {
      try {
        const r = await acao();
        if (r.erro) return falhar(r.erro);
        if (r.ok) avisar(r.ok);
        depois?.(r);
        router.refresh();
      } catch (e) {
        falhar(ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Não deu para completar. Confira a conexão e tente de novo.");
      }
    });
  return { pendente, rodar };
}

export function BotaoFecharMes({ mes, rotulo }: { mes: string; rotulo: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const { pendente, rodar } = useAcao();
  if (!confirmando) {
    return (
      <button type="button" className={botao} onClick={() => setConfirmando(true)}>
        Fechar {rotulo}
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-fluid-xs text-apoio">Depois de fechado, nada pago neste mês muda.</span>
      <button type="button" className={botao} disabled={pendente} onClick={() => rodar(() => fecharMes(mes))}>
        {pendente ? "Fechando…" : "Confirmar"}
      </button>
      <button type="button" className={secundario} disabled={pendente} onClick={() => setConfirmando(false)}>
        Cancelar
      </button>
    </span>
  );
}

export function BotaoReabrirMes({ mes }: { mes: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const { pendente, rodar } = useAcao();
  if (!confirmando) {
    return (
      <button type="button" className={secundario} onClick={() => setConfirmando(true)}>
        Reabrir
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className="text-fluid-xs text-apoio">O arquivo que o contador baixou deixa de valer.</span>
      <button type="button" className={secundario} disabled={pendente} onClick={() => rodar(() => reabrirMes(mes))}>
        {pendente ? "Reabrindo…" : "Reabrir mesmo"}
      </button>
      <button type="button" className={secundario} disabled={pendente} onClick={() => setConfirmando(false)}>
        Cancelar
      </button>
    </span>
  );
}

export function NovoAcessoContador() {
  const [nome, setNome] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const { pendente, rodar } = useAcao();
  const { avisar } = useAvisos();

  return (
    <div className="space-y-3">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          rodar(
            () => criarAcessoContador(nome),
            (r) => {
              if (r.link) {
                setLink(r.link);
                setNome("");
              }
            },
          );
        }}
      >
        <label className="block min-w-0 flex-1 basis-56">
          <span className="text-fluid-xs text-tenue mb-1 block">Contador ou escritório</span>
          <input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
        </label>
        <button type="submit" className={botao} disabled={pendente || !nome.trim()}>
          {pendente ? "Criando…" : "Criar link"}
        </button>
      </form>
      {link && (
        <div className="bg-acento-lavado space-y-2 rounded-xl p-3">
          <p className="text-fluid-sm text-corpo [overflow-wrap:anywhere]">{link}</p>
          <button
            type="button"
            className={secundario}
            onClick={() => {
              navigator.clipboard?.writeText(link).then(
                () => avisar("Link copiado."),
                () => avisar("Selecione o link e copie."),
              );
            }}
          >
            Copiar link
          </button>
        </div>
      )}
    </div>
  );
}

export function BotaoRevogarAcesso({ token }: { token: string }) {
  const { pendente, rodar } = useAcao();
  return (
    <button type="button" className={secundario} disabled={pendente} onClick={() => rodar(() => revogarAcessoContador(token))}>
      {pendente ? "Revogando…" : "Revogar"}
    </button>
  );
}
