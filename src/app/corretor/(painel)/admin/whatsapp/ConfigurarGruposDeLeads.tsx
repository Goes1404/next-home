"use client";

import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { nomeEsperadoDoGrupo, PADRAO_DE_FABRICA } from "@/lib/whatsapp/nomeDoGrupoDeLeads";
import {
  configurarEnvioDeLeadsNosGrupos,
  configurarNomeDosGrupos,
  sincronizarGruposDeLeads,
  vincularGrupoDoCorretor,
} from "./acoes";

type Instancia = { instanceName: string; nome: string; conectada: boolean };
type Corretor = { id: string; nome: string; grupoJid: string | null; grupoNome: string | null; manual: boolean };
type GrupoDoCentral = { jid: string; nome: string };

export function ConfigurarGruposDeLeads({
  instanciaAtual,
  instancias,
  corretores,
  padraoDoNome,
  nomeDaImobiliaria,
  gruposDoCentral,
}: {
  instanciaAtual: string | null;
  instancias: Instancia[];
  corretores: Corretor[];
  padraoDoNome: string | null;
  nomeDaImobiliaria: string;
  gruposDoCentral: GrupoDoCentral[];
}) {
  const [escolhida, setEscolhida] = useState(instanciaAtual ?? "");
  const [padrao, setPadrao] = useState(padraoDoNome ?? "");
  const [pendente, iniciar] = useTransition();
  const { avisar, falhar } = useAvisos();

  const executar = (tarefa: () => Promise<{ ok?: string; erro?: string }>) =>
    iniciar(async () => {
      try {
        const r = await tarefa();
        if (r.erro) falhar(r.erro);
        else if (r.ok) avisar(r.ok);
      } catch {
        falhar("Não foi possível concluir agora. Tente novamente.");
      }
    });

  // Prévia com o primeiro corretor da lista: o gestor vê o nome que o grupo precisa ter.
  const exemplo = corretores[0]?.nome ?? "Fernando";
  const nomeDeExemplo = nomeEsperadoDoGrupo(padrao.trim() || null, exemplo, nomeDaImobiliaria);
  const jidsEmUso = new Map(corretores.filter((c) => c.grupoJid).map((c) => [c.grupoJid as string, c.id]));

  return (
    <section className="cartao p-5 sm:p-6">
      <h3 className="text-fluid-lg font-semibold text-titulo">Grupos de WhatsApp dos corretores</h3>
      <p className="text-fluid-xs text-apoio mt-1">
        Ao distribuir um lead, o CRM avisa o grupo do corretor. O número central precisa participar de todos os grupos.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-fluid-sm text-corpo grid gap-1">
          Número central
          <select value={escolhida} onChange={(e) => setEscolhida(e.target.value)} disabled={pendente} className="border-linha-forte bg-fundo min-h-11 rounded-xl border px-3">
            <option value="">Desativado</option>
            {instancias.map((i) => <option key={i.instanceName} value={i.instanceName} disabled={!i.conectada}>{i.nome}{i.conectada ? "" : " (desconectado)"}</option>)}
          </select>
        </label>
        <button type="button" disabled={pendente} onClick={() => executar(() => configurarEnvioDeLeadsNosGrupos(escolhida))} className="bg-acento text-sobre-acento text-fluid-sm min-h-11 rounded-xl px-4 font-medium disabled:opacity-60">
          Salvar
        </button>
      </div>

      <div className="border-linha mt-5 grid gap-2 rounded-xl border p-3">
        <label className="text-fluid-sm text-corpo grid gap-1">
          Nome dos grupos
          <input
            value={padrao}
            onChange={(e) => setPadrao(e.target.value)}
            placeholder={PADRAO_DE_FABRICA}
            maxLength={60}
            disabled={pendente}
            className="border-linha-forte bg-fundo min-h-11 rounded-xl border px-3"
          />
        </label>
        <p className="text-fluid-xs text-apoio">
          Use {"{corretor}"} no lugar do nome do corretor e {"{imobiliaria}"} no lugar de &quot;{nomeDaImobiliaria}&quot;. Maiúsculas, acentos e emoji não importam. Exemplo: o grupo de {exemplo} deve se chamar <strong className="text-titulo">{nomeDeExemplo}</strong>.
        </p>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={pendente} onClick={() => executar(() => configurarNomeDosGrupos(padrao))} className="botao-solido text-acento text-fluid-sm min-h-11 px-4 font-semibold disabled:opacity-60">
            Salvar nome
          </button>
          <button type="button" disabled={pendente || !instanciaAtual} onClick={() => executar(sincronizarGruposDeLeads)} className="bg-acento text-sobre-acento text-fluid-sm min-h-11 rounded-xl px-4 font-medium disabled:opacity-60">
            {pendente ? "Sincronizando…" : "Sincronizar grupos"}
          </button>
        </div>
      </div>

      <ul className="divide-linha mt-4 divide-y">
        {corretores.map((c) => (
          <li key={c.id} className="grid gap-2 py-3 sm:flex sm:items-center sm:justify-between">
            <span className="text-fluid-sm grid">
              <span className="text-titulo">{c.nome}</span>
              <span className={`text-fluid-xs ${c.grupoNome ? "text-ok" : "text-apoio"}`}>
                {c.grupoNome ? `${c.grupoNome}${c.manual ? " · escolhido à mão" : ""}` : "grupo não encontrado"}
              </span>
            </span>
            {gruposDoCentral.length > 0 && (
              <select
                aria-label={`Grupo de ${c.nome}`}
                value={c.manual && c.grupoJid ? c.grupoJid : ""}
                disabled={pendente}
                onChange={(e) => executar(() => vincularGrupoDoCorretor(c.id, e.target.value || null))}
                className="border-linha-forte bg-fundo text-fluid-sm min-h-11 rounded-xl border px-3 sm:max-w-64"
              >
                <option value="">Achar pelo nome</option>
                {gruposDoCentral.map((g) => {
                  const deOutro = jidsEmUso.has(g.jid) && jidsEmUso.get(g.jid) !== c.id;
                  return (
                    <option key={g.jid} value={g.jid} disabled={deOutro}>
                      {g.nome}{deOutro ? " (de outro corretor)" : ""}
                    </option>
                  );
                })}
              </select>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
