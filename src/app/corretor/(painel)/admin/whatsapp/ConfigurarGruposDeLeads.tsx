"use client";

import { useOptimistic, useState, useTransition } from "react";
import { MessagesSquare, RefreshCw } from "lucide-react";
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

const CAMPO = "select-seta min-h-11 w-full rounded-xl border border-linha-forte bg-superficie px-3 text-fluid-sm text-titulo shadow-sm";
const BOTAO_SECUNDARIO = "botao-solido min-h-11 shrink-0 px-4 text-fluid-sm font-semibold text-acento disabled:opacity-60";

/**
 * Os grupos de WhatsApp dos corretores (aba Roleta de Anúncios pagos desde
 * 26/10/2026): em passos, porque a ordem importa. Sem número central não há
 * o que sincronizar; sem o nome certo a sincronização não acha o grupo.
 */
export function ConfigurarGruposDeLeads({
  instanciaAtual,
  instancias,
  corretores,
  padraoDoNome,
  nomeDaImobiliaria,
  gruposDoCentral,
  erroDosGrupos,
}: {
  instanciaAtual: string | null;
  instancias: Instancia[];
  corretores: Corretor[];
  padraoDoNome: string | null;
  nomeDaImobiliaria: string;
  gruposDoCentral: GrupoDoCentral[];
  erroDosGrupos?: string;
}) {
  const [escolhida, setEscolhida] = useState(instanciaAtual ?? "");
  const [padrao, setPadrao] = useState(padraoDoNome ?? "");
  const [pendente, iniciar] = useTransition();
  // À parte: a escolha à mão não trava o resto nem diz "Sincronizando…".
  const [, iniciarEscolha] = useTransition();
  const { avisar, falhar } = useAvisos();
  // A escolha à mão aparece na hora; o servidor confirma em segundo plano (a
  // tela recarregada traz o valor salvo, ou o antigo se der erro).
  const [escolhas, escolher] = useOptimistic<Record<string, string>, { id: string; jid: string }>(
    {},
    (atual, e) => ({ ...atual, [e.id]: e.jid }),
  );

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
  const nomeDoCorretor = new Map(corretores.map((c) => [c.id, c.nome]));
  // O seletor à mão fica sempre à vista; sem grupos para escolher, ele diz o porquê.
  const semEscolha = !instanciaAtual
    ? "Salve o número central"
    : erroDosGrupos
      ? "Grupos não lidos"
      : gruposDoCentral.length === 0
        ? "Nenhum grupo no número"
        : null;

  return (
    <section id="grupos" className="cartao scroll-mt-28 space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-acento-lavado text-acento">
            <MessagesSquare aria-hidden className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="text-fluid-lg font-semibold text-titulo">Grupos de WhatsApp dos corretores</h3>
            <p className="mt-1 max-w-2xl text-fluid-sm text-apoio">
              Onde o aviso de cada lead chega. O número central precisa participar de todos os grupos.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={pendente || !instanciaAtual}
          onClick={() => executar(sincronizarGruposDeLeads)}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-acento px-5 text-fluid-sm font-semibold text-sobre-cor disabled:opacity-60"
        >
          <RefreshCw aria-hidden className="size-4" />
          {pendente ? "Sincronizando…" : "Sincronizar grupos"}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Passo numero={1} titulo="Número central" ajuda="O número da imobiliária que manda os avisos nos grupos.">
          <div className="flex flex-wrap gap-2">
            <label className="min-w-48 flex-1">
              <span className="sr-only">Número central</span>
              <select value={escolhida} onChange={(e) => setEscolhida(e.target.value)} disabled={pendente} className={CAMPO}>
                <option value="">Desativado</option>
                {instancias.map((i) => (
                  <option key={i.instanceName} value={i.instanceName} disabled={!i.conectada}>
                    {i.nome}
                    {i.conectada ? "" : " (desconectado)"}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={pendente} onClick={() => executar(() => configurarEnvioDeLeadsNosGrupos(escolhida))} className={BOTAO_SECUNDARIO}>
              Salvar
            </button>
          </div>
        </Passo>

        <Passo
          numero={2}
          titulo="Nome dos grupos"
          ajuda={
            <>
              Use {"{corretor}"} no lugar do nome e {"{imobiliaria}"} no lugar de &quot;{nomeDaImobiliaria}&quot;. O grupo de{" "}
              {exemplo} deve se chamar <strong className="text-titulo">{nomeDeExemplo}</strong>.
            </>
          }
        >
          <div className="flex flex-wrap gap-2">
            <label className="min-w-48 flex-1">
              <span className="sr-only">Nome dos grupos</span>
              <input
                value={padrao}
                onChange={(e) => setPadrao(e.target.value)}
                placeholder={PADRAO_DE_FABRICA}
                maxLength={60}
                disabled={pendente}
                className={CAMPO.replace("select-seta ", "")}
              />
            </label>
            <button type="button" disabled={pendente} onClick={() => executar(() => configurarNomeDosGrupos(padrao))} className={BOTAO_SECUNDARIO}>
              Salvar nome
            </button>
          </div>
        </Passo>
      </div>

      <div className="space-y-2">
        <div aria-hidden className="hidden px-3 text-fluid-xs font-semibold tracking-wider text-apoio uppercase md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_17rem] md:gap-3">
          <span>Corretor</span>
          <span>Grupo</span>
          <span>Escolher à mão</span>
        </div>
        {semEscolha && (
          <p className="px-3 text-fluid-xs text-alerta">
            Escolher à mão fica travado até o número central mostrar os grupos: {semEscolha.toLowerCase()}. Veja abaixo.
          </p>
        )}
        <ul className="space-y-2">
          {corretores.map((c) => (
            <li
              key={c.id}
              className="grid gap-2 rounded-2xl border border-linha bg-vidro px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_17rem] md:items-center md:gap-3"
            >
              <span className="min-w-0 break-words text-fluid-sm font-semibold text-titulo">{c.nome}</span>
              <span className="flex flex-wrap items-center gap-2">
                <span
                  className={
                    c.grupoNome
                      ? "inline-flex items-center rounded-full bg-ok-lavado px-2.5 py-1 text-fluid-xs font-semibold break-all text-ok"
                      : "inline-flex items-center rounded-full border border-alerta-linha bg-alerta-lavado px-2.5 py-1 text-fluid-xs font-semibold text-alerta"
                  }
                >
                  {c.grupoNome ?? "Grupo não encontrado"}
                </span>
                {c.manual && <span className="text-fluid-xs text-apoio">escolhido à mão</span>}
              </span>
              <select
                aria-label={`Grupo de ${c.nome}`}
                value={escolhas[c.id] ?? (c.manual && c.grupoJid ? c.grupoJid : "")}
                disabled={semEscolha !== null}
                onChange={(e) => {
                  const jid = e.target.value;
                  iniciarEscolha(async () => {
                    escolher({ id: c.id, jid });
                    try {
                      const r = await vincularGrupoDoCorretor(c.id, jid || null);
                      if (r.erro) falhar(r.erro);
                      else if (r.ok) avisar(r.ok);
                    } catch {
                      falhar("Não foi possível concluir agora. Tente novamente.");
                    }
                  });
                }}
                className={`${CAMPO} disabled:opacity-60`}
              >
                <option value="">{semEscolha ?? "Achar pelo nome"}</option>
                {gruposDoCentral.map((g) => {
                  const deOutro = jidsEmUso.has(g.jid) && jidsEmUso.get(g.jid) !== c.id;
                  return (
                    <option key={g.jid} value={g.jid} disabled={deOutro}>
                      {g.nome}
                      {deOutro ? " (de outro corretor)" : ""}
                    </option>
                  );
                })}
              </select>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <p className="text-fluid-sm font-semibold text-titulo">
          Grupos neste número{instanciaAtual && !erroDosGrupos ? ` (${gruposDoCentral.length})` : ""}
        </p>
        {!instanciaAtual ? (
          <p className="text-fluid-xs text-apoio">Salve o número central para ver os grupos de que ele participa.</p>
        ) : erroDosGrupos ? (
          <p className="rounded-xl border border-alerta-linha bg-alerta-lavado px-3 py-2 text-fluid-xs text-alerta">
            Não foi possível ler os grupos do número central: {erroDosGrupos}
          </p>
        ) : gruposDoCentral.length === 0 ? (
          <p className="text-fluid-xs text-apoio">
            O número central não participa de nenhum grupo. Adicione-o aos grupos dos corretores e recarregue a página.
          </p>
        ) : (
          <ul className="max-h-80 space-y-1.5 overflow-y-auto rounded-2xl border border-linha bg-vidro p-2">
            {gruposDoCentral.map((g) => {
              const dono = jidsEmUso.get(g.jid);
              return (
                <li key={g.jid} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-2 py-1.5">
                  <span className="min-w-0 break-words text-fluid-sm text-titulo">{g.nome}</span>
                  <span
                    className={
                      dono
                        ? "rounded-full bg-ok-lavado px-2.5 py-0.5 text-fluid-xs font-semibold text-ok"
                        : "rounded-full border border-linha px-2.5 py-0.5 text-fluid-xs text-apoio"
                    }
                  >
                    {dono ? nomeDoCorretor.get(dono) : "livre"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function Passo({
  numero,
  titulo,
  ajuda,
  children,
}: {
  numero: number;
  titulo: string;
  ajuda: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-3.5 rounded-2xl border border-linha bg-vidro p-4">
      <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-acento font-bold text-sobre-cor">
        {numero}
      </span>
      <div className="min-w-0 space-y-2.5">
        <div>
          <p className="text-fluid-sm font-semibold text-titulo">{titulo}</p>
          <p className="mt-0.5 text-fluid-xs text-apoio">{ajuda}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
