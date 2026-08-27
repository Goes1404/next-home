"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TabelaLeads } from "./TabelaLeads";
import { EnviarEmMassa } from "./EnviarEmMassa";
import {
  arquivarLeadsEmLote,
  carregarPaginaLeads,
  excluirLeadsEmLote,
  restaurarLeadsEmLote,
  type ResultadoLote,
} from "./acoes";
import { moverEtapaEmMassa } from "@/app/corretor/actions";
import { PONTO_ETAPA } from "@/app/corretor/(painel)/_componentes/etapas";
import { BuscaLeads } from "@/app/corretor/(painel)/_componentes/BuscaLeads";
import type { FiltroLeads } from "@/lib/corretorSessao";
import {
  ETAPAS_FUNIL,
  ETAPA_LABEL,
  type EtapaFunil,
  type Lead,
  type TemplateMensagem,
} from "@/lib/types";

type Filtro = "todos" | "hoje" | "novos" | "conversa" | "visitas" | "frios";

/**
 * Chips de segmento, na ordem do dia: o que pede ação vem primeiro.
 *
 * Cada chip carrega a cor das etapas que ele recorta — a mesma da régua, do
 * quadro e do termômetro. Assim o chip "Visitas" é azul aqui, a linha do
 * lead é azul na lista e a coluna é azul no quadro: uma escala de cor só
 * para o painel inteiro, em vez de decoração por tela.
 */
