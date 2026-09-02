"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import {
  avaliarInteracao,
  enviarMensagemDoPainel,
  enviarMidiaDoPainel,
  lerFichaDoLead,
  lerMensagens,
  listarCatalogoDeMidias,
  marcarConversaLida,
  retomarBotNaConversa,
  silenciarBotNaConversa,
  type FichaDoLead,
  type MensagemConversa,
  type MidiaDoCatalogo,
} from "./acoes";
import { ETAPA_LABEL, type EtapaFunil } from "@/lib/types";

export type ConversaResumo = {
  id: string;
  telefone: string;
  nome: string | null;
  botAtivo: boolean;
  pausadoAte: string | null;
  /** A conversa já foi autorizada — a terceira condição de `botDeveResponder`. */
  liberada: boolean;
  ultimaMensagem: string | null;
  ultimaInteracaoEm: string;
  temLead: boolean;
  naoLidas: number;
};

/** A linha crua que o Realtime entrega no INSERT/UPDATE de whatsapp_mensagens. */
type MensagemRow = {
  id: string;
  conversa_id: string;
  remetente: "cliente" | "bot" | "corretor";
  conteudo: string;
  created_at: string;
  tipo: "texto" | "audio" | "imagem" | "documento";
  midia_url: string | null;
  status_entrega: "enviada" | "entregue" | "lida" | null;
  interacao_id: string | null;
};

/** A linha crua do INSERT de whatsapp_conversas (conversa recém-nascida). */
type ConversaRow = {
  id: string;
  telefone_cliente: string;
  nome_cliente: string | null;
  bot_ativo: boolean;
  pausado_humano_ate: string | null;
  liberado_por_palavra_chave: boolean;
  ultima_mensagem: string | null;
  ultima_interacao_em: string;
  lead_id: string | null;
  nao_lidas: number;
};

const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const diaCurto = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const diaLongo = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

/** "5511991234567" → "(11) 99123-4567", que é como o corretor reconhece o cliente. */
function telefoneLegivel(e164: string): string {
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  if (d.length < 10) return e164;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
  return `(${ddd}) ${meio}-${resto.slice(meio.length)}`;
}

/** Hora se foi hoje, dd/mm caso contrário — a régua do WhatsApp para a lista. */
function quandoNaLista(iso: string): string {
  const data = new Date(iso);
  const agora = new Date();
  return data.toDateString() === agora.toDateString() ? hora.format(data) : diaCurto.format(data);
}

/** "Hoje", "Ontem" ou a data por extenso — o separador entre blocos de dias. */
function rotuloDoDia(iso: string): string {
  const data = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86_400_000);
  if (data.toDateString() === hoje.toDateString()) return "Hoje";
  if (data.toDateString() === ontem.toDateString()) return "Ontem";
  return diaLongo.format(data);
}

function iniciais(conversa: ConversaResumo): string {
  if (conversa.nome) {
    const partes = conversa.nome.trim().split(/\s+/);
    return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
  }
  return conversa.telefone.replace(/\D/g, "").slice(-2);
}

function deRow(row: ConversaRow): ConversaResumo {
  return {
    id: row.id,
    telefone: row.telefone_cliente,
    nome: row.nome_cliente,
    botAtivo: row.bot_ativo,
    pausadoAte: row.pausado_humano_ate,
    liberada: row.liberado_por_palavra_chave,
    ultimaMensagem: row.ultima_mensagem,
    ultimaInteracaoEm: row.ultima_interacao_em,
    temLead: Boolean(row.lead_id),
    naoLidas: row.nao_lidas ?? 0,
  };
}

function deMensagemRow(row: MensagemRow): MensagemConversa {
  return {
    id: row.id,
    remetente: row.remetente,
    conteudo: row.conteudo,
    criadoEm: row.created_at,
    tipo: row.tipo,
    midiaUrl: row.midia_url,
    statusEntrega: row.status_entrega,
    interacaoId: row.interacao_id,
    // A avaliação mora em ia_interacoes; o reconcílio periódico a traz.
    avaliacao: null,
  };
}

/**
 * Funde duas listas de mensagens sem duplicar e em ordem cronológica.
 * É a ÚNICA forma de escrever no cache: o histórico chega por quatro
 * caminhos (carga, Realtime, reconcílio, página antiga) e qualquer um que
 * substituísse em vez de fundir jogaria fora o que os outros trouxeram.
 */
function mesclar(
  atual: MensagemConversa[] | undefined,
  novas: MensagemConversa[],
): MensagemConversa[] {
  const porId = new Map<string, MensagemConversa>();
  for (const m of atual ?? []) porId.set(m.id, m);
  for (const m of novas) porId.set(m.id, m);
  return [...porId.values()].sort((a, b) =>
    a.criadoEm === b.criadoEm ? (a.id < b.id ? -1 : 1) : a.criadoEm < b.criadoEm ? -1 : 1,
  );
}

type Estado = "ativa" | "pausada_humano" | "aguardando_liberacao" | "desligada";

