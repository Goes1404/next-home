"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { registrarIndicacao } from "./indicacaoAcoes";

export function RegistrarIndicacao({ leadId }: { leadId: string }) {
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [sabe, setSabe] = useState(false);
  const [ocupado, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="min-h-11 rounded-xl border border-linha-forte px-4 text-fluid-xs font-semibold text-corpo hover:border-acento-linha"
      >
        Registrar alguém que ele indicou
      </button>
    );
  }

  function salvar() {
    iniciar(async () => {
      try {
        const r = await registrarIndicacao(leadId, { nome, telefone, sabeQueSeraProcurada: sabe });
        if (r.erro) return falhar(r.erro);
        avisar(r.ok!);
        setAberto(false);
        setNome("");
        setTelefone("");
        setSabe(false);
      } catch (err) {
        falhar(ehActionDeOutroBuild(err) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
      }
    });
  }

  return (
    <div className="space-y-2 rounded-xl border border-linha p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-fluid-xs text-apoio">
          Nome
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="mt-1 text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 w-full rounded-xl border px-3"
          />
        </label>
        <label className="text-fluid-xs text-apoio">
          WhatsApp
          <input
            inputMode="tel"
            value={telefone}
            onChange={(e) => setTelefone(e.target.value)}
            className="mt-1 text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 w-full rounded-xl border px-3"
          />
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-fluid-xs text-corpo">
        <input type="checkbox" checked={sabe} onChange={(e) => setSabe(e.target.checked)} className="h-4 w-4 accent-acento" />
        A pessoa sabe que vou entrar em contato
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={ocupado}
          className="min-h-11 rounded-xl bg-acento hover:bg-acento-hover px-4 text-fluid-xs font-bold text-sobre-cor disabled:opacity-60"
        >
          {ocupado ? "Salvando…" : "Registrar indicação"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="min-h-11 rounded-xl px-3 text-fluid-xs text-apoio">
          Cancelar
        </button>
      </div>
    </div>
  );
}