const CHIPS: { valor: Filtro; label: string; cor?: string }[] = [
  { valor: "todos", label: "Todos" },
  { valor: "hoje", label: "Hoje" },
  { valor: "novos", label: "Novos", cor: "bg-acento" },
  { valor: "conversa", label: "Em conversa", cor: "bg-etapa-ciano" },
  { valor: "visitas", label: "Visitas", cor: "bg-etapa-azul" },
  { valor: "frios", label: "Frios", cor: "bg-tenue/45" },
];

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
  verArquivados = false,
}: {
  leadsIniciais: Lead[];
  total: number;
  filtroServidor: FiltroLeads;
  gestor: boolean;
  equipe: { id: string; nome: string }[];
  templates: TemplateMensagem[];
  nomeCorretor: string;
  whatsappCorretor: string;
  /**
   * A lista está mostrando os ARQUIVADOS.
   *
   * Muda quais ações a seleção oferece, e é o que mantém a regra de dois
   * passos da 0055 de pé: arquivar só existe na lista ativa, excluir só
   * existe aqui. Nunca o mesmo botão no mesmo lugar — apagar não pode ser
   * um toque a mais onde antes se arquivava.
   */
  verArquivados?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const filtro = (params.get("filtro") ?? "todos") as Filtro;
  const etapaFiltro = params.get("etapa") ?? "";
  const corretorFiltro = params.get("corretor") ?? "";
  const dataDe = params.get("de") ?? "";
  const dataAte = params.get("ate") ?? "";

  // Quem cuida do campo (e do debounce) é o `BuscaLeads`; aqui só se lê o
  // termo em vigor, para o rodapé de "nenhum resultado" e o contador de
  // filtros ativos.
  const buscaNaUrl = params.get("busca") ?? "";

  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [modalAberto, setModalAberto] = useState(false);
  // Segundo andar da barra de seleção: a lista de etapas para mover o lote.
  const [escolhendoEtapa, setEscolhendoEtapa] = useState(false);
  const [avisoLote, setAvisoLote] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [movendoLote, iniciarLote] = useTransition();

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
    setEscolhendoEtapa(false);
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

  /**
   * Ações de arquivo em lote. Uma função só porque as três diferem apenas
   * na chamada e no verbo — e porque o pós-processamento (limpar seleção,
   * avisar, recarregar) tem de ser idêntico nas três.
   */
  function agirEmLote(
    acao: (ids: string[]) => Promise<ResultadoLote>,
    verbo: (n: number) => string,
  ) {
    const ids = [...selecionados];
    setAvisoLote(null);
    iniciarLote(async () => {
      const resultado = await acao(ids);
      if ("erro" in resultado) {
        setAvisoLote(resultado.erro);
        return;
      }
      setSelecionados(new Set());
      setConfirmandoExclusao(false);
      setAvisoLote(verbo(resultado.afetados));
      router.refresh();
    });
  }

  function moverLote(etapa: EtapaFunil) {
    const ids = [...selecionados];
    setAvisoLote(null);
    iniciarLote(async () => {
      const res = await moverEtapaEmMassa(ids, etapa);
      if (res.erro) {
        setAvisoLote(res.erro);
        return;
      }
      // O aviso diz o número que o SERVIDOR confirmou, não o da seleção:
      // um lead que trocou de dono no meio simplesmente não é movido, e a
      // tela não pode anunciar 15 quando foram 12.
      setAvisoLote(
        res.movidos === ids.length
          ? `${res.movidos} lead${res.movidos === 1 ? "" : "s"} para “${ETAPA_LABEL[etapa]}”.`
          : `${res.movidos} de ${ids.length} movidos — os demais mudaram de dono. Recarregue a lista.`,
      );
      setSelecionados(new Set());
      setEscolhendoEtapa(false);
      // Some sozinho: confirmação não é alerta, não precisa de clique.
      setTimeout(() => setAvisoLote(null), 5000);
      router.refresh();
    });
  }

  // Filtros "avançados" = os que não cabem no dia a dia do polegar. Ficam
  // recolhidos (progressive disclosure), mas abrem sozinhos quando algum está
  // ativo — filtro invisível filtrando é a pior surpresa da tela.
  const filtrosAvancadosAtivos = [etapaFiltro, corretorFiltro, dataDe, dataAte].filter(
    Boolean,
  ).length;
  const [mostrarFiltros, setMostrarFiltros] = useState(filtrosAvancadosAtivos > 0);

  const temFiltroAtivo = Boolean(
    buscaNaUrl || filtrosAvancadosAtivos > 0 || filtro !== "todos",
  );
  const semNenhumLead = total === 0 && !temFiltroAtivo;

  return (
    <div>
      {/* Busca grudada no topo: achar UM lead entre 100 é a tarefa nº 1 da
          tela, então ela nunca sai de baixo do dedo ao rolar. O campo é o
          mesmo das outras abas (`BuscaLeads`) — mesma aparência, mesmo
          comportamento, e o termo sobrevive à troca de aba. */}
      <div className="sticky top-[var(--painel-header-h)] z-30 -mx-4 bg-fundo/95 px-4 pt-4 pb-2 backdrop-blur-md sm:mx-0 sm:px-0 md:static md:bg-transparent md:backdrop-blur-none">
        <div className="flex gap-2">
          <BuscaLeads className="flex-1" />
          <button
            type="button"
            onClick={() => setMostrarFiltros((m) => !m)}
            aria-expanded={mostrarFiltros}
            className={`text-fluid-sm flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-3.5 transition-colors ${
              filtrosAvancadosAtivos > 0
                ? "border-acento-linha bg-acento-lavado text-acento-suave font-medium"
                : "border-linha-forte text-apoio hover:text-titulo"
            }`}
          >
            Filtros
            {filtrosAvancadosAtivos > 0 && (
              <span className="bg-acento flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold text-white tabular-nums">
                {filtrosAvancadosAtivos}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="scrollbar-none mt-2 -mx-4 flex gap-2 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {CHIPS.map(({ valor, label, cor }) => {
          const ativo = filtro === valor && !etapaFiltro;
          return (
            <button
              key={valor}
              onClick={() => atualizarUrl({ filtro: valor === "todos" ? "" : valor, etapa: "" })}
              className={`flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors ${
                ativo
                  ? "bg-acento text-white"
                  : "bg-superficie text-apoio hover:bg-elevado hover:text-corpo"
              }`}
            >
              {cor && (
                <span
                  aria-hidden
                  className={`h-2 w-2 shrink-0 rounded-full ${ativo ? "bg-white/80" : cor}`}
                />
              )}
              {label}
            </button>
          );
        })}
      </div>

      {mostrarFiltros && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {gestor && (
            <select
              value={corretorFiltro}
              onChange={(e) => atualizarUrl({ corretor: e.target.value })}
              className="text-fluid-xs min-h-11 rounded-lg border border-linha-forte bg-campo px-3 py-2 text-corpo"
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
            className="text-fluid-xs min-h-11 rounded-lg border border-linha-forte bg-campo px-3 py-2 text-corpo"
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
            aria-label="Chegou a partir de"
            className="text-fluid-xs min-h-11 rounded-lg border border-linha-forte bg-campo px-3 py-2 text-corpo"
          />
          <input
            type="date"
            value={dataAte}
            onChange={(e) => atualizarUrl({ ate: e.target.value })}
            aria-label="Chegou até"
            className="text-fluid-xs min-h-11 rounded-lg border border-linha-forte bg-campo px-3 py-2 text-corpo"
          />
        </div>
      )}

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
              {!verArquivados && (
              <button
                type="button"
                onClick={() => setEscolhendoEtapa((v) => !v)}
                aria-expanded={escolhendoEtapa}
                disabled={movendoLote}
                className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha flex min-h-11 cursor-pointer items-center rounded-lg border px-3 whitespace-nowrap transition-colors disabled:opacity-60"
              >
                {movendoLote ? "Movendo…" : "Mover para…"}
              </button>
              )}
              {/* Na lista ARQUIVADOS as ações são outras: restaurar e
                  excluir. Mandar mensagem para quem foi arquivado seria o
                  contrário do gesto de arquivar, e arquivar de novo não faz
                  sentido nenhum. */}
              {verArquivados ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      agirEmLote(restaurarLeadsEmLote, (n) =>
                        n === 0
                          ? "Nada a restaurar."
                          : `${n} lead${n === 1 ? "" : "s"} restaurado${n === 1 ? "" : "s"}.`,
                      )
                    }
                    disabled={movendoLote}
                    className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha flex min-h-11 cursor-pointer items-center rounded-lg border px-3 whitespace-nowrap transition-colors disabled:opacity-60"
                  >
                    Restaurar
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmandoExclusao(true)}
                    disabled={movendoLote}
                    className="text-fluid-sm border-perigo-linha bg-perigo-lavado text-perigo flex min-h-11 cursor-pointer items-center rounded-lg border px-3 whitespace-nowrap transition-opacity hover:opacity-80 disabled:opacity-60"
                  >
                    Excluir
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      agirEmLote(arquivarLeadsEmLote, (n) =>
                        n === 0
                          ? "Nada a arquivar — já estavam arquivados."
                          : `${n} lead${n === 1 ? "" : "s"} arquivado${n === 1 ? "" : "s"}.`,
                      )
                    }
                    disabled={movendoLote}
                    className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha flex min-h-11 cursor-pointer items-center rounded-lg border px-3 whitespace-nowrap transition-colors disabled:opacity-60"
                  >
                    {movendoLote ? "…" : "Arquivar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalAberto(true)}
                    className="text-fluid-sm bg-acento hover:bg-acento-hover flex min-h-11 items-center rounded-lg px-4 font-medium whitespace-nowrap text-white transition-colors"
                  >
                    Enviar mensagem
                  </button>
                </>
              )}
            </div>
          </div>

          {/* O segundo andar abre PARA CIMA do conteúdo da barra (a barra é
              fixed, então crescer para cima é só ficar mais alta). Cada botão
              leva a bolinha da régua: a mesma cor da coluna do quadro e da
              linha da lista — o corretor mira pela cor antes de ler. */}
          {/* Confirmação da exclusão no MESMO andar de baixo da barra, e não
              num `confirm()` do navegador: o número de leads precisa estar
              escrito na frase que a pessoa confirma. "Apagar os
              selecionados?" não diz se são 3 ou 300. */}
          {confirmandoExclusao && (
            <div className="border-perigo-linha bg-perigo-lavado mx-auto mt-3 w-full max-w-[84rem] rounded-lg border px-3 py-3 md:px-4">
              <p className="text-fluid-sm text-titulo font-medium">
                Excluir {selecionados.size} lead{selecionados.size === 1 ? "" : "s"} para sempre?
              </p>
              <p className="text-fluid-xs text-apoio mt-1">
                Vai junto o histórico de conversa no CRM, as tarefas e o que a IA anotou sobre
                cada um. Não dá para desfazer.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    agirEmLote(excluirLeadsEmLote, (n) =>
                      n === 0
                        ? "Nada foi excluído — só leads arquivados podem ser apagados."
                        : `${n} lead${n === 1 ? "" : "s"} excluído${n === 1 ? "" : "s"} para sempre.`,
                    )
                  }
                  disabled={movendoLote}
                  className="text-fluid-sm border-perigo-linha bg-perigo-lavado text-perigo flex min-h-11 cursor-pointer items-center rounded-lg border px-4 font-medium transition-opacity hover:opacity-80 disabled:opacity-60"
                >
                  {movendoLote ? "Excluindo…" : `Sim, excluir ${selecionados.size}`}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmandoExclusao(false)}
                  disabled={movendoLote}
                  className="text-fluid-sm border-linha-forte text-corpo min-h-11 cursor-pointer rounded-lg border px-4 transition-colors disabled:opacity-60"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {escolhendoEtapa && (
            <div className="mx-auto mt-3 flex w-full max-w-[84rem] flex-wrap gap-2 px-1 md:px-4">
              {ETAPAS_FUNIL.map((etapa) => (
                <button
                  key={etapa}
                  type="button"
                  onClick={() => moverLote(etapa)}
                  disabled={movendoLote}
                  className="text-fluid-xs border-linha bg-superficie text-corpo hover:border-acento-linha hover:text-titulo flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 font-medium transition-colors disabled:opacity-60"
                >
                  <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${PONTO_ETAPA[etapa]}`} />
                  {ETAPA_LABEL[etapa]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Confirmação do lote — fora da barra, porque a barra some junto com a
          seleção e a notícia precisa sobreviver a ela. */}
      {avisoLote && (
        <div className="acima-da-nav fixed inset-x-0 z-45 p-3 sm:p-4" role="status">
          <p className="text-fluid-sm border-ok-linha bg-ok-lavado text-ok mx-auto w-fit rounded-full border px-4 py-2 font-medium backdrop-blur-md">
            {avisoLote}
          </p>
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
