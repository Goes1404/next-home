"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TabelaLeads } from "./TabelaLeads";
import { EnviarEmMassa } from "./EnviarEmMassa";
import { carregarPaginaLeads } from "./acoes";
import type { FiltroLeads } from "@/lib/corretorSessao";
import {
  ETAPAS_FUNIL,
  ETAPA_LABEL,
  type EtapaFunil,
  type Lead,
  type TemplateMensagem,
} from "@/lib/types";

type Filtro = "todos" | "novos" | "negociando" | "frios";

/**
 * A casca client da lista de leads.
 *
 * Todo filtro vive na URL e é resolvido pelo BANCO (`getPaginaDeLeads`): este
 * componente só escreve `?filtro=`, `?busca=`… e recebe do servidor a página
 * pronta. Antes ele recebia a carteira inteira e filtrava em memória — com
 * ~100 leads por corretor (e a equipe toda para o gestor), era o navegador
 * pagando pelo que o Postgres faz de graça.
 *
 * "Carregar mais" acumula páginas via server action; qualquer mudança de
 * filtro muda a URL, o servidor re-renderiza a primeira página e o acúmulo
 * recomeça (ver `chaveFiltro`).
 */
export function ListaLeads({
  leadsIniciais,
  total,
  filtroServidor,
  gestor,
  equipe,
  templates,
  nomeCorretor,
  whatsappCorretor,
}: {
  leadsIniciais: Lead[];
  total: number;
  filtroServidor: FiltroLeads;
  gestor: boolean;
  equipe: { id: string; nome: string }[];
  templates: TemplateMensagem[];
  nomeCorretor: string;
  whatsappCorretor: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const filtro = (params.get("filtro") ?? "todos") as Filtro;
  const etapaFiltro = params.get("etapa") ?? "";
  const corretorFiltro = params.get("corretor") ?? "";
  const dataDe = params.get("de") ?? "";
  const dataAte = params.get("ate") ?? "";

  // A busca é o único filtro com estado local: o input precisa responder a
  // cada tecla, e a URL só muda depois da pausa de digitação (400ms).
  const [busca, setBusca] = useState(params.get("busca") ?? "");
  const buscaNaUrl = params.get("busca") ?? "";

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalAberto, setModalAberto] = useState(false);

  // Páginas além da primeira, acumuladas pelo botão "carregar mais". O
  // contador é estado próprio (e não `leads.length / 30`) porque o dedup
  // abaixo pode encolher uma página — a conta derivada pediria a mesma
  // página para sempre.
  const [extras, setExtras] = useState<Lead[]>([]);
  const [paginasCarregadas, setPaginasCarregadas] = useState(1);
  const [carregandoMais, iniciarCarregamento] = useTransition();

  // Assinatura do filtro atual: quando ela muda, a primeira página que chegou
  // do servidor é de outro recorte — o acúmulo e a seleção não valem mais.
  // Ajuste de estado durante o render (padrão do React para estado derivado),
  // sem efeito nem render extra visível.
  const chaveFiltro = JSON.stringify(filtroServidor);
  const [chaveAnterior, setChaveAnterior] = useState(chaveFiltro);
  if (chaveFiltro !== chaveAnterior) {
    setChaveAnterior(chaveFiltro);
    setExtras([]);
    setPaginasCarregadas(1);
    setSelecionados(new Set());
  }

  const leads = [...leadsIniciais, ...extras];

  function atualizarUrl(mudancas: Record<string, string>) {
    const proximos = new URLSearchParams(params.toString());
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor) proximos.set(chave, valor);
      else proximos.delete(chave);
    }
    const qs = proximos.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  // Debounce da busca. O guard (`busca === buscaNaUrl`) evita o replace
  // inútil no primeiro render e o loop quando a própria URL muda por fora.
  useEffect(() => {
    if (busca === buscaNaUrl) return;
    const timer = setTimeout(() => {
      const proximos = new URLSearchParams(params.toString());
      if (busca) proximos.set("busca", busca);
      else proximos.delete("busca");
      const qs = proximos.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, 400);
    return () => clearTimeout(timer);
  }, [busca, buscaNaUrl, params, pathname, router]);

  function carregarMais() {
    const proximaPagina = paginasCarregadas;
    iniciarCarregamento(async () => {
      const pagina = await carregarPaginaLeads(filtroServidor, proximaPagina);
      // Dedup por id: um lead novo pode ter entrado entre uma página e outra,
      // deslocando o range — sem isso a mesma linha aparecia duas vezes.
      setExtras((atuais) => {
        const vistos = new Set([...leadsIniciais, ...atuais].map((l) => l.id));
        return [...atuais, ...pagina.leads.filter((l) => !vistos.has(l.id))];
      });
      setPaginasCarregadas(proximaPagina + 1);
    });
  }

  const todosCarregadosSelecionados =
    leads.length > 0 && leads.every((l) => selecionados.has(l.id));

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function alternarSelecaoTodos() {
    setSelecionados(() =>
      todosCarregadosSelecionados ? new Set() : new Set(leads.map((l) => l.id)),
    );
  }

  const leadsSelecionados = leads.filter((l) => selecionados.has(l.id));
  const semNenhumLead = total === 0 && !temFiltroAtivo();

  function temFiltroAtivo(): boolean {
    return Boolean(buscaNaUrl || etapaFiltro || corretorFiltro || dataDe || dataAte || filtro !== "todos");
  }

  return (
    <div>
      <div className="scrollbar-none mt-6 -mx-4 flex gap-2 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0">
        {(["todos", "novos", "negociando", "frios"] as Filtro[]).map((f) => (
          <button
            key={f}
            onClick={() => atualizarUrl({ filtro: f === "todos" ? "" : f, etapa: "" })}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              filtro === f && !etapaFiltro
                ? "bg-acento text-white"
                : "bg-superficie text-apoio hover:bg-elevado hover:text-corpo"
            }`}
          >
            {f === "todos" && "Todos"}
            {f === "novos" && "Novos/Quentes"}
            {f === "negociando" && "Em Negociação"}
            {f === "frios" && "Frios/Concluídos"}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {gestor && (
          <select
            value={corretorFiltro}
            onChange={(e) => atualizarUrl({ corretor: e.target.value })}
            className="text-fluid-xs rounded-lg border border-linha-forte bg-campo px-3 py-2 text-corpo"
          >
            <option value="">Todos os corretores</option>
            {equipe.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        )}
        <select
          value={etapaFiltro}
          onChange={(e) => atualizarUrl({ etapa: e.target.value, filtro: "" })}
          className="text-fluid-xs rounded-lg border border-linha-forte bg-campo px-3 py-2 text-corpo"
        >
          <option value="">Todas as etapas</option>
          {ETAPAS_FUNIL.map((etapa: EtapaFunil) => (
            <option key={etapa} value={etapa}>
              {ETAPA_LABEL[etapa]}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={dataDe}
          onChange={(e) => atualizarUrl({ de: e.target.value })}
          className="text-fluid-xs rounded-lg border border-linha-forte bg-campo px-3 py-2 text-corpo"
        />
        <input
          type="date"
          value={dataAte}
          onChange={(e) => atualizarUrl({ ate: e.target.value })}
          className="text-fluid-xs rounded-lg border border-linha-forte bg-campo px-3 py-2 text-corpo"
        />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar nome ou telefone"
          className="text-fluid-xs rounded-lg border border-linha-forte bg-campo px-3 py-2 text-corpo sm:col-span-2 lg:col-span-4"
        />
      </div>

      {leads.length > 0 && (
        <label className="text-fluid-xs text-apoio mt-2 flex min-h-11 w-fit cursor-pointer items-center gap-2.5">
          <input
            type="checkbox"
            checked={todosCarregadosSelecionados}
            onChange={alternarSelecaoTodos}
            className="accent-acento h-4.5 w-4.5 cursor-pointer"
          />
          Selecionar todos ({leads.length})
        </label>
      )}

      {semNenhumLead ? (
        <div className="mt-8 rounded-2xl border border-linha bg-superficie p-6">
          <p className="text-fluid-sm text-corpo">
            Nenhum contato ainda. Compartilhe seu link pessoal — todo formulário preenchido a
            partir dele chega aqui com seu nome.
          </p>
          <Link
            href="/corretor/links"
            className="text-fluid-sm mt-3 inline-block font-medium text-acento-suave underline-offset-4 hover:underline"
          >
            Pegar meus links →
          </Link>
        </div>
      ) : leads.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-linha bg-superficie p-6 text-center">
          <p className="text-fluid-sm text-apoio">Nenhum lead encontrado neste filtro.</p>
        </div>
      ) : (
        <div
          // Só reserva espaço para a barra de seleção quando ela existe; a
          // reserva fixa deixava um vão morto no fim da lista o tempo todo.
          className={`mt-4 ${selecionados.size > 0 ? "pb-40" : "pb-8"}`}
        >
          <TabelaLeads
            leads={leads}
            gestor={gestor}
            selecionados={selecionados}
            aoAlternarSelecao={alternarSelecao}
          />

          {leads.length < total && (
            <div className="mt-4 flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={carregarMais}
                disabled={carregandoMais}
                className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo flex min-h-11 cursor-pointer items-center rounded-full border px-6 font-medium transition-colors disabled:opacity-60"
              >
                {carregandoMais
                  ? "Carregando…"
                  : `Carregar mais (${Math.min(30, total - leads.length)})`}
              </button>
              <p className="text-fluid-xs text-tenue tabular-nums">
                {leads.length} de {total}
              </p>
            </div>
          )}
        </div>
      )}

      {selecionados.size > 0 && !modalAberto && (
        // `acima-da-nav` em vez de `bottom-0`: no celular a navegação
        // inferior ocupa exatamente esse espaço, e as duas barras fixas se
        // sobrepunham — a de seleção ficava atrás da navegação, com o botão
        // "Enviar mensagem" inalcançável justamente depois de selecionar os
        // leads. Empilhadas, as duas cabem.
        <div className="acima-da-nav border-linha bg-fundo/95 fixed inset-x-0 z-45 border-t p-3 backdrop-blur-md sm:p-4">
          <div className="mx-auto flex w-full max-w-[84rem] items-center justify-between gap-2 px-1 md:px-4">
            <p className="text-fluid-sm shrink-0 whitespace-nowrap text-corpo">
              {selecionados.size} selecionado(s)
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => setSelecionados(new Set())}
                className="text-fluid-sm border-linha-forte text-corpo flex min-h-11 items-center rounded-lg border px-3 whitespace-nowrap"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => setModalAberto(true)}
                className="text-fluid-sm bg-acento hover:bg-acento-hover flex min-h-11 items-center rounded-lg px-4 font-medium whitespace-nowrap text-white transition-colors"
              >
                Enviar mensagem
              </button>
            </div>
          </div>
        </div>
      )}

      {modalAberto && (
        <EnviarEmMassa
          leadsSelecionados={leadsSelecionados}
          templates={templates}
          nomeCorretor={nomeCorretor}
          whatsappCorretor={whatsappCorretor}
          onFechar={() => {
            setModalAberto(false);
            setSelecionados(new Set());
          }}
        />
      )}
    </div>
  );
}
