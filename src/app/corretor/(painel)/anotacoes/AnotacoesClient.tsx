"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Bell, BellOff, Check, Trash2, User } from "lucide-react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { REGUA_ETAPA } from "@/app/corretor/(painel)/_componentes/etapas";
import { ETAPA_LABEL, type EtapaFunil } from "@/lib/types";
import {
  buscarLeadsParaVincular,
  concluirAnotacao,
  criarAnotacao,
  excluirAnotacao,
  type LeadParaVincular,
} from "./acoes";

/**
 * O bloco de notas em tela (0100): composer no topo, filtros na URL, lista
 * abaixo. Mockup aprovado:
 * https://claude.ai/code/artifact/52ceae23-be2f-4026-baab-473838609ffe
 */

export type AnotacaoNaTela = {
  id: string;
  texto: string;
  criadaEm: string;
  lembreteEm: string | null;
  lembreteWhatsapp: boolean;
  lembreteEnviadoEm: string | null;
  lembreteErro: string | null;
  concluidaEm: string | null;
  souAutor: boolean;
  souDestinatario: boolean;
  autorNome: string;
  destinatarioNome: string;
  lead: { id: string; nome: string; etapa: string } | null;
};

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** `datetime-local` fala hora local; o padrão é amanhã de manhã. */
function amanhaDeManha(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AnotacoesClient({
  anotacoes,
  equipe,
  empreendimentos,
  gestor,
  filtros,
  leadInicial = null,
}: {
  anotacoes: AnotacaoNaTela[];
  equipe: { id: string; nome: string }[];
  empreendimentos: { id: string; nome: string }[];
  gestor: boolean;
  filtros: {
    lead: string | null;
    empreendimento: string | null;
    colega: string | null;
    pendentes: boolean;
  };
  /** Chega preenchido quando a tela abre por ?lead= (vindo da ficha). */
  leadInicial?: LeadParaVincular | null;
}) {
  const { avisar, falhar } = useAvisos();
  // Congelado no primeiro render (regra de pureza): o "Venceu" não precisa
  // de relógio vivo — o refresh pós-ação já re-renderiza com a hora nova.
  const [agora] = useState(() => Date.now());
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, iniciar] = useTransition();

  // ---- composer ----
  const [texto, setTexto] = useState("");
  const [leadVinculado, setLeadVinculado] = useState<LeadParaVincular | null>(leadInicial);
  const [buscaLead, setBuscaLead] = useState("");
  const [sugestoes, setSugestoes] = useState<LeadParaVincular[]>([]);
  const [buscandoLead, setBuscandoLead] = useState(false);
  const [destinatarioId, setDestinatarioId] = useState("");
  const [comLembrete, setComLembrete] = useState(false);
  const [lembreteEm, setLembreteEm] = useState(amanhaDeManha);
  const [avisarWhatsapp, setAvisarWhatsapp] = useState(true);
  const [salvando, setSalvando] = useState(false);

  async function procurarLead(termo: string) {
    setBuscaLead(termo);
    if (termo.trim().length < 2) {
      setSugestoes([]);
      return;
    }
    setBuscandoLead(true);
    try {
      setSugestoes(await buscarLeadsParaVincular(termo));
    } finally {
      setBuscandoLead(false);
    }
  }

  async function salvar() {
    if (salvando) return;
    setSalvando(true);
    try {
      const r = await criarAnotacao({
        texto,
        leadId: leadVinculado?.id ?? null,
        destinatarioId: destinatarioId || null,
        lembreteEm: comLembrete ? new Date(lembreteEm).toISOString() : null,
        lembreteWhatsapp: avisarWhatsapp,
      });
      if (r.erro) {
        falhar(r.erro);
        return;
      }
      avisar(r.ok ?? "Anotado.");
      setTexto("");
      setLeadVinculado(null);
      setBuscaLead("");
      setSugestoes([]);
      setDestinatarioId("");
      setComLembrete(false);
      router.refresh();
    } finally {
      setSalvando(false);
    }
  }

  function atualizarUrl(mudancas: Record<string, string>) {
    const proximos = new URLSearchParams(params.toString());
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor) proximos.set(chave, valor);
      else proximos.delete(chave);
    }
    const qs = proximos.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function concluir(id: string) {
    iniciar(async () => {
      const r = await concluirAnotacao(id);
      if (r.erro) falhar(r.erro);
      else router.refresh();
    });
  }

  function excluir(id: string) {
    iniciar(async () => {
      const r = await excluirAnotacao(id);
      if (r.erro) falhar(r.erro);
      else router.refresh();
    });
  }

  return (
    <div className="mt-4 space-y-4">
      {/* ---- Composer ---- */}
      <div className="cartao space-y-3 p-4">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={3}
          placeholder='Anote algo… ex.: "prefere visitar à noite, ligar antes"'
          aria-label="Nova anotação"
          className="border-linha bg-campo text-corpo placeholder:text-tenue focus:border-linha-forte min-h-20 w-full resize-y rounded-2xl border px-4 py-3 text-sm outline-none"
        />

        <div className="flex flex-wrap items-center gap-2">
          {leadVinculado ? (
            <button
              type="button"
              onClick={() => setLeadVinculado(null)}
              className="border-acento-linha bg-acento-lavado text-acento-suave inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm"
            >
              <User aria-hidden className="h-4 w-4" />
              {leadVinculado.nome}
              <span aria-hidden className="text-apoio">✕</span>
            </button>
          ) : (
            <div className="relative">
              <input
                value={buscaLead}
                onChange={(e) => void procurarLead(e.target.value)}
                placeholder="Vincular lead…"
                aria-label="Buscar lead para vincular"
                className="border-linha-forte bg-campo text-corpo placeholder:text-tenue min-h-11 w-44 rounded-full border px-3.5 text-sm outline-none"
              />
              {(sugestoes.length > 0 || buscandoLead) && buscaLead.trim().length >= 2 && (
                <ul className="border-linha bg-elevado absolute top-12 left-0 z-20 max-h-56 w-64 overflow-y-auto rounded-xl border p-1 shadow-lg">
                  {buscandoLead && sugestoes.length === 0 && (
                    <li className="text-tenue px-3 py-2 text-xs">Procurando…</li>
                  )}
                  {sugestoes.map((l) => (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setLeadVinculado(l);
                          setBuscaLead("");
                          setSugestoes([]);
                        }}
                        className="text-corpo hover:bg-vidro flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-3 text-left text-sm"
                      >
                        {/* `truncate` sozinho não corta dentro de um flex:
                            item de flex tem largura mínima de conteúdo, então
                            o nome comprido empurrava os quatro dígitos do
                            telefone para fora do botão em vez de virar "…". */}
                        <span className="min-w-0 flex-1 truncate">{l.nome}</span>
                        {l.telefone && (
                          <span className="text-tenue shrink-0 text-xs">{l.telefone.slice(-4)}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {equipe.length > 0 && (
            <select
              value={destinatarioId}
              onChange={(e) => setDestinatarioId(e.target.value)}
              aria-label="Direcionar a um colega"
              className="border-linha-forte bg-campo text-corpo min-h-11 rounded-full border px-3 text-sm"
            >
              <option value="">Só para mim</option>
              {equipe.map((c) => (
                <option key={c.id} value={c.id}>
                  Para {c.nome}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setComLembrete((v) => !v)}
            aria-pressed={comLembrete}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors ${
              comLembrete
                ? "border-alerta-linha bg-alerta-lavado text-alerta"
                : "border-linha-forte text-apoio hover:text-corpo"
            }`}
          >
            <Bell aria-hidden className="h-4 w-4" />
            {comLembrete ? "Lembrete ligado" : "Lembrete"}
          </button>
        </div>

        {comLembrete && (
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="datetime-local"
              value={lembreteEm}
              onChange={(e) => setLembreteEm(e.target.value)}
              aria-label="Quando lembrar"
              className="border-linha-forte bg-campo text-corpo min-h-11 rounded-lg border px-3 text-sm"
            />
            <label className="text-apoio flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={avisarWhatsapp}
                onChange={(e) => setAvisarWhatsapp(e.target.checked)}
                className="accent-acento h-4.5 w-4.5 cursor-pointer"
              />
              Avisar no meu WhatsApp
            </label>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void salvar()}
            disabled={salvando || !texto.trim()}
            className="bg-acento hover:bg-acento-hover text-sobre-cor min-h-11 rounded-xl px-6 text-sm font-medium transition-colors disabled:opacity-50"
          >
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>

      {/* ---- Filtros (na URL, como toda lista do painel) ---- */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => atualizarUrl({ pendentes: "" })}
          className={`min-h-11 rounded-full px-4 text-sm transition-colors ${
            !filtros.pendentes ? "bg-acento text-sobre-cor font-medium" : "border-linha-forte text-apoio border"
          }`}
        >
          Todas
        </button>
        <button
          type="button"
          onClick={() => atualizarUrl({ pendentes: "1" })}
          className={`min-h-11 rounded-full px-4 text-sm transition-colors ${
            filtros.pendentes ? "bg-acento text-sobre-cor font-medium" : "border-linha-forte text-apoio border"
          }`}
        >
          Só lembretes
        </button>
        <select
          value={filtros.empreendimento ?? ""}
          onChange={(e) => atualizarUrl({ empreendimento: e.target.value })}
          aria-label="Filtrar por empreendimento"
          className="border-linha-forte bg-campo text-corpo min-h-11 rounded-full border px-3 text-sm"
        >
          <option value="">Todos os empreendimentos</option>
          {empreendimentos.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
        {(gestor || equipe.length > 0) && (
          <select
            value={filtros.colega ?? ""}
            onChange={(e) => atualizarUrl({ colega: e.target.value })}
            aria-label="Filtrar por colega"
            className="border-linha-forte bg-campo text-corpo min-h-11 rounded-full border px-3 text-sm"
          >
            <option value="">Qualquer destinatário</option>
            {equipe.map((c) => (
              <option key={c.id} value={c.id}>
                Para {c.nome}
              </option>
            ))}
          </select>
        )}
        {filtros.lead && (
          <button
            type="button"
            onClick={() => atualizarUrl({ lead: "" })}
            className="border-acento-linha bg-acento-lavado text-acento-suave min-h-11 rounded-full border px-4 text-sm"
          >
            Lead filtrado ✕
          </button>
        )}
      </div>

      {/* ---- Lista ---- */}
      {anotacoes.length === 0 ? (
        <div className="cartao p-6">
          <p className="text-fluid-sm text-corpo">
            Nenhuma anotação {filtros.pendentes || filtros.empreendimento || filtros.colega ? "com esse filtro" : "ainda"}.
            Escreva a primeira ali em cima — vinculada a um lead, ela também aparece na ficha dele.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {anotacoes.map((a) => (
            <li key={a.id} className={`cartao space-y-2.5 p-4 ${a.concluidaEm ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {a.lembreteEm && !a.concluidaEm && (
                    <span
                      className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium ${
                        new Date(a.lembreteEm).getTime() <= agora
                          ? "border-alerta-linha bg-alerta-lavado text-alerta"
                          : "border-linha-forte text-apoio"
                      }`}
                    >
                      {a.lembreteWhatsapp ? (
                        <Bell aria-hidden className="h-3 w-3" />
                      ) : (
                        <BellOff aria-hidden className="h-3 w-3" />
                      )}
                      {new Date(a.lembreteEm).getTime() <= agora ? "Venceu · " : ""}
                      {dataHora.format(new Date(a.lembreteEm))}
                      {a.lembreteEnviadoEm && !a.lembreteErro && " · WhatsApp enviado"}
                      {a.lembreteErro === "sem_whatsapp" && " · só no painel"}
                    </span>
                  )}
                  {!a.souDestinatario && (
                    <span className="border-acento-linha bg-acento-lavado text-acento-suave inline-flex min-h-7 items-center rounded-full border px-2.5 text-xs font-medium">
                      → Para {a.destinatarioNome}
                    </span>
                  )}
                  {a.souDestinatario && !a.souAutor && (
                    <span className="text-tenue text-xs">✍️ De {a.autorNome}</span>
                  )}
                  <span className="text-tenue text-xs">{dataHora.format(new Date(a.criadaEm))}</span>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {!a.concluidaEm && (a.souDestinatario || a.souAutor) && (
                    <button
                      type="button"
                      onClick={() => concluir(a.id)}
                      aria-label="Concluir anotação"
                      className="border-acento-linha bg-acento-lavado text-acento-suave hover:bg-acento hover:text-sobre-cor flex h-11 w-11 items-center justify-center rounded-full border transition-colors"
                    >
                      <Check aria-hidden className="h-4.5 w-4.5" />
                    </button>
                  )}
                  {a.souAutor && (
                    <button
                      type="button"
                      onClick={() => excluir(a.id)}
                      aria-label="Excluir anotação"
                      className="border-linha-forte text-tenue hover:border-perigo-linha hover:text-perigo flex h-11 w-11 items-center justify-center rounded-full border transition-colors"
                    >
                      <Trash2 aria-hidden className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              <p className="text-fluid-sm text-corpo break-words whitespace-pre-wrap">{a.texto}</p>

              {a.lead && (
                <Link
                  href={`/corretor/leads/${a.lead.id}`}
                  className="group flex min-h-11 w-fit items-center gap-2"
                >
                  {/* A mesma régua de cor da lista e do quadro: a etapa se lê
                      antes do texto, em toda tela de lead. */}
                  <span
                    aria-hidden
                    className={`h-4 w-1 rounded-full ${REGUA_ETAPA[a.lead.etapa as EtapaFunil] ?? "bg-linha-forte"}`}
                  />
                  <span className="text-titulo group-hover:text-acento-suave text-sm font-medium underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-current">
                    {a.lead.nome}
                  </span>
                  <span className="text-tenue text-xs">
                    {ETAPA_LABEL[a.lead.etapa as EtapaFunil] ?? a.lead.etapa}
                  </span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
