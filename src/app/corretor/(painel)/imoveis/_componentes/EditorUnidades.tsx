"use client";

import { useMemo, useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { STATUS_UNIDADE_LABEL, type StatusUnidade } from "@/lib/imoveis/unidades";
import { adicionarUnidades, excluirUnidade, mudarStatusDaUnidade } from "../unidadesAcoes";

export type UnidadeNaTela = {
  id: string;
  identificacao: string;
  tipologiaId: string | null;
  status: StatusUnidade;
};

const COR_DO_STATUS: Record<StatusUnidade, string> = {
  disponivel: "bg-ok-lavado text-ok border-ok-linha",
  reservada: "bg-alerta-lavado text-alerta border-alerta-linha",
  vendida: "bg-vidro-forte text-apoio border-linha",
};
const PROXIMO: Record<StatusUnidade, StatusUnidade> = {
  disponivel: "reservada",
  reservada: "vendida",
  vendida: "disponivel",
};

/**
 * Unidades do imóvel (26/09/2026).
 *
 * Cada unidade é um chip: tocar gira o status (disponível → reservada →
 * vendida). É o gesto que o corretor faz mais — marcar que vendeu — então
 * custa um toque. O número de "unidades disponíveis" da vitrine e o que a IA
 * diz ("restam 3 de 2 dormitórios") saem DAQUI.
 */
export function EditorUnidades({
  empreendimentoId,
  slug,
  plantas,
  iniciais,
}: {
  empreendimentoId: string;
  slug: string;
  plantas: Array<{ id: string; nome: string; dormitorios: number }>;
  iniciais: UnidadeNaTela[];
}) {
  const [unidades, setUnidades] = useState(iniciais);
  const [texto, setTexto] = useState("");
  const [planta, setPlanta] = useState<string>(plantas[0]?.id ?? "");
  const [ocupado, iniciar] = useTransition();
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const { avisar, falhar } = useAvisos();

  const grupos = useMemo(() => {
    const porPlanta = new Map<string, UnidadeNaTela[]>();
    for (const u of unidades) {
      const chave = u.tipologiaId ?? "";
      porPlanta.set(chave, [...(porPlanta.get(chave) ?? []), u]);
    }
    return [...porPlanta.entries()].map(([id, lista]) => ({
      id,
      nome: plantas.find((p) => p.id === id)?.nome ?? "Sem planta",
      lista: lista.sort((a, b) => a.identificacao.localeCompare(b.identificacao, "pt-BR", { numeric: true })),
    }));
  }, [unidades, plantas]);

  const disponiveis = unidades.filter((u) => u.status === "disponivel").length;

  function rodar(fn: () => Promise<void>) {
    iniciar(async () => {
      try {
        await fn();
      } catch (err) {
        falhar(ehActionDeOutroBuild(err) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
      }
    });
  }

  function adicionar() {
    rodar(async () => {
      const r = await adicionarUnidades({ empreendimentoId, slug, tipologiaId: planta || null, texto });
      if (r.erro) return falhar(r.erro);
      avisar(r.ok!);
      setTexto("");
      // A lista volta do servidor pela revalidação; recarregar mantém o
      // estado da tela igual ao do banco (ids reais para girar o status).
      window.location.reload();
    });
  }

  function girar(u: UnidadeNaTela) {
    const novo = PROXIMO[u.status];
    setUnidades((atual) => atual.map((x) => (x.id === u.id ? { ...x, status: novo } : x)));
    rodar(async () => {
      const r = await mudarStatusDaUnidade({ id: u.id, slug, status: novo });
      if (r.erro) {
        setUnidades((atual) => atual.map((x) => (x.id === u.id ? { ...x, status: u.status } : x)));
        falhar(r.erro);
      }
    });
  }

  function excluir(u: UnidadeNaTela) {
    if (excluindo !== u.id) return setExcluindo(u.id);
    setExcluindo(null);
    rodar(async () => {
      const r = await excluirUnidade({ id: u.id, slug });
      if (r.erro) return falhar(r.erro);
      setUnidades((atual) => atual.filter((x) => x.id !== u.id));
    });
  }

  return (
    <section className="cartao p-4 sm:p-5 space-y-4" aria-labelledby="titulo-unidades">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="titulo-unidades" className="text-fluid-base font-bold text-titulo">
          Unidades
        </h2>
        {unidades.length > 0 && (
          <span className="text-fluid-xs text-apoio">
            {disponiveis} de {unidades.length} disponíveis · toque para mudar o status
          </span>
        )}
      </div>

      {unidades.length === 0 && (
        <p className="text-fluid-xs text-apoio">
          Cadastre as unidades à venda. O site mostra quantas restam em cada planta e a IA
          passa a dizer &ldquo;restam 3 de 2 dormitórios&rdquo; — nunca o preço.
        </p>
      )}

      {grupos.map((g) => (
        <div key={g.id} className="space-y-2">
          <p className="text-fluid-xs font-semibold text-corpo">{g.nome}</p>
          <ul className="flex flex-wrap gap-2">
            {g.lista.map((u) => (
              <li key={u.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => girar(u)}
                  disabled={ocupado}
                  aria-label={`Unidade ${u.identificacao}: ${STATUS_UNIDADE_LABEL[u.status]}. Tocar muda para ${STATUS_UNIDADE_LABEL[PROXIMO[u.status]]}.`}
                  className={`min-h-11 rounded-xl border px-3 text-fluid-xs font-semibold transition-colors ${COR_DO_STATUS[u.status]} ${u.status === "vendida" ? "line-through" : ""}`}
                >
                  {u.identificacao}
                  <span className="ml-1.5 font-normal">{STATUS_UNIDADE_LABEL[u.status]}</span>
                </button>
                <button
                  type="button"
                  onClick={() => excluir(u)}
                  disabled={ocupado}
                  aria-label={excluindo === u.id ? `Confirmar exclusão da unidade ${u.identificacao}` : `Excluir unidade ${u.identificacao}`}
                  className={`min-h-11 min-w-11 rounded-xl text-fluid-xs ${excluindo === u.id ? "bg-perigo-lavado text-perigo font-bold px-2" : "text-tenue hover:text-perigo"}`}
                >
                  {excluindo === u.id ? "Excluir?" : "×"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div className="space-y-2 border-t border-linha pt-4">
        <label htmlFor="novas-unidades" className="block text-fluid-xs font-semibold text-corpo">
          Adicionar unidades
        </label>
        <textarea
          id="novas-unidades"
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="101 a 110"
          className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento w-full rounded-xl border p-3 focus:outline-none"
        />
        <p className="text-fluid-xs text-tenue">Separe por vírgula ou linha; faixa como &ldquo;101 a 110&rdquo;.</p>
        <div className="flex flex-wrap items-center gap-2">
          {plantas.length > 0 && (
            <select
              aria-label="Planta das unidades"
              value={planta}
              onChange={(e) => setPlanta(e.target.value)}
              className="select-seta text-fluid-sm border-linha-forte bg-campo text-titulo min-h-11 rounded-xl border px-3"
            >
              {plantas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
              <option value="">Sem planta</option>
            </select>
          )}
          <button
            type="button"
            onClick={adicionar}
            disabled={ocupado || !texto.trim()}
            className="min-h-11 rounded-xl bg-acento hover:bg-acento-hover px-4 text-fluid-xs font-bold text-sobre-cor disabled:opacity-60"
          >
            {ocupado ? "Salvando…" : "Adicionar"}
          </button>
        </div>
      </div>
    </section>
  );
}