/**
 * O estado tem de refletir as TRÊS condições de `botDeveResponder`, não
 * duas — foi um selo que olhava só duas que escondeu, por semanas, que a
 * IA nunca tinha respondido um cliente.
 */
function estadoDa(conversa: ConversaResumo): Estado {
  if (!conversa.botAtivo) return "desligada";
  const pausada = conversa.pausadoAte && new Date(conversa.pausadoAte).getTime() > Date.now();
  if (pausada) return "pausada_humano";
  if (!conversa.liberada) return "aguardando_liberacao";
  return "ativa";
}

const SELO: Record<Estado, { texto: string; classe: string; ponto: string }> = {
  ativa: { texto: "IA atendendo", classe: "text-ok", ponto: "bg-ok" },
  pausada_humano: { texto: "IA em pausa", classe: "text-alerta", ponto: "bg-alerta" },
  aguardando_liberacao: {
    texto: "IA aguardando liberação",
    classe: "text-info",
    ponto: "bg-info",
  },
  desligada: { texto: "IA desligada", classe: "text-apoio", ponto: "bg-linha-forte" },
};

/**
 * A tela de conversas no formato do WhatsApp Web: lista à esquerda, chat à
 * direita, entrega em TEMPO REAL via Supabase Realtime (INSERTs de
 * mensagem e de conversa, recortados pela RLS) com um reconcílio de 15s na
 * conversa aberta — o Realtime traz a mensagem na hora, o reconcílio traz o
 * que ele não carrega (a avaliação, o vínculo com a telemetria) e cobre
 * queda de websocket.
 *
 * No celular as colunas viram duas "telas" por estado — nunca overlay
 * `position: fixed`, que dentro do vidro do painel fica preso ao vidro.
 */
