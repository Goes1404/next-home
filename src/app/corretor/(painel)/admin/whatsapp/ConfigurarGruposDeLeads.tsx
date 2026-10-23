"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { configurarEnvioDeLeadsNosGrupos, configurarPuloDeCorretorDesconectado, sincronizarGruposDeLeadsDaAretz } from "./acoes";

type Instancia = { instanceName: string; nome: string; conectada: boolean };
type Corretor = { id: string; nome: string; grupoNome: string | null };

export function ConfigurarGruposDeLeads({ instanciaAtual, pularDesconectados, instancias, corretores }: { instanciaAtual: string | null; pularDesconectados: boolean; instancias: Instancia[]; corretores: Corretor[] }) {
  const [escolhida, setEscolhida] = useState(instanciaAtual ?? "");
  const [pendente, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  const executar = (tarefa: () => Promise<{ ok?: string; erro?: string }>) =>
    iniciar(async () => {
      try {
        const r = await tarefa();
        if (r.erro) falhar(r.erro);
        else if (r.ok) avisar(r.ok);
      } catch {
        falhar("NÃ£o foi possÃ­vel concluir agora. Tente novamente.");
      }
    });

  return (
    <section className="cartao p-5">
      <label className="border-linha mb-4 flex cursor-pointer items-start gap-3 rounded-xl border p-3">
        <input
          type="checkbox"
          checked={pularDesconectados}
          disabled={pendente}
          onChange={(e) => executar(() => configurarPuloDeCorretorDesconectado(e.target.checked))}
          className="mt-1 size-4 accent-[var(--color-acento)]"
        />
        <span className="grid gap-0.5">
          <span className="text-fluid-sm font-medium text-titulo">Pular corretor com WhatsApp desconectado</span>
          <span className="text-fluid-xs text-apoio">Ligado: o lead so vai para quem estiver conectado. Desligado: conectados seguem na frente, mas a roleta nao deixa o lead sem responsavel.</span>
        </span>
      </label>
      <h2 className="text-fluid-base font-bold text-titulo">Leads nos grupos da Aretz</h2>
      <p className="text-fluid-xs text-apoio mt-1">
        Ao distribuir um lead, o CRM avisa o grupo do corretor. O nÃºmero central precisa participar de todos os grupos.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-fluid-sm text-corpo grid gap-1">
          NÃºmero central
          <select value={escolhida} onChange={(e) => setEscolhida(e.target.value)} disabled={pendente} className="border-linha-forte bg-fundo min-h-11 rounded-xl border px-3">
            <option value="">Desativado</option>
            {instancias.map((i) => <option key={i.instanceName} value={i.instanceName} disabled={!i.conectada}>{i.nome}{i.conectada ? "" : " (desconectado)"}</option>)}
          </select>
        </label>
        <button type="button" disabled={pendente} onClick={() => executar(() => configurarEnvioDeLeadsNosGrupos(escolhida))} className="bg-acento text-sobre-acento text-fluid-sm min-h-11 rounded-xl px-4 font-medium disabled:opacity-60">
          Salvar
        </button>
        <button type="button" disabled={pendente || !escolhida} onClick={() => executar(sincronizarGruposDeLeadsDaAretz)} className="border-linha-forte text-corpo text-fluid-sm min-h-11 rounded-xl border px-4 disabled:opacity-60">
          {pendente ? "Sincronizando…" : "Sincronizar grupos"}
        </button>
      </div>
      <ul className="divide-linha mt-4 divide-y">
        {corretores.map((c) => <li key={c.id} className="text-fluid-sm flex justify-between gap-3 py-2"><span className="text-titulo">{c.nome}</span><span className={c.grupoNome ? "text-ok" : "text-apoio"}>{c.grupoNome ?? "grupo nÃ£o encontrado"}</span></li>)}
      </ul>
    </section>
  );
}
