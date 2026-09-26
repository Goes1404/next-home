"use client";

import { useMemo, useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { PRAZOS_DE_RESERVA, STATUS_UNIDADE_LABEL, type StatusUnidade } from "@/lib/imoveis/unidades";
import { lerTabelaDeDisponibilidade, type LinhaDeDisponibilidade } from "@/lib/imoveis/tabelaDeDisponibilidade";
import {
  adicionarUnidades,
  aplicarDisponibilidade,
  excluirUnidade,
  lerTabelaDeUnidadesPdf,
  mudarStatusDaUnidade,
} from "../unidadesAcoes";

export type UnidadeNaTela = {
  id: string;
  identificacao: string;
  tipologiaId: string | null;
  status: StatusUnidade;
  /** Fim da reserva (0121); vencida, a unidade volta a disponível sozinha. */
  reservadaAte?: string | null;
};

const dataCurta = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

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
 * custa um toque. A reserva pode ter prazo (vencido, volta a disponível no
 * tique dos follow-ups), e o espelho de vendas da construtora pode ser
 * colado ou lido do PDF para atualizar tudo de uma vez. O número de "unidades disponíveis" da vitrine e o que a IA
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
  const [prazo, setPrazo] = useState<number | null>(null);
  const [tabela, setTabela] = useState("");
  const [previa, setPrevia] = useState<{ linhas: LinhaDeDisponibilidade[]; ignoradas: number } | null>(null);
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
    setUnidades((atual) => atual.map((x) => (x.id === u.id ? { ...x, status: novo, reservadaAte: null } : x)));
    rodar(async () => {
      const r = await mudarStatusDaUnidade({ id: u.id, slug, status: novo, diasDeReserva: novo === "reservada" ? prazo : null });
      if (r.erro) {
        setUnidades((atual) =>
          atual.map((x) => (x.id === u.id ? { ...x, status: u.status, reservadaAte: u.reservadaAte } : x)),
        );
        return falhar(r.erro);
      }
      // O prazo é calculado no servidor (fuso de SP); a tela mostra o que ficou gravado.
      setUnidades((atual) => atual.map((x) => (x.id === u.id ? { ...x, reservadaAte: r.reservadaAte ?? null } : x)));
    });
  }

  function preverTabela(texto: string) {
    const r = lerTabelaDeDisponibilidade(texto);
    if (r.linhas.length === 0) return falhar("Nenhuma unidade reconhecida. Confira se a primeira coluna é o número da unidade.");
    setPrevia(r);
  }

  function lerPdf(arquivo: File) {
    rodar(async () => {
      const fd = new FormData();
      fd.set("arquivo", arquivo);
      const r = await lerTabelaDeUnidadesPdf(fd);
      if (!r.ok) return falhar(r.erro);
      setTabela(r.texto);
      preverTabela(r.texto);
    });
  }

  function aplicarTabela() {
    if (!previa) return;
    rodar(async () => {
      const r = await aplicarDisponibilidade({ empreendimentoId, slug, linhas: previa.linhas });
      if (r.erro) return falhar(r.erro);
      avisar(r.ok!);
      window.location.reload();
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

      {unidades.length > 0 && (
        <label className="flex flex-wrap items-center gap-2 text-fluid-xs text-corpo">
          Reserva vale por
          <select
            value={prazo ?? ""}
            onChange={(e) => setPrazo(e.target.value ? Number(e.target.value) : null)}
            className="select-seta text-fluid-xs border-linha-forte bg-campo text-titulo min-h-11 rounded-xl border px-3"
          >
            {PRAZOS_DE_RESERVA.map((d) => (
              <option key={d ?? "sem"} value={d ?? ""}>
                {d ? `${d} dias` : "sem prazo"}
              </option>
            ))}
          </select>
          <span className="text-tenue">— vencida, volta a disponível sozinha</span>
        </label>
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
                  <span className="ml-1.5 font-normal">
                    {STATUS_UNIDADE_LABEL[u.status]}
                    {u.status === "reservada" && u.reservadaAte ? ` até ${dataCurta.format(new Date(u.reservadaAte))}` : ""}
                  </span>
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

      <details className="border-t border-linha pt-4">
        <summary className="min-h-11 flex items-center cursor-pointer text-fluid-xs font-semibold text-corpo">
          Atualizar pela tabela da construtora
        </summary>
        <div className="mt-2 space-y-2">
          <p className="text-fluid-xs text-apoio">
            Cole o espelho de vendas (planilha) ou envie o PDF. Primeira coluna com o número da unidade; a
            situação (vendida, reservada, disponível) ou o preço em outra coluna.
          </p>
          <textarea
            rows={4}
            value={tabela}
            onChange={(e) => {
              setTabela(e.target.value);
              setPrevia(null);
            }}
            aria-label="Tabela de disponibilidade"
            className="text-fluid-sm border-linha-forte bg-campo text-titulo focus:border-acento w-full rounded-xl border p-3 focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => preverTabela(tabela)}
              disabled={ocupado || !tabela.trim()}
              className="min-h-11 rounded-xl border border-linha-forte px-4 text-fluid-xs font-semibold text-corpo disabled:opacity-60"
            >
              Conferir
            </button>
            <label className="min-h-11 inline-flex items-center rounded-xl border border-linha-forte px-4 text-fluid-xs font-semibold text-corpo cursor-pointer">
              Enviar PDF
              <input
                type="file"
                accept="application/pdf"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) lerPdf(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
          {previa && (
            <div className="rounded-xl border border-acento-linha bg-acento-lavado p-3 space-y-2">
              <p className="text-fluid-xs text-corpo">
                {previa.linhas.length} unidades reconhecidas:{" "}
                {(["disponivel", "reservada", "vendida"] as const)
                  .map((st) => `${previa.linhas.filter((l) => l.status === st).length} ${STATUS_UNIDADE_LABEL[st].toLowerCase()}`)
                  .join(" · ")}
                {previa.ignoradas > 0 ? ` · ${previa.ignoradas} linha(s) ignorada(s)` : ""}
              </p>
              <button
                type="button"
                onClick={aplicarTabela}
                disabled={ocupado}
                className="min-h-11 rounded-xl bg-acento hover:bg-acento-hover px-4 text-fluid-xs font-bold text-sobre-cor disabled:opacity-60"
              >
                Aplicar ao imóvel
              </button>
            </div>
          )}
        </div>
      </details>
    </section>
  );
}