export function ConversasClient({
  conversas,
  podeEnviar,
}: {
  conversas: ConversaResumo[];
  podeEnviar: boolean;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [todas, setTodas] = useState(conversas);
  const [estados, setEstados] = useState<Record<string, Estado>>(() =>
    Object.fromEntries(conversas.map((c) => [c.id, estadoDa(c)])),
  );
  const [naoLidasPor, setNaoLidasPor] = useState<Record<string, number>>(() =>
    Object.fromEntries(conversas.map((c) => [c.id, c.naoLidas])),
  );
  const [mensagensPor, setMensagensPor] = useState<Record<string, MensagemConversa[]>>({});
  // Prévia/hora vindas de evento (Realtime ou envio local), por cima do
  // que o servidor mandou na carga da página.
  const [previaPor, setPreviaPor] = useState<Record<string, { texto: string; quando: string }>>({});

  // O handler do Realtime vive fora do ciclo de render; ref evita closure
  // presa na conversa selecionada de quando o canal foi assinado.
  const selecionadaRef = useRef<string | null>(null);
  useEffect(() => {
    selecionadaRef.current = selecionadaId;
  }, [selecionadaId]);

  const selecionada = todas.find((c) => c.id === selecionadaId) ?? null;

  // O servidor recarregou a lista (revalidatePath): adota a dele e mantém
  // só o que nasceu por Realtime e ainda não veio na carga. Ajuste DURANTE
  // o render (padrão "derived state" do React), não em effect — evita um
  // quadro com a lista velha na tela.
  const [propAnterior, setPropAnterior] = useState(conversas);
  if (propAnterior !== conversas) {
    setPropAnterior(conversas);
    setTodas((locais) => {
      const doServidor = new Set(conversas.map((c) => c.id));
      return [...conversas, ...locais.filter((c) => !doServidor.has(c.id))];
    });
    setNaoLidasPor((atual) => {
      const novo = { ...atual };
      for (const c of conversas) {
        novo[c.id] = c.id === selecionadaId ? 0 : c.naoLidas;
      }
      return novo;
    });
  }

  // Tempo real: um canal para a caixa inteira. Sem filtro por conversa de
  // propósito — a RLS já recorta por corretor, e um filtro `in.(...)` com a
  // carteira inteira estoura o limite do parâmetro.
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel("conversas-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_mensagens" },
        (payload) => {
          const row = payload.new as MensagemRow;
          setMensagensPor((atual) =>
            // Só funde em conversa já carregada: fundir em cache vazio faria
            // o chat abrir mostrando UMA mensagem como se fosse o histórico.
            atual[row.conversa_id]
              ? { ...atual, [row.conversa_id]: mesclar(atual[row.conversa_id], [deMensagemRow(row)]) }
              : atual,
          );
          setPreviaPor((atual) => ({
            ...atual,
            [row.conversa_id]: { texto: row.conteudo, quando: row.created_at },
          }));
          if (row.remetente === "cliente") {
            if (row.conversa_id === selecionadaRef.current) {
              // Chat na tela = lido, como no WhatsApp.
              void marcarConversaLida(row.conversa_id);
            } else {
              setNaoLidasPor((atual) => ({
                ...atual,
                [row.conversa_id]: (atual[row.conversa_id] ?? 0) + 1,
              }));
            }
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "whatsapp_mensagens" },
        (payload) => {
          // Ack de entrega (0051) e vínculo de telemetria chegam como
          // UPDATE. Só troca linha que já está na tela — mas preservando a
          // avaliação local, que o UPDATE do banco não carrega.
          const row = payload.new as MensagemRow;
          setMensagensPor((atual) => {
            const lista = atual[row.conversa_id];
            if (!lista?.some((m) => m.id === row.id)) return atual;
            return {
              ...atual,
              [row.conversa_id]: lista.map((m) =>
                m.id === row.id ? { ...deMensagemRow(row), avaliacao: m.avaliacao } : m,
              ),
            };
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_conversas" },
        (payload) => {
          const nova = deRow(payload.new as ConversaRow);
          setTodas((atual) => (atual.some((c) => c.id === nova.id) ? atual : [nova, ...atual]));
          setEstados((atual) => ({ ...atual, [nova.id]: estadoDa(nova) }));
          setNaoLidasPor((atual) => ({ ...atual, [nova.id]: nova.naoLidas }));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(canal);
    };
  }, []);

  // Reconcílio da conversa aberta: carga imediata + releitura a cada 15s.
  // Não é o caminho principal (o Realtime é); é o que traz avaliação e
  // vínculo de telemetria e o que segura a tela se o websocket cair.
  // MESCLA, nunca substitui — substituir jogaria fora as páginas antigas
  // que o "ver mensagens anteriores" carregou.
  useEffect(() => {
    if (!selecionadaId) return;
    let vivo = true;
    const carregar = async () => {
      const mensagens = await lerMensagens(selecionadaId);
      if (vivo) {
        setMensagensPor((atual) => ({
          ...atual,
          [selecionadaId]: mesclar(atual[selecionadaId], mensagens),
        }));
      }
    };
    void carregar();
    const timer = setInterval(carregar, 15000);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [selecionadaId]);

  function abrirConversa(id: string) {
    setErro(null);
    setSelecionadaId(id);
    setNaoLidasPor((atual) => ({ ...atual, [id]: 0 }));
    void marcarConversaLida(id);
  }

  function mesclarNaConversa(id: string, novas: MensagemConversa[]) {
    setMensagensPor((atual) => ({ ...atual, [id]: mesclar(atual[id], novas) }));
    const maisNova = novas.reduce<MensagemConversa | null>(
      (melhor, m) => (!melhor || m.criadoEm > melhor.criadoEm ? m : melhor),
      null,
    );
    if (maisNova) {
      setPreviaPor((atual) =>
        !atual[id] || maisNova.criadoEm >= atual[id].quando
          ? { ...atual, [id]: { texto: maisNova.conteudo, quando: maisNova.criadoEm } }
          : atual,
      );
    }
  }

  function removerDaConversa(id: string, mensagemId: string) {
    setMensagensPor((atual) => ({
      ...atual,
      [id]: (atual[id] ?? []).filter((m) => m.id !== mensagemId),
    }));
  }

  const listaOrdenada = useMemo(() => {
    const chave = busca.trim().toLowerCase();
    return todas
      .map((c) => ({
        conversa: c,
        previa: previaPor[c.id]?.texto ?? c.ultimaMensagem,
        quando: previaPor[c.id]?.quando ?? c.ultimaInteracaoEm,
      }))
      .filter(
        ({ conversa }) =>
          !chave ||
          (conversa.nome ?? "").toLowerCase().includes(chave) ||
          conversa.telefone.includes(chave.replace(/\D/g, "") || " "),
      )
      .sort((a, b) => (a.quando < b.quando ? 1 : -1));
  }, [todas, previaPor, busca]);

  if (todas.length === 0) {
    return (
      <div className="border-linha bg-superficie shadow-painel mt-8 rounded-2xl border p-6">
        <p className="text-fluid-sm text-corpo">
          Nenhuma conversa ainda. Assim que alguém escrever para o número conectado, ela aparece
          aqui — e você vê na hora se a IA respondeu ou ficou de fora.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {erro && (
        <p role="alert" className="text-fluid-sm text-perigo mb-3">
          {erro}
        </p>
      )}

      <div className="border-linha bg-superficie shadow-painel flex h-[72dvh] min-h-[420px] overflow-hidden rounded-2xl border">
        {/* Lista de conversas — no celular some quando um chat está aberto */}
        <aside
          className={cn(
            "border-linha flex w-full shrink-0 flex-col md:w-80 md:border-r lg:w-96",
            selecionada && "hidden md:flex",
          )}
        >
          <div className="border-linha border-b p-3">
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar conversa"
              className="border-linha bg-elevado text-corpo placeholder:text-tenue w-full rounded-full border px-4 py-2 text-sm outline-none focus:border-linha-forte"
            />
          </div>

          <ul className="flex-1 overflow-y-auto">
            {listaOrdenada.map(({ conversa, previa, quando }) => {
              const estado = estados[conversa.id] ?? estadoDa(conversa);
              const ativa = conversa.id === selecionadaId;
              const naoLidas = naoLidasPor[conversa.id] ?? 0;
              return (
                <li key={conversa.id}>
                  <button
                    type="button"
                    onClick={() => abrirConversa(conversa.id)}
                    className={cn(
                      "border-linha hover:bg-vidro flex w-full cursor-pointer items-center gap-3 border-b px-3 py-3 text-left transition-colors",
                      ativa && "bg-vidro-forte",
                    )}
                  >
                    <span className="bg-acento-lavado text-acento-suave relative flex size-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                      {iniciais(conversa)}
                      <span
                        title={SELO[estado].texto}
                        className={cn(
                          "border-superficie absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2",
                          SELO[estado].ponto,
                        )}
                      />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            "text-titulo truncate text-sm",
                            naoLidas > 0 ? "font-semibold" : "font-medium",
                          )}
                        >
                          {conversa.nome || telefoneLegivel(conversa.telefone)}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[11px]",
                            naoLidas > 0 ? "text-ok font-semibold" : "text-tenue",
                          )}
                        >
                          {quandoNaLista(quando)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "block truncate text-xs",
                            naoLidas > 0 ? "text-corpo" : "text-apoio",
                          )}
                        >
                          {previa ?? "Sem mensagens"}
                        </span>
                        {naoLidas > 0 && (
                          <span className="bg-ok text-superficie flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold">
                            {naoLidas > 99 ? "99+" : naoLidas}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {listaOrdenada.length === 0 && (
              <li className="text-tenue px-4 py-6 text-center text-sm">Nada com essa busca.</li>
            )}
          </ul>
        </aside>

        {/* Chat aberto */}
        <section className={cn("min-w-0 flex-1 flex-col", selecionada ? "flex" : "hidden md:flex")}>
          {selecionada ? (
            <Chat
              key={selecionada.id}
              conversa={selecionada}
              estado={estados[selecionada.id] ?? estadoDa(selecionada)}
              mensagens={mensagensPor[selecionada.id] ?? null}
              podeEnviar={podeEnviar}
              onVoltar={() => setSelecionadaId(null)}
              onErro={setErro}
              onEstado={(novo) => setEstados((atual) => ({ ...atual, [selecionada.id]: novo }))}
              onMesclar={(novas) => mesclarNaConversa(selecionada.id, novas)}
              onRemover={(mensagemId) => removerDaConversa(selecionada.id, mensagemId)}
            />
          ) : (
            <div className="text-tenue flex flex-1 items-center justify-center p-8 text-center text-sm">
              Escolha uma conversa ao lado para ler e responder por aqui.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Chat({
  conversa,
  estado,
  mensagens,
  podeEnviar,
  onVoltar,
  onErro,
  onEstado,
  onMesclar,
  onRemover,
}: {
  conversa: ConversaResumo;
  estado: Estado;
  mensagens: MensagemConversa[] | null;
  podeEnviar: boolean;
  onVoltar: () => void;
  onErro: (e: string | null) => void;
  onEstado: (novo: Estado) => void;
  onMesclar: (novas: MensagemConversa[]) => void;
  onRemover: (mensagemId: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [fichaAberta, setFichaAberta] = useState(false);
  // O histórico se esgotou? Vira true quando uma página anterior volta
  // incompleta — é o que apaga o botão "ver mensagens anteriores".
  const [esgotado, setEsgotado] = useState(false);
  const [carregandoAntigas, setCarregandoAntigas] = useState(false);
  const [pendente, iniciar] = useTransition();
  const corpoRef = useRef<HTMLDivElement>(null);
  const presoNoFimRef = useRef(true);
  const selo = SELO[estado];

  // Rola para o fim quando chegam mensagens — mas só se o corretor já
  // estava no fim. Rolar por cima de quem está relendo o histórico é pior
  // que não rolar.
  const idUltimaMensagem = mensagens?.at(-1)?.id;
  useEffect(() => {
    const corpo = corpoRef.current;
    if (corpo && presoNoFimRef.current) corpo.scrollTop = corpo.scrollHeight;
  }, [idUltimaMensagem]);

  function aoRolar() {
    const corpo = corpoRef.current;
    if (!corpo) return;
    presoNoFimRef.current = corpo.scrollHeight - corpo.scrollTop - corpo.clientHeight < 120;
  }

  function alternarBot() {
    onErro(null);
    // Otimista: muda antes da resposta; se o servidor recusar, volta.
    const anterior = estado;
    const proximo: Estado = estado === "ativa" ? "desligada" : "ativa";
    onEstado(proximo);
    iniciar(async () => {
      const resultado =
        proximo === "ativa"
          ? await retomarBotNaConversa(conversa.id)
          : await silenciarBotNaConversa(conversa.id);
      if (resultado.erro) {
        onEstado(anterior);
        onErro(resultado.erro);
      }
    });
  }

  async function enviar() {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
    onErro(null);
    setEnviando(true);
    setTexto("");
    presoNoFimRef.current = true;

    // Balão otimista: aparece na hora. Se o envio falhar, sai da tela e o
    // texto volta para a caixa — nada de mensagem fantasma. O temporário é
    // sempre REMOVIDO no fim: com o cache sendo fundido (nunca substituído),
    // deixá-lo lá viraria balão duplicado quando a linha real chegasse.
    const temporaria: MensagemConversa = {
      id: `temp-${Date.now()}`,
      remetente: "corretor",
      conteudo,
      criadoEm: new Date().toISOString(),
      tipo: "texto",
      midiaUrl: null,
      statusEntrega: null,
      interacaoId: null,
      avaliacao: null,
    };
    onMesclar([temporaria]);

    const resultado = await enviarMensagemDoPainel(conversa.id, conteudo);
    setEnviando(false);

    if (resultado.erro) {
      onRemover(temporaria.id);
      setTexto(conteudo);
      onErro(resultado.erro);
      return;
    }

    if (resultado.iaAtivada) onEstado("ativa");
    else if (estado === "ativa") onEstado("pausada_humano");
    const frescas = await lerMensagens(conversa.id);
    onRemover(temporaria.id);
    onMesclar(frescas);
  }

  async function enviarMidia(midia: MidiaDoCatalogo) {
    if (enviando) return;
    onErro(null);
    setEnviando(true);
    setSeletorAberto(false);
    presoNoFimRef.current = true;

    const resultado = await enviarMidiaDoPainel(conversa.id, midia.id);
    setEnviando(false);

    if (resultado.erro) {
      onErro(resultado.erro);
      return;
    }
    if (estado === "ativa") onEstado("pausada_humano");
    onMesclar(await lerMensagens(conversa.id));
  }

  async function carregarAnteriores() {
    const primeira = mensagens?.[0];
    if (!primeira || carregandoAntigas) return;
    setCarregandoAntigas(true);

    // Âncora de rolagem: guardar a altura antes e devolver a diferença
    // depois, senão o prepend joga a leitura para o topo do bloco novo.
    const corpo = corpoRef.current;
    const alturaAntes = corpo?.scrollHeight ?? 0;
    const topoAntes = corpo?.scrollTop ?? 0;
    presoNoFimRef.current = false;

    const pagina = await lerMensagens(conversa.id, primeira.criadoEm);
    if (pagina.length < 100) setEsgotado(true);
    if (pagina.length > 0) {
      onMesclar(pagina);
      requestAnimationFrame(() => {
        const corpoDepois = corpoRef.current;
        if (corpoDepois) {
          corpoDepois.scrollTop = corpoDepois.scrollHeight - alturaAntes + topoAntes;
        }
      });
    }
    setCarregandoAntigas(false);
  }

  return (
    <>
      {/* Cabeçalho do chat */}
      <header className="border-linha flex items-center gap-3 border-b px-3 py-2.5 md:px-4">
        <button
          type="button"
          onClick={onVoltar}
          aria-label="Voltar para a lista"
          className="text-apoio hover:text-titulo -ml-1 flex size-9 cursor-pointer items-center justify-center rounded-full md:hidden"
        >
          ←
        </button>

        <button
          type="button"
          onClick={() => conversa.temLead && setFichaAberta((v) => !v)}
          disabled={!conversa.temLead}
          title={conversa.temLead ? "Ver ficha do lead" : undefined}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 text-left",
            conversa.temLead && "cursor-pointer",
          )}
        >
          <span className="bg-acento-lavado text-acento-suave flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
            {iniciais(conversa)}
          </span>

          <span className="min-w-0 flex-1">
            <span className="text-titulo block truncate text-sm font-medium">
              {conversa.nome || telefoneLegivel(conversa.telefone)}
              {conversa.temLead && <span className="text-tenue ml-1 text-xs">{fichaAberta ? "▴" : "▾"}</span>}
            </span>
            <span className="text-fluid-xs block truncate">
              {conversa.nome && (
                <span className="text-tenue">{telefoneLegivel(conversa.telefone)} · </span>
              )}
              <span className={selo.classe}>{selo.texto}</span>
              {!conversa.temLead && <span className="text-tenue"> · sem ficha no funil</span>}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={alternarBot}
          disabled={pendente}
          className={cn(
            "flex min-h-9 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-xs font-medium transition-colors disabled:opacity-60",
            estado === "ativa"
              ? "border-linha-forte text-corpo hover:bg-vidro border"
              : "bg-acento hover:bg-acento-hover text-sobre-cor",
          )}
        >
          {estado === "ativa" ? "Desligar IA" : "Reativar IA"}
        </button>
      </header>

      {fichaAberta && conversa.temLead && <FichaLead conversaId={conversa.id} />}

      {/* Corpo com os balões */}
      <div
        ref={corpoRef}
        onScroll={aoRolar}
        className="bg-elevado/40 flex-1 space-y-1.5 overflow-y-auto px-3 py-4 md:px-6"
      >
        {mensagens !== null && mensagens.length >= 100 && !esgotado && (
          <p className="pb-2 text-center">
            <button
              type="button"
              onClick={() => void carregarAnteriores()}
              disabled={carregandoAntigas}
              className="border-linha text-apoio hover:text-titulo cursor-pointer rounded-full border px-4 py-1.5 text-xs transition-colors disabled:opacity-60"
            >
              {carregandoAntigas ? "Carregando…" : "Ver mensagens anteriores"}
            </button>
          </p>
        )}
        {mensagens === null ? (
          <p className="text-tenue py-8 text-center text-xs">Carregando conversa…</p>
        ) : mensagens.length === 0 ? (
          <p className="text-tenue py-8 text-center text-xs">Sem mensagens registradas.</p>
        ) : (
          mensagens.map((m, i) => {
            const anterior = mensagens[i - 1];
            const trocouDia =
              !anterior ||
              new Date(anterior.criadoEm).toDateString() !== new Date(m.criadoEm).toDateString();
            return (
              <div key={m.id}>
                {trocouDia && (
                  <p className="my-3 text-center">
                    <span className="bg-vidro-forte border-linha text-tenue rounded-full border px-3 py-1 text-[11px]">
                      {rotuloDoDia(m.criadoEm)}
                    </span>
                  </p>
                )}
                <Balao mensagem={m} onErro={onErro} />
              </div>
            );
          })
        )}
      </div>

      {/* Teclado */}
      <footer className="border-linha relative border-t p-2.5 md:p-3">
        {seletorAberto && (
          <SeletorDeMidia onEscolher={enviarMidia} onFechar={() => setSeletorAberto(false)} />
        )}

        {podeEnviar ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void enviar();
            }}
            className="flex items-end gap-2"
          >
            <button
              type="button"
              onClick={() => setSeletorAberto((v) => !v)}
              disabled={enviando}
              aria-label="Anexar foto do catálogo"
              title="Enviar foto ou planta de um imóvel"
              className={cn(
                "border-linha text-apoio hover:text-titulo flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border transition-colors disabled:opacity-50",
                seletorAberto && "bg-vidro-forte text-titulo",
              )}
            >
              <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="1.8" aria-hidden>
                <path d="m21.4 11.05-8.79 8.79a5.5 5.5 0 0 1-7.78-7.78l8.79-8.79a3.67 3.67 0 0 1 5.19 5.19l-8.8 8.79a1.83 1.83 0 0 1-2.59-2.6l8.12-8.11" />
              </svg>
            </button>

            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void enviar();
                }
              }}
              rows={1}
              placeholder="Escreva uma mensagem"
              className="border-linha bg-elevado text-corpo placeholder:text-tenue max-h-32 min-h-11 w-full resize-none rounded-2xl border px-4 py-2.5 text-sm outline-none focus:border-linha-forte"
            />
            <button
              type="submit"
              disabled={enviando || !texto.trim()}
              aria-label="Enviar mensagem"
              className="bg-acento hover:bg-acento-hover flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-sobre-cor transition-colors disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
                <path d="M3.4 20.4 20.9 12 3.4 3.6l.01 6.53L15 12 3.41 13.87z" />
              </svg>
            </button>
          </form>
        ) : (
          <p className="text-fluid-xs text-apoio px-2 py-1.5">
            O número não está conectado — conecte o WhatsApp em{" "}
            <a
              href="/corretor/whatsapp"
              className="text-acento-suave underline-offset-4 hover:underline"
            >
              Conexão
            </a>{" "}
            para responder por aqui.
          </p>
        )}
        {estado === "pausada_humano" && conversa.pausadoAte && (
          <p className="text-fluid-xs text-tenue mt-1.5 px-2">
            Você assumiu esta conversa; a IA volta sozinha em até 24h — ou agora, pelo botão acima.
          </p>
        )}
      </footer>
    </>
  );
}

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const dataVisita = new Intl.DateTimeFormat("pt-BR", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const COR_TEMPERATURA: Record<"quente" | "morno" | "frio", string> = {
  quente: "text-perigo",
  morno: "text-alerta",
  frio: "text-apoio",
};

/**
 * A gaveta da ficha: o essencial do lead sem sair da conversa — funil,
 * orçamento, leitura da IA e o atalho para a ficha completa. Conversa e
 * CRM eram mundos separados; decidir a resposta olhando a etapa é o
 * motivo de a gaveta morar AQUI.
 */
function FichaLead({ conversaId }: { conversaId: string }) {
  const [ficha, setFicha] = useState<FichaDoLead | null | "carregando">("carregando");

  useEffect(() => {
    let vivo = true;
    void lerFichaDoLead(conversaId).then((resultado) => {
      if (vivo) setFicha(resultado);
    });
    return () => {
      vivo = false;
    };
  }, [conversaId]);

  if (ficha === "carregando") {
    return <p className="border-linha text-tenue border-b px-4 py-3 text-xs">Carregando ficha…</p>;
  }
  if (ficha === null) {
    return (
      <p className="border-linha text-tenue border-b px-4 py-3 text-xs">
        Este contato ainda não tem ficha no funil.
      </p>
    );
  }

  const etapa = ETAPA_LABEL[ficha.etapa as EtapaFunil] ?? ficha.etapa;
  const orcamento =
    ficha.orcamentoMin || ficha.orcamentoMax
      ? [ficha.orcamentoMin, ficha.orcamentoMax]
          .filter((v): v is number => v !== null)
          .map((v) => moeda.format(v))
          .join(" – ")
      : null;

  const fatos: { rotulo: string; valor: string }[] = [
    { rotulo: "Etapa", valor: etapa },
    ...(orcamento ? [{ rotulo: "Orçamento", valor: orcamento }] : []),
    ...(ficha.rendaMensal ? [{ rotulo: "Renda", valor: `${moeda.format(ficha.rendaMensal)}/mês` }] : []),
    ...(ficha.regiaoInteresse ? [{ rotulo: "Região", valor: ficha.regiaoInteresse }] : []),
    ...(ficha.dormitoriosMin ? [{ rotulo: "Dorm.", valor: `${ficha.dormitoriosMin}+` }] : []),
    ...(ficha.visitaAgendadaEm
      ? [{ rotulo: "Visita", valor: dataVisita.format(new Date(ficha.visitaAgendadaEm)) }]
      : []),
  ];

  return (
    <div className="border-linha bg-superficie border-b px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {fatos.map((f) => (
          <p key={f.rotulo} className="text-xs">
            <span className="text-tenue">{f.rotulo}:</span>{" "}
            <span className="text-corpo font-medium">{f.valor}</span>
          </p>
        ))}
        {ficha.temperatura && (
          <p className="text-xs">
            <span className="text-tenue">Temperatura:</span>{" "}
            <span className={cn("font-medium", COR_TEMPERATURA[ficha.temperatura.label])}>
              {ficha.temperatura.label} ({ficha.temperatura.score})
            </span>
          </p>
        )}
      </div>
      {ficha.resumoIA && (
        <p className="text-apoio mt-1.5 line-clamp-2 text-xs">
          <span className="text-tenue">Leitura da IA:</span> {ficha.resumoIA}
        </p>
      )}
      <a
        href={`/corretor/leads/${ficha.leadId}`}
        className="text-acento-suave mt-1.5 inline-block text-xs underline-offset-4 hover:underline"
      >
        Abrir ficha completa →
      </a>
    </div>
  );
}

/**
 * O seletor do clipe: fotos e plantas do catálogo publicado, por imóvel.
 * Carregado uma vez por abertura do chat; a grade usa a própria URL da
 * mídia como miniatura — nenhum download intermediário.
 */
function SeletorDeMidia({
  onEscolher,
  onFechar,
}: {
  onEscolher: (midia: MidiaDoCatalogo) => void;
  onFechar: () => void;
}) {
  const [imoveis, setImoveis] = useState<{ nome: string; midias: MidiaDoCatalogo[] }[] | null>(
    null,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [imovelAberto, setImovelAberto] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    void listarCatalogoDeMidias().then((resultado) => {
      if (!vivo) return;
      if ("erro" in resultado) setErro(resultado.erro);
      else setImoveis(resultado.imoveis);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const aberto = imoveis?.find((i) => i.nome === imovelAberto) ?? null;

  return (
    <div className="border-linha bg-superficie shadow-painel absolute bottom-full left-2 z-10 mb-2 w-[min(28rem,calc(100%-1rem))] rounded-2xl border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-titulo text-sm font-medium">
          {aberto ? aberto.nome : "Enviar foto do catálogo"}
        </p>
        <div className="flex items-center gap-1">
          {aberto && (
            <button
              type="button"
              onClick={() => setImovelAberto(null)}
              className="text-apoio hover:text-titulo cursor-pointer rounded-full px-2 py-1 text-xs"
            >
              ← imóveis
            </button>
          )}
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar seletor"
            className="text-apoio hover:text-titulo cursor-pointer rounded-full px-2 py-1 text-xs"
          >
            ✕
          </button>
        </div>
      </div>

      {erro ? (
        <p className="text-perigo p-2 text-xs">{erro}</p>
      ) : imoveis === null ? (
        <p className="text-tenue p-2 text-xs">Carregando catálogo…</p>
      ) : aberto ? (
        <ul className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
          {aberto.midias.map((midia) => (
            <li key={midia.id}>
              <button
                type="button"
                onClick={() => onEscolher(midia)}
                title={midia.titulo}
                className="border-linha hover:border-acento-linha block w-full cursor-pointer overflow-hidden rounded-lg border transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- miniatura de URL externa do storage, sem otimização do Next de propósito */}
                <img src={midia.url} alt={midia.titulo} loading="lazy" className="aspect-square w-full object-cover" />
                <span className="text-apoio block truncate px-1.5 py-1 text-left text-[10px]">
                  {midia.tipo === "planta" ? "📐 " : ""}
                  {midia.titulo}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {imoveis.map((imovel) => (
            <li key={imovel.nome}>
              <button
                type="button"
                onClick={() => setImovelAberto(imovel.nome)}
                className="hover:bg-vidro text-corpo flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors"
              >
                <span className="truncate">{imovel.nome}</span>
                <span className="text-tenue shrink-0 text-xs">{imovel.midias.length} fotos</span>
              </button>
            </li>
          ))}
          {imoveis.length === 0 && (
            <li className="text-tenue p-2 text-xs">Nenhum imóvel publicado com fotos.</li>
          )}
        </ul>
      )}
    </div>
  );
}

const ESTILO_BALAO: Record<MensagemConversa["remetente"], string> = {
  cliente: "bg-superficie border-linha mr-auto",
  bot: "bg-acento-lavado border-acento-linha ml-auto",
  corretor: "bg-ok-lavado border-ok-linha ml-auto",
};

/** Áudio dá para tocar quando a URL é pública; a do WhatsApp criptografada (.enc) não é. */
function audioTocavel(m: MensagemConversa): boolean {
  return (
    m.tipo === "audio" &&
    !!m.midiaUrl &&
    /^https?:\/\//.test(m.midiaUrl) &&
    !/\.enc([?#]|$)/.test(m.midiaUrl)
  );
}

function Balao({
  mensagem,
  onErro,
}: {
  mensagem: MensagemConversa;
  onErro: (e: string | null) => void;
}) {
  /*
   * Avaliação POR BALÃO — o motivo de existir do vínculo da 0040. Antes só
   * a última resposta da conversa era avaliável; a falha no meio (o rótulo
   * que mais ensina) não tinha onde ser registrada.
   */
  const [nota, setNota] = useState<"boa" | "ruim" | null>(mensagem.avaliacao);
  const [salvando, setSalvando] = useState(false);
  const avaliavel = mensagem.remetente === "bot" && mensagem.interacaoId !== null;

  function avaliar(valor: "boa" | "ruim") {
    if (!mensagem.interacaoId) return;
    onErro(null);
    setSalvando(true);
    void avaliarInteracao(mensagem.interacaoId, valor).then((resultado) => {
      setSalvando(false);
      if (resultado.erro) onErro(resultado.erro);
      else setNota(valor);
    });
  }

  return (
    <div
      className={cn(
        "w-fit max-w-[85%] rounded-2xl border px-3.5 py-2 md:max-w-[70%]",
        ESTILO_BALAO[mensagem.remetente],
      )}
    >
      {mensagem.remetente === "bot" && (
        <p className="text-acento-suave text-[10px] font-semibold tracking-wide uppercase">IA</p>
      )}

      {mensagem.tipo === "audio" && (
        <p className="text-tenue text-[10px] font-medium tracking-wide uppercase">🎙 Áudio</p>
      )}
      {audioTocavel(mensagem) && (
        <audio controls preload="none" src={mensagem.midiaUrl ?? undefined} className="my-1 h-10 w-56 max-w-full" />
      )}

      <p
        className={cn(
          "text-fluid-sm whitespace-pre-line",
          mensagem.tipo === "audio" ? "text-apoio text-xs italic" : "text-corpo",
        )}
      >
        {mensagem.conteudo}
      </p>
      <p className="text-tenue mt-0.5 text-right text-[10px]">
        {hora.format(new Date(mensagem.criadoEm))}
        {mensagem.statusEntrega && (
          <span
            title={
              mensagem.statusEntrega === "lida"
                ? "Lida"
                : mensagem.statusEntrega === "entregue"
                  ? "Entregue"
                  : "Enviada"
            }
            className={cn("ml-1", mensagem.statusEntrega === "lida" ? "text-acento-suave" : "text-tenue")}
          >
            {mensagem.statusEntrega === "enviada" ? "✓" : "✓✓"}
          </span>
        )}
      </p>

      {avaliavel &&
        (nota ? (
          <p
            className={cn(
              "mt-1 text-[11px] font-medium",
              nota === "boa" ? "text-ok" : "text-perigo",
            )}
          >
            {nota === "boa" ? "👍 Avaliada como boa" : "👎 Marcada como ruim — vira caso de teste"}
          </p>
        ) : (
          <div className="mt-1 flex items-center gap-1">
            <button
              type="button"
              onClick={() => avaliar("boa")}
              disabled={salvando}
              title="Esta resposta da IA foi boa"
              className="border-linha text-apoio hover:text-ok cursor-pointer rounded-full border px-2 py-0.5 text-xs transition-colors disabled:opacity-60"
            >
              👍
            </button>
            <button
              type="button"
              onClick={() => avaliar("ruim")}
              disabled={salvando}
              title="Esta resposta da IA foi ruim — vira caso de teste"
              className="border-linha text-apoio hover:text-perigo cursor-pointer rounded-full border px-2 py-0.5 text-xs transition-colors disabled:opacity-60"
            >
              👎
            </button>
          </div>
        ))}
    </div>
  );
}
