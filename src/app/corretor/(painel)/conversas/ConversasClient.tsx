"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { lerMensagens, marcarConversaLida, type MensagemConversa } from "./acoes";
import {
  Chat,
  SELO,
  deMensagemRow,
  deRow,
  estadoDa,
  iniciais,
  mesclar,
  quandoNaLista,
  telefoneLegivel,
  type ConversaResumo,
  type ConversaRow,
  type Estado,
  type MensagemRow,
} from "./Chat";

/*
 * O tipo mora no `Chat.tsx` (é ele quem descreve uma conversa na tela), e
 * `conversas/page.tsx` sempre o importou daqui. Reexportar mantém o import
 * do servidor válido sem criar uma segunda definição para divergir.
 */
export type { ConversaResumo } from "./Chat";

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
  conversaInicial,
}: {
  conversas: ConversaResumo[];
  podeEnviar: boolean;
  /**
   * A conversa que já vem aberta, vinda de `?c=<id>` na URL.
   *
   * Existe porque a lista de Pessoas é a porta única do painel: tocar em
   * alguém tem de cair NA CONVERSA daquela pessoa, não numa lista onde é
   * preciso encontrá-la de novo. Sem isto, fundir as duas portas teria
   * trocado uma escolha ruim por um toque a mais.
   */
  conversaInicial?: string | null;
}) {
  const [selecionadaId, setSelecionadaId] = useState<string | null>(conversaInicial ?? null);
  const { falhar } = useAvisos();
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
      <div className="cartao mt-8 p-6">
        <p className="text-fluid-sm text-corpo">
          Nenhuma conversa ainda. Assim que alguém escrever para o número conectado, ela aparece
          aqui — e você vê na hora se a IA respondeu ou ficou de fora.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6">
      {/*
        No CELULAR não existe mais caixa de altura fixa.
        Era `h-[72dvh]` com rolagem interna dentro de uma página que também
        rolava: dois scrolls concorrentes sob o mesmo dedo, com o cabeçalho
        grudento em cima e a barra do polegar embaixo comendo o resto. E
        altura fixa aqui nunca poderia estar certa — o que vem acima da caixa
        (cabeçalho, abas, aviso de revisão) muda de tamanho conforme o dia.

        Agora: a lista de conversas é uma lista de página comum, que rola com
        a página; e a conversa aberta vira TELA CHEIA entre o cabeçalho e a
        barra (`fixed`, mais abaixo), como em qualquer aplicativo de mensagem.
        A caixa de duas colunas com altura calculada fica só no computador,
        onde ela cabe e faz sentido.
      */}
      <div className="border-linha bg-wa-lista shadow-painel flex flex-col overflow-hidden rounded-2xl border md:h-[calc(100dvh-var(--painel-header-h)-9rem)] md:min-h-[420px] md:flex-row">
        {/* Lista de conversas — no celular some quando um chat está aberto */}
        <aside
          className={cn(
            "border-wa-divisor bg-wa-lista flex w-full shrink-0 flex-col md:w-80 md:border-r lg:w-96",
            selecionada && "hidden md:flex",
          )}
        >
          <div className="border-wa-divisor border-b p-2">
            <label className="bg-wa-barra text-wa-meta flex min-h-10 items-center gap-3 rounded-lg px-3">
              <svg viewBox="0 0 24 24" className="size-5 shrink-0 fill-none stroke-current" strokeWidth="2" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Pesquisar ou começar uma nova conversa"
                aria-label="Buscar conversa"
                className="text-wa-texto placeholder:text-wa-meta min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
            </label>
          </div>

          {/* Rola só no computador; no celular quem rola é a página. */}
          <ul className="md:flex-1 md:overflow-y-auto">
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
                      "border-wa-divisor hover:bg-wa-barra flex w-full cursor-pointer items-center gap-3 border-b px-3 py-2.5 text-left transition-colors",
                      ativa && "bg-wa-barra",
                    )}
                  >
                    <span className="bg-wa-divisor text-wa-meta relative flex size-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
                      {iniciais(conversa)}
                      <span
                        title={SELO[estado].texto}
                        className={cn(
                          "border-wa-lista absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2",
                          SELO[estado].ponto,
                        )}
                      />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            "text-wa-texto min-w-0 flex-1 truncate text-[15px]",
                            naoLidas > 0 ? "font-semibold" : "font-normal",
                          )}
                        >
                          {conversa.nome || telefoneLegivel(conversa.telefone)}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[12px]",
                            naoLidas > 0 ? "text-wa-verde font-medium" : "text-wa-meta",
                          )}
                        >
                          {quandoNaLista(quando)}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center justify-between gap-2">
                        <span
                          className={cn(
                            "block truncate text-[13px]",
                            naoLidas > 0 ? "text-wa-texto" : "text-wa-meta",
                          )}
                        >
                          {previa ?? "Sem mensagens"}
                        </span>
                        {naoLidas > 0 && (
                          <span className="bg-wa-verde flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-white">
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
              <li className="text-wa-meta px-4 py-6 text-center text-sm">Nada com essa busca.</li>
            )}
          </ul>
        </aside>

        {/* Chat aberto */}
        <section
          className={cn(
            "min-w-0 flex-1 flex-col md:static md:z-auto",
            selecionada
              ? // Tela cheia entre o cabeçalho e a barra do polegar. `bg-fundo`
                // é obrigatório: sem ele o conteúdo da página aparece por trás.
                "bg-wa-fundo fixed inset-x-0 top-[var(--painel-header-h)] bottom-[var(--nav-mobile-h)] z-30 flex md:bottom-0"
              : "hidden md:flex",
          )}
        >
          {selecionada ? (
            <Chat
              key={selecionada.id}
              conversa={selecionada}
              estado={estados[selecionada.id] ?? estadoDa(selecionada)}
              mensagens={mensagensPor[selecionada.id] ?? null}
              podeEnviar={podeEnviar}
              onVoltar={() => setSelecionadaId(null)}
              onErro={falhar}
              onEstado={(novo) => setEstados((atual) => ({ ...atual, [selecionada.id]: novo }))}
              onMesclar={(novas) => mesclarNaConversa(selecionada.id, novas)}
              onRemover={(mensagemId) => removerDaConversa(selecionada.id, mensagemId)}
            />
          ) : (
            <div className="wa-papel text-wa-meta flex flex-1 items-center justify-center p-8 text-center text-sm">
              Escolha uma conversa ao lado para ler e responder por aqui.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

