"use client";

import { useMemo, useState, useTransition } from "react";
import { salvarRoleta } from "./roletaAcoes";
import { TEXTO_ABERTURA_PADRAO, TEXTO_PASSAGEM_PADRAO, preencherTexto } from "@/lib/whatsapp/roletaTextos";
import { primeiroNome } from "@/lib/format";

export type ConfigDaRoleta = {
  corretorId: string;
  ligada: boolean;
  destinos: string[];
  textoPassagem: string;
  textoAbertura: string;
};

type Membro = { id: string; nome: string; conectado: boolean };

/**
 * Editor da roleta dos anúncios (0204). O corretor edita a do próprio
 * número; o ADM escolhe de quem é a roleta no seletor do topo.
 */
export function EditorDaRoleta({
  configs,
  equipe,
  meuId,
  gestor,
}: {
  configs: ConfigDaRoleta[];
  equipe: Membro[];
  meuId: string;
  gestor: boolean;
}) {
  const inicial = configs.find((c) => c.corretorId === meuId) ?? configs[0];
  const [donoId, setDonoId] = useState(inicial.corretorId);
  const [rascunhos, setRascunhos] = useState<Record<string, ConfigDaRoleta>>(
    () => Object.fromEntries(configs.map((c) => [c.corretorId, c])),
  );
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();

  const c = rascunhos[donoId];
  const nomeDe = useMemo(() => new Map(equipe.map((m) => [m.id, m])), [equipe]);
  const dono = nomeDe.get(donoId);

  function mudar(parcial: Partial<ConfigDaRoleta>) {
    setAviso(null);
    setRascunhos((r) => ({ ...r, [donoId]: { ...r[donoId], ...parcial } }));
  }

  function alternar(id: string) {
    mudar({ destinos: c.destinos.includes(id) ? c.destinos.filter((d) => d !== id) : [...c.destinos, id] });
  }

  function mover(id: string, passo: -1 | 1) {
    const lista = [...c.destinos];
    const i = lista.indexOf(id);
    const j = i + passo;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    mudar({ destinos: lista });
  }

  function salvar() {
    iniciar(async () => {
      try {
        const r = await salvarRoleta({ ...c, corretorId: donoId });
        setAviso(r.erro ? { tipo: "erro", texto: r.erro } : { tipo: "ok", texto: "Roleta salva." });
      } catch {
        setAviso({ tipo: "erro", texto: "Não foi possível salvar agora. Recarregue a página e tente de novo." });
      }
    });
  }

  const primeiro = c.destinos[0] ? primeiroNome(nomeDe.get(c.destinos[0])?.nome ?? "") : "Bruna";
  const exemplo = { corretor: primeiro, cliente: "Ana", imovel: "Dom Parque", imobiliaria: "Next Home" };
  const foraDaLista = equipe.filter((m) => !c.destinos.includes(m.id));

  return (
    <section className="cartao space-y-5 p-5 sm:p-6">
      <div>
        <h2 className="text-fluid-lg font-semibold text-titulo">Roleta dos meus anúncios</h2>
        <p className="mt-1 text-fluid-sm text-corpo">
          Quando um cliente novo chega pelo anúncio do WhatsApp, ele vai para o próximo corretor da lista, um para cada.
          O número dele manda a primeira mensagem na hora, e o seu avisa o cliente de quem vai atender. A IA não responde
          leads de anúncio.
        </p>
      </div>

      {gestor && configs.length > 1 && (
        <label className="block text-fluid-sm">
          <span className="text-corpo">Roleta do número de</span>
          <select
            value={donoId}
            onChange={(e) => {
              setAviso(null);
              setDonoId(e.target.value);
            }}
            className="select-seta mt-1 block min-h-11 w-full rounded-xl border border-linha-forte bg-elevado px-3 text-titulo"
          >
            {configs.map((cfg) => (
              <option key={cfg.corretorId} value={cfg.corretorId}>
                {nomeDe.get(cfg.corretorId)?.nome ?? "Corretor"}
                {cfg.ligada ? " (ligada)" : ""}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex min-h-11 items-center gap-3 text-fluid-sm text-titulo">
        <input type="checkbox" checked={c.ligada} onChange={(e) => mudar({ ligada: e.target.checked })} className="h-5 w-5" />
        Roleta ligada{dono && donoId !== meuId ? ` no número de ${primeiroNome(dono.nome)}` : ""}
      </label>

      <div>
        <h3 className="text-fluid-sm font-semibold text-titulo">Quem recebe, nesta ordem</h3>
        {c.destinos.length === 0 && <p className="mt-1 text-fluid-sm text-corpo">Ninguém ainda. Escolha abaixo.</p>}
        <ol className="mt-2 space-y-2">
          {c.destinos.map((id, i) => {
            const m = nomeDe.get(id);
            return (
              <li key={id} className="flex min-w-0 items-center gap-2 rounded-xl border border-linha px-3 py-2">
                <span className="w-6 shrink-0 text-fluid-sm text-corpo">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate text-fluid-sm text-titulo">
                  {m?.nome ?? "Corretor"}
                  {m && !m.conectado && <span className="ml-2 text-alerta">· WhatsApp fora do ar, é pulado</span>}
                </span>
                <button type="button" onClick={() => mover(id, -1)} disabled={i === 0} aria-label="Subir" className="botao-icone h-11 w-11 shrink-0 disabled:opacity-40">
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => mover(id, 1)}
                  disabled={i === c.destinos.length - 1}
                  aria-label="Descer"
                  className="botao-icone h-11 w-11 shrink-0 disabled:opacity-40"
                >
                  ↓
                </button>
                <button type="button" onClick={() => alternar(id)} aria-label="Tirar da lista" className="botao-icone h-11 w-11 shrink-0">
                  ✕
                </button>
              </li>
            );
          })}
        </ol>
        {foraDaLista.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {foraDaLista.map((m) => (
              <button key={m.id} type="button" onClick={() => alternar(m.id)} className="botao-secundario min-h-11 rounded-full px-4 text-fluid-sm">
                + {m.nome}
                {m.id === donoId ? " (eu)" : ""}
              </button>
            ))}
          </div>
        )}
      </div>

      <label className="block text-fluid-sm">
        <span className="font-semibold text-titulo">Mensagem do seu número ao cliente</span>
        <textarea
          rows={2}
          value={c.textoPassagem}
          onChange={(e) => mudar({ textoPassagem: e.target.value })}
          className="mt-1 block w-full rounded-xl border border-linha-forte bg-elevado p-3 text-titulo"
        />
        <span className="mt-1 block break-words text-corpo">Prévia: {preencherTexto(c.textoPassagem || TEXTO_PASSAGEM_PADRAO, exemplo)}</span>
      </label>

      <label className="block text-fluid-sm">
        <span className="font-semibold text-titulo">Primeira mensagem do corretor que recebe</span>
        <textarea
          rows={3}
          value={c.textoAbertura}
          onChange={(e) => mudar({ textoAbertura: e.target.value })}
          className="mt-1 block w-full rounded-xl border border-linha-forte bg-elevado p-3 text-titulo"
        />
        <span className="mt-1 block break-words text-corpo">Prévia: {preencherTexto(c.textoAbertura || TEXTO_ABERTURA_PADRAO, exemplo)}</span>
        <span className="mt-1 block text-corpo">
          Use {"{corretor}"}, {"{cliente}"}, {"{imovel}"} e {"{imobiliaria}"}. O que não for conhecido some da frase.
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="botao-vivo inline-flex min-h-11 items-center rounded-full bg-acento px-5 text-fluid-sm font-semibold text-sobre-cor disabled:opacity-60"
        >
          {salvando ? "Salvando…" : "Salvar roleta"}
        </button>
        {aviso && (
          <p role="status" className={aviso.tipo === "erro" ? "text-fluid-sm text-perigo" : "text-fluid-sm text-ok"}>
            {aviso.texto}
          </p>
        )}
      </div>
    </section>
  );
}
