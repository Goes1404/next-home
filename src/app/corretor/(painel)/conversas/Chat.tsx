"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import {
  avaliarInteracao,
  enviarMensagemDoPainel,
  enviarMidiaDoPainel,
  lerFichaDoLead,
  lerMensagens,
  listarCatalogoDeMidias,
  silenciarBotNaConversa,
  type FichaDoLead,
  type MensagemConversa,
  type MidiaDoCatalogo,
} from "./acoes";
import { assumirConversaComIA } from "./acoesIA";
import { ETAPA_LABEL, type EtapaFunil } from "@/lib/types";
import { agruparNaoGravadas, todasSemTexto } from "@/lib/whatsapp/conversaSemTexto";
import { PorQue } from "./PorQue";

/**
 * O chat de UMA conversa — os balões, o teclado, a ficha do lead e a
 * avaliação 👍/👎 por balão.
 *
 * Mora em arquivo próprio porque tem DOIS donos: a tela de Conversas
 * (`ConversasClient`, que é a caixa inteira) e a gaveta que abre sobre a
 * lista de Pessoas. Enquanto ele vivia dentro do `ConversasClient`, montá-lo
 * em Pessoas exigiria arrastar junto a lista, o Realtime da caixa e o
 * reconcílio — ou seja, uma segunda cópia do chat, que é como duas telas do
 * mesmo assunto passam a divergir (a lição do `turnoDeAtendimento`, agora no
 * painel).
 *
 * A extração foi feita SEM mudar uma linha de lógica, em commit próprio:
 * misturar mudança de comportamento com mudança de arquivo torna impossível
 * saber qual das duas quebrou.
 *
 * Os tipos e utilitários de formatação vieram junto porque são compartilhados
 * pelos dois donos — a lista precisa do mesmo `estadoDa` que o cabeçalho do
 * chat, senão o selo diria uma coisa e o botão faria outra.
 */

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
export type MensagemRow = {
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
export type ConversaRow = {
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

export const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const diaCurto = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const diaLongo = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

/** "5511991234567" → "(11) 99123-4567", que é como o corretor reconhece o cliente. */
export function telefoneLegivel(e164: string): string {
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  if (d.length < 10) return e164;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
  return `(${ddd}) ${meio}-${resto.slice(meio.length)}`;
}

/** Hora se foi hoje, dd/mm caso contrário — a régua do WhatsApp para a lista. */
export function quandoNaLista(iso: string): string {
  const data = new Date(iso);
  const agora = new Date();
  return data.toDateString() === agora.toDateString() ? hora.format(data) : diaCurto.format(data);
}

/** "Hoje", "Ontem" ou a data por extenso — o separador entre blocos de dias. */
export function rotuloDoDia(iso: string): string {
  const data = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86_400_000);
  if (data.toDateString() === hoje.toDateString()) return "Hoje";
  if (data.toDateString() === ontem.toDateString()) return "Ontem";
  return diaLongo.format(data);
}

export function iniciais(conversa: ConversaResumo): string {
  if (conversa.nome) {
    const partes = conversa.nome.trim().split(/\s+/);
    return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
  }
  return conversa.telefone.replace(/\D/g, "").slice(-2);
}

export function deRow(row: ConversaRow): ConversaResumo {
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

export function deMensagemRow(row: MensagemRow): MensagemConversa {
  return {
    id: row.id,
    remetente: row.remetente,
    conteudo: row.conteudo,
    criadoEm: row.created_at,
    tipo: row.tipo,
    midiaUrl: row.midia_url,
    statusEntrega: row.status_entrega,
    interacaoId: row.interacao_id,
    // Só para mensagem que CHEGA por realtime — nova, portanto sem avaliação.
    // Na carga da conversa quem traz a avaliação é `lerMensagens`, com uma
    // segunda consulta em ia_interacoes. (O comentário antigo falava de um
    // "reconcílio periódico" que não existe; enganou uma investigação.)
    avaliacao: null,
    // Pelo mesmo motivo, sem contexto: a linha de telemetria é escrita DEPOIS
    // do envio, e é o reconcílio de 15s que a traz.
    contexto: null,
  };
}

/**
 * Funde duas listas de mensagens sem duplicar e em ordem cronológica.
 * É a ÚNICA forma de escrever no cache: o histórico chega por quatro
 * caminhos (carga, Realtime, reconcílio, página antiga) e qualquer um que
 * substituísse em vez de fundir jogaria fora o que os outros trouxeram.
 */
export function mesclar(
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

export type Estado = "ativa" | "pausada_humano" | "aguardando_liberacao" | "desligada";

/**
 * O estado tem de refletir as TRÊS condições de `botDeveResponder`, não
 * duas — foi um selo que olhava só duas que escondeu, por semanas, que a
 * IA nunca tinha respondido um cliente.
 */
export function estadoDa(conversa: ConversaResumo): Estado {
  if (!conversa.botAtivo) return "desligada";
  const pausada = conversa.pausadoAte && new Date(conversa.pausadoAte).getTime() > Date.now();
  if (pausada) return "pausada_humano";
  if (!conversa.liberada) return "aguardando_liberacao";
  return "ativa";
}

export const SELO: Record<Estado, { texto: string; classe: string; ponto: string }> = {
  ativa: { texto: "IA atendendo", classe: "text-ok", ponto: "bg-ok" },
  pausada_humano: { texto: "IA em pausa", classe: "text-alerta", ponto: "bg-alerta" },
  aguardando_liberacao: {
    texto: "IA esperando sua liberação",
    classe: "text-info",
    ponto: "bg-info",
  },
  desligada: { texto: "IA desligada", classe: "text-apoio", ponto: "bg-linha-forte" },
};

export function Chat({
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
  /*
   * Só relata falha; não existe mais "limpar o erro". Antes ele escrevia num
   * parágrafo desta tela — que ficava ACIMA da caixa do chat e, no celular,
   * fora do campo de visão no exato momento em que o erro disparava. Agora vai
   * para a região de avisos do shell, que se fecha sozinha.
   */
  onErro: (e: string) => void;
  onEstado: (novo: Estado) => void;
  onMesclar: (novas: MensagemConversa[]) => void;
  onRemover: (mensagemId: string) => void;
}) {
  const [texto, setTexto] = useState("");

  /*
   * A última fala do CLIENTE é o que vai para o consultor.
   *
   * O consultor existe desde 09/09 e ninguém o abriu: ele é a sétima tela do
   * menu, e esta base já mediu que ferramenta atrás de um clique extra não é
   * usada (o aviso de apelidos não moveu nada em cinco dias porque morava
   * dentro do editor). Aqui ele fica a UM toque da pergunta que o corretor
   * não sabe responder — o uso vira efeito colateral do trabalho que ela já
   * faz, em vez de depender de alguém lembrar.
   *
   * Vai a fala do cliente, não a do bot: o que precisa de resposta é o que
   * ELE perguntou.
   */
  const ultimaDoCliente = [...(mensagens ?? [])]
    .reverse()
    .find((m) => m.remetente === "cliente" && m.conteudo.trim().length > 2);
  const [enviando, setEnviando] = useState(false);
  const [seletorAberto, setSeletorAberto] = useState(false);
  const [fichaAberta, setFichaAberta] = useState(false);
  // O histórico se esgotou? Vira true quando uma página anterior volta
  // incompleta — é o que apaga o botão "ver mensagens anteriores".
  const [esgotado, setEsgotado] = useState(false);
  const [carregandoAntigas, setCarregandoAntigas] = useState(false);
  /*
   * O guarda de "já estou carregando" precisa ser REF, não estado: `aoRolar`
   * dispara a cada evento de rolagem e o `setState` só chega no render
   * seguinte — dois eventos seguidos pediriam a mesma página duas vezes.
   * Mesmo motivo de `presoNoFimRef` logo acima.
   */
  const carregandoRef = useRef(false);
  const [pendente, iniciar] = useTransition();
  const corpoRef = useRef<HTMLDivElement>(null);
  const presoNoFimRef = useRef(true);
  /*
   * "Rolei demais para baixo e quero voltar lá para cima" (06/09/2026).
   * Conversa de meses tem centenas de balões e o único caminho de volta era
   * arrastar tudo de novo. O gatilho é a DISTÂNCIA do topo, não a direção do
   * gesto: direção some quando a pessoa para de rolar, e o botão sumiria
   * justamente no instante em que ela decide usá-lo.
   */
  const [longeDoTopo, setLongeDoTopo] = useState(false);
  const selo = SELO[estado];

  // Rola para o fim quando chegam mensagens — mas só se o corretor já
  // estava no fim. Rolar por cima de quem está relendo o histórico é pior
  // que não rolar.
  const idUltimaMensagem = mensagens?.at(-1)?.id;
  useEffect(() => {
    const corpo = corpoRef.current;
    if (corpo && presoNoFimRef.current) corpo.scrollTop = corpo.scrollHeight;
  }, [idUltimaMensagem]);

  const DISTANCIA_PARA_MOSTRAR_TOPO = 600;
  /** Perto o bastante do topo para buscar antes de a pessoa bater nele. */
  const DISTANCIA_PARA_BUSCAR_ANTIGAS = 400;

  function aoRolar() {
    const corpo = corpoRef.current;
    if (!corpo) return;
    presoNoFimRef.current = corpo.scrollHeight - corpo.scrollTop - corpo.clientHeight < 120;
    // `setState` com o MESMO booleano não re-renderiza no React, então isto
    // custa uma comparação por evento de rolagem, não uma árvore nova.
    setLongeDoTopo(corpo.scrollTop > DISTANCIA_PARA_MOSTRAR_TOPO);

    /*
     * Chegou perto do topo: traz as anteriores SOZINHO.
     *
     * O botão continua ali — ele é a explicação e o indicador de carga —, mas
     * depender dele significa que ver o contexto de uma conversa longa exige
     * descobrir um botão. Oito conversas desta base passam de 100 mensagens
     * (a maior tem 3.801), e é justamente nelas que o contexto importa para
     * avaliar resposta por resposta.
     *
     * `carregandoRef` (e não o estado) é o que impede dois eventos de
     * rolagem seguidos pedirem a mesma página.
     */
    if (
      corpo.scrollTop < DISTANCIA_PARA_BUSCAR_ANTIGAS &&
      !esgotado &&
      (mensagens?.length ?? 0) >= 100
    ) {
      void carregarAnteriores();
    }
  }

  function voltarAoTopo() {
    const corpo = corpoRef.current;
    if (!corpo) return;
    // Sair do fim é o que impede o efeito de mensagem nova puxar a leitura
    // de volta para baixo no meio da subida.
    presoNoFimRef.current = false;
    corpo.scrollTo({ top: 0, behavior: "smooth" });
  }

  function alternarBot() {
    // Otimista: muda antes da resposta; se o servidor recusar, volta.
    const anterior = estado;
    const proximo: Estado = estado === "ativa" ? "desligada" : "ativa";
    onEstado(proximo);
    iniciar(async () => {
      if (proximo === "ativa") {
        // "IA assume agora": liga as três condições E responde a pendência
        // do cliente na hora, se houver (ver acoesIA.ts).
        const resultado = await assumirConversaComIA(conversa.id);
        if (resultado.erro && !resultado.ok) {
          onEstado(anterior);
          onErro(resultado.erro);
          return;
        }
        if (resultado.erro) onErro(resultado.erro);
        if (resultado.respondeu) {
          presoNoFimRef.current = true;
          onMesclar(await lerMensagens(conversa.id));
        }
        return;
      }
      const resultado = await silenciarBotNaConversa(conversa.id);
      if (resultado.erro) {
        onEstado(anterior);
        onErro(resultado.erro);
      }
    });
  }

  async function enviar() {
    const conteudo = texto.trim();
    if (!conteudo || enviando) return;
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
      contexto: null,
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
    if (!primeira || carregandoRef.current) return;
    carregandoRef.current = true;
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
    carregandoRef.current = false;
    setCarregandoAntigas(false);
  }

  return (
    <>
      {/*
        Cabeçalho, corpo e teclado na linguagem do WhatsApp (04/09/2026):
        barras cinza, papel de parede com rabisco, balões verde/cinza com
        rabinho, hora e ✓✓ dentro do balão, botão de enviar verde e redondo.
        A corretora vive no app o dia inteiro; o painel não deve exigir que
        ela aprenda um segundo jeito de ler uma conversa.
      */}
      <header className="bg-wa-barra flex items-center gap-2 px-2 py-2 md:px-4">
        <button
          type="button"
          onClick={onVoltar}
          aria-label="Voltar para a lista"
          className="text-wa-meta hover:text-wa-texto flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full md:hidden"
        >
          <svg viewBox="0 0 24 24" className="size-6 fill-none stroke-current" strokeWidth="2" aria-hidden>
            <path d="M15 5l-7 7 7 7" />
          </svg>
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
          <span className="bg-wa-divisor text-wa-meta flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
            {iniciais(conversa)}
          </span>

          <span className="min-w-0 flex-1">
            <span className="text-wa-texto block truncate text-[16px] font-medium">
              {conversa.nome || telefoneLegivel(conversa.telefone)}
              {conversa.temLead && <span className="text-wa-meta ml-1 text-xs">{fichaAberta ? "▴" : "▾"}</span>}
            </span>
            <span className="block truncate text-[13px]">
              {/* No celular o telefone empurrava o status para fora ("IA a…");
                  o que a corretora precisa ler de relance é o status. */}
              {conversa.nome && (
                <span className="text-wa-meta hidden sm:inline">{telefoneLegivel(conversa.telefone)} · </span>
              )}
              <span className={selo.classe}>{selo.texto}</span>
              {!conversa.temLead && <span className="text-wa-meta"> · sem ficha no funil</span>}
            </span>
          </span>
        </button>

        {ultimaDoCliente && (
          <Link
            href={`/corretor/consultor?pergunta=${encodeURIComponent(ultimaDoCliente.conteudo.slice(0, 400))}`}
            title="Perguntar ao consultor"
            aria-label="Perguntar ao consultor sobre a última mensagem do cliente"
            className="text-wa-meta hover:text-wa-texto flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full"
          >
            {/* Balão com uma casa dentro — o mesmo ícone do destino no menu. */}
            <svg
              viewBox="0 0 24 24"
              className="size-6 fill-none stroke-current"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M21 12a8 8 0 0 1-8 8H8l-4 3v-4.6A8 8 0 1 1 21 12Z" />
              <path d="M9.5 12.5 12.5 10l3 2.5" />
              <path d="M10.5 12v3h4v-3" />
            </svg>
          </Link>
        )}

        <button
          type="button"
          onClick={alternarBot}
          disabled={pendente}
          className={cn(
            "flex min-h-11 shrink-0 cursor-pointer items-center rounded-full px-3.5 text-xs font-medium transition-colors disabled:opacity-60",
            estado === "ativa"
              ? "border-wa-divisor text-wa-texto hover:bg-wa-divisor border"
              : "bg-wa-verde text-white hover:opacity-90",
          )}
        >
          {estado === "ativa" ? "Desligar IA" : "IA assume agora"}
        </button>
      </header>

      {fichaAberta && conversa.temLead && <FichaLead conversaId={conversa.id} />}

      {/*
        Corpo com os balões, sobre o papel de parede. O invólucro `relative`
        existe só para ancorar o botão de voltar ao topo: o corpo é o
        contêiner de rolagem, e botão flutuante DENTRO dele rolaria junto.
      */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={corpoRef}
          onScroll={aoRolar}
          /* `overscroll-contain`: no celular o chat é `fixed` e a página segue
             atrás dele. Sem isto, chegar ao topo da conversa passa a rolagem
             adiante e a página de trás se mexe — o "scroll chaining" que faz a
             tela pular quando se lê a conversa até o começo. */
          className="wa-papel flex-1 overflow-y-auto overscroll-contain px-[4%] py-3 md:px-[7%]"
        >
          {mensagens !== null && mensagens.length >= 100 && !esgotado && (
            <p className="pb-2 text-center">
              <button
                type="button"
                onClick={() => void carregarAnteriores()}
                disabled={carregandoAntigas}
                className="bg-wa-dia text-wa-meta hover:text-wa-texto min-h-11 cursor-pointer rounded-lg px-4 text-xs shadow-sm transition-colors disabled:opacity-60"
              >
                {carregandoAntigas ? "Carregando…" : "Ver mensagens anteriores"}
              </button>
            </p>
          )}
          {mensagens === null ? (
            <p className="text-wa-meta py-8 text-center text-xs">Carregando conversa…</p>
          ) : mensagens.length === 0 ? (
            <p className="text-wa-meta py-8 text-center text-xs">Sem mensagens registradas.</p>
          ) : todasSemTexto(mensagens) ? (
            /*
             * Nada aqui tem texto: em vez de uma parede do mesmo marcador
             * repetida até o fim da tela, a conversa explica o que houve e
             * oferece a saída. O placeholder existe para a linha em branco não
             * parecer defeito — repetido, ele deixa de informar.
             */
            <ConversaNaoGuardada aoLiberar={alternarBot} liberando={pendente} />
          ) : (
            agruparNaoGravadas(mensagens).map((item, i, itens) => {
              /*
               * Conversa mista (liberada no meio): o buraco é INFORMAÇÃO — é
               * ele que explica por que a IA parece ter perdido o fio — mas
               * cabe numa linha, não em vinte balões iguais.
               */
              if ("naoGravadas" in item) {
                return (
                  <p key={`lacuna-${i}`} className="my-3 text-center">
                    <span className="bg-wa-dia text-wa-meta rounded-lg px-3 py-1.5 text-[12px] shadow-sm">
                      {item.naoGravadas === 1
                        ? "1 mensagem não gravada"
                        : `${item.naoGravadas} mensagens não gravadas`}
                    </span>
                  </p>
                );
              }

              const m = item;
              const vizinho = itens[i - 1];
              // Lacuna quebra a sequência de propósito: depois de um buraco o
              // rabinho volta, senão o balão seguinte pareceria continuação de
              // uma fala que a tela não mostrou.
              const anterior = vizinho && !("naoGravadas" in vizinho) ? vizinho : undefined;
              const trocouDia =
                !anterior ||
                new Date(anterior.criadoEm).toDateString() !== new Date(m.criadoEm).toDateString();
              // Rabinho só no primeiro balão de uma sequência do mesmo lado —
              // e os seguintes ficam colados, como no app.
              const mesmoLado = !!anterior && !trocouDia && ladoDo(anterior) === ladoDo(m);
              return (
                <div key={m.id} className={mesmoLado ? "mt-0.5" : "mt-2.5"}>
                  {trocouDia && (
                    <p className="my-3 text-center">
                      <span className="bg-wa-dia text-wa-meta rounded-lg px-3 py-1.5 text-[12px] uppercase shadow-sm">
                        {rotuloDoDia(m.criadoEm)}
                      </span>
                    </p>
                  )}
                  <Balao mensagem={m} comRabo={!mesmoLado} onErro={onErro} />
                </div>
              );
            })
          )}
        </div>

        {/*
          Sobe até o começo do histórico JÁ CARREGADO — e é lá que mora o
          "Ver mensagens anteriores", então a subida entrega a pessoa
          exatamente no botão que traz o resto. Não persegue: a paginação
          desta tela é por clique, não por rolagem, então chegar ao topo não
          dispara carga nova nem faz o topo fugir.
        */}
        <button
          type="button"
          onClick={voltarAoTopo}
          aria-label="Voltar ao começo da conversa"
          title="Voltar ao começo da conversa"
          className={cn(
            "bg-wa-barra text-wa-texto absolute top-3 right-3 z-10 flex size-10 cursor-pointer items-center justify-center rounded-full shadow-md transition-opacity",
            longeDoTopo ? "opacity-90 hover:opacity-100" : "pointer-events-none opacity-0",
          )}
        >
          <svg viewBox="0 0 24 24" className="size-5 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      </div>

      {/* Teclado */}
      <footer className="bg-wa-barra relative px-2 py-2 md:px-3">
        {seletorAberto && (
          <SeletorDeMidia onEscolher={enviarMidia} onFechar={() => setSeletorAberto(false)} />
        )}

        {podeEnviar ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void enviar();
            }}
            className="flex items-end gap-1.5"
          >
            <button
              type="button"
              onClick={() => setSeletorAberto((v) => !v)}
              disabled={enviando}
              aria-label="Anexar foto do catálogo"
              title="Enviar foto ou planta de um imóvel"
              className={cn(
                "text-wa-meta hover:text-wa-texto flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors disabled:opacity-50",
                seletorAberto && "bg-wa-divisor text-wa-texto",
              )}
            >
              <svg viewBox="0 0 24 24" className="size-6 fill-none stroke-current" strokeWidth="1.8" aria-hidden>
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
              placeholder="Mensagem"
              className="bg-wa-campo text-wa-texto placeholder:text-wa-meta max-h-32 min-h-11 w-full resize-none rounded-3xl px-4 py-2.5 text-[15px] outline-none"
            />
            <button
              type="submit"
              disabled={enviando || !texto.trim()}
              aria-label="Enviar mensagem"
              className="bg-wa-verde flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
                <path d="M3.4 20.4 20.9 12 3.4 3.6l.01 6.53L15 12 3.41 13.87z" />
              </svg>
            </button>
          </form>
        ) : (
          <p className="text-fluid-xs text-wa-meta px-2 py-1.5">
            O número não está conectado — conecte o WhatsApp em{" "}
            <a
              href="/corretor/whatsapp"
              className="text-wa-verde underline-offset-4 hover:underline"
            >
              Conexão
            </a>{" "}
            para responder por aqui.
          </p>
        )}
        {estado === "pausada_humano" && conversa.pausadoAte && (
          <p className="text-fluid-xs text-wa-meta mt-1.5 px-2">
            Você assumiu esta conversa; a IA volta sozinha em até 24h — ou agora, pelo botão acima.
          </p>
        )}
      </footer>
    </>
  );
}

/**
 * A conversa que nunca foi liberada, explicada.
 *
 * O texto não está escondido nem perdido: ele nunca chegou ao banco. O número
 * da instância é o WhatsApp pessoal do corretor, e a regra de 01/09 guarda a
 * linha sem guardar o conteúdo de quem ninguém autorizou — foram 4.178
 * mensagens de vida particular gravadas antes dela existir.
 *
 * Por isso o cartão diz as três coisas na ordem em que a pergunta nasce: por
 * que está vazia, o que muda ao liberar, e que o passado continua sem texto.
 * A terceira é a que evita a decepção de liberar esperando que a conversa
 * apareça.
 *
 * O botão é o MESMO `alternarBot` do cabeçalho, não uma segunda chamada: dois
 * caminhos para a mesma ação divergem no dia em que um deles ganha uma etapa.
 */
function ConversaNaoGuardada({
  aoLiberar,
  liberando,
}: {
  aoLiberar: () => void;
  liberando: boolean;
}) {
  return (
    <div className="bg-wa-entrada mx-auto my-8 max-w-sm rounded-xl p-4 text-center shadow-[0_1px_2px_rgba(11,20,26,0.2)]">
      <p className="text-wa-texto text-[14.2px] font-medium">Esta conversa não foi guardada</p>
      <p className="text-wa-meta mt-2 text-[13px] leading-relaxed">
        O número é o seu WhatsApp pessoal. Enquanto ninguém autoriza uma conversa, o sistema
        registra que ela existe e <strong>não guarda o texto</strong>.
      </p>
      <p className="text-wa-meta mt-2 text-[13px] leading-relaxed">
        Ao liberar, a IA passa a responder e o que vier daqui em diante fica gravado. O que já
        passou continua sem texto — ele nunca chegou ao banco.
      </p>
      <button
        type="button"
        onClick={aoLiberar}
        disabled={liberando}
        className="bg-wa-verde mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {liberando ? "Liberando…" : "IA assume agora"}
      </button>
    </div>
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
  const [imovelAberto, setImovelAberto] = useState<string | null>(null);

  const { falhar } = useAvisos();

  useEffect(() => {
    let vivo = true;
    void listarCatalogoDeMidias().then((resultado) => {
      if (!vivo) return;
      if ("erro" in resultado) falhar(resultado.erro);
      else setImoveis(resultado.imoveis);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const aberto = imoveis?.find((i) => i.nome === imovelAberto) ?? null;

  return (
    <div className="cartao absolute bottom-full left-2 z-10 mb-2 w-[min(28rem,calc(100%-1rem))] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-titulo text-sm font-medium">
          {aberto ? aberto.nome : "Enviar foto do catálogo"}
        </p>
        <div className="flex items-center gap-1">
          {aberto && (
            <button
              type="button"
              onClick={() => setImovelAberto(null)}
              className="text-apoio hover:text-titulo min-h-11 cursor-pointer rounded-full px-3 text-xs"
            >
              ← imóveis
            </button>
          )}
          <button
            type="button"
            onClick={onFechar}
            aria-label="Fechar seletor"
            className="text-apoio hover:text-titulo min-h-11 cursor-pointer rounded-full px-3 text-xs"
          >
            ✕
          </button>
        </div>
      </div>

      {imoveis === null ? (
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
                <span className="min-w-0 flex-1 truncate">{imovel.nome}</span>
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

/** De que lado da tela o balão fica: o cliente à esquerda; IA e corretor (nós) à direita. */
function ladoDo(m: MensagemConversa): "entrada" | "saida" {
  return m.remetente === "cliente" ? "entrada" : "saida";
}

/** A cor do balão, pela régua do app: quem escreveu de fora é cinza, o que saiu daqui é verde. */
const ESTILO_BALAO: Record<"entrada" | "saida", string> = {
  entrada: "bg-wa-entrada",
  saida: "bg-wa-saida",
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

/** Imagem que dá para mostrar inline — as nossas, do catálogo, têm URL pública. */
function imagemVisivel(m: MensagemConversa): boolean {
  return m.tipo === "imagem" && !!m.midiaUrl && /^https?:\/\//.test(m.midiaUrl) && !/\.enc([?#]|$)/.test(m.midiaUrl);
}

function Balao({
  mensagem,
  comRabo,
  onErro,
}: {
  mensagem: MensagemConversa;
  /** Primeiro balão de uma sequência do mesmo lado: leva o rabinho e o canto reto. */
  comRabo: boolean;
  /*
   * Só relata falha; não existe mais "limpar o erro". Antes ele escrevia num
   * parágrafo desta tela — que ficava ACIMA da caixa do chat e, no celular,
   * fora do campo de visão no exato momento em que o erro disparava. Agora vai
   * para a região de avisos do shell, que se fecha sozinha.
   */
  onErro: (e: string) => void;
}) {
  /*
   * Avaliação POR BALÃO — o motivo de existir do vínculo da 0040. Antes só
   * a última resposta da conversa era avaliável; a falha no meio (o rótulo
   * que mais ensina) não tinha onde ser registrada.
   */
  const [nota, setNota] = useState<"boa" | "ruim" | null>(mensagem.avaliacao);
  const [salvando, setSalvando] = useState(false);
  // Reabriu os dois botões para trocar a avaliação já dada.
  const [trocando, setTrocando] = useState(false);
  /*
   * O "por quê?" abre sozinho ao marcar 👎 — é o instante exato em que a
   * pergunta existe. Fechado por padrão porque, quando a resposta está boa,
   * quatro linhas de diagnóstico embaixo de cada balão viram ruído.
   */
  const [porQueAberto, setPorQueAberto] = useState(false);
  const avaliavel = mensagem.remetente === "bot" && mensagem.interacaoId !== null;
  const lado = ladoDo(mensagem);

  function avaliar(valor: "boa" | "ruim") {
    if (!mensagem.interacaoId) return;
    setSalvando(true);
    void avaliarInteracao(mensagem.interacaoId, valor).then((resultado) => {
      setSalvando(false);
      if (resultado.erro) onErro(resultado.erro);
      else {
        setNota(valor);
        setTrocando(false);
        if (valor === "ruim") setPorQueAberto(true);
      }
    });
  }

  return (
    <div
      className={cn(
        "flex w-fit max-w-[85%] flex-col md:max-w-[65%]",
        lado === "entrada" ? "mr-auto items-start" : "ml-auto items-end",
      )}
    >
      <div
        className={cn(
          // 8px de raio, sombra rasa e o rabinho: a anatomia do balão do app.
          "relative rounded-lg px-2 pt-1.5 pb-1 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]",
          ESTILO_BALAO[lado],
          comRabo && (lado === "entrada" ? "wa-rabo-entrada rounded-tl-none" : "wa-rabo-saida rounded-tr-none"),
        )}
      >
        {/* Nome do remetente em verde, como o app faz em grupo: aqui só quando é a IA. */}
        {mensagem.remetente === "bot" && (
          <p className="text-wa-nome text-[12.5px] font-medium">IA</p>
        )}

        {imagemVisivel(mensagem) && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mensagem.midiaUrl ?? undefined}
            alt=""
            className="mb-1 max-h-72 w-auto max-w-full rounded-md"
          />
        )}
        {mensagem.tipo === "audio" && (
          <p className="text-wa-meta text-[10px] font-medium tracking-wide uppercase">🎙 Áudio</p>
        )}
        {audioTocavel(mensagem) && (
          <audio controls preload="none" src={mensagem.midiaUrl ?? undefined} className="my-1 h-10 w-56 max-w-full" />
        )}

        {/* O espaçador no fim do texto reserva o canto para a hora, que fica em
            absoluto embaixo à direita — a última linha corre ao lado dela. */}
        <p
          className={cn(
            // `break-words`: cliente manda link o tempo todo, e URL nao
            // quebra sozinha — ela esticava o balao alem do proprio limite.
            "text-[14.2px] leading-[19px] break-words whitespace-pre-line",
            mensagem.tipo === "audio" ? "text-wa-meta text-xs italic" : "text-wa-texto",
          )}
        >
          {mensagem.conteudo}
          <span aria-hidden className={cn("inline-block", mensagem.statusEntrega ? "w-[68px]" : "w-12")} />
        </p>
        <p className="text-wa-meta absolute right-2 bottom-1 flex items-center gap-1 text-[11px] leading-none">
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
              className={cn("text-[12px]", mensagem.statusEntrega === "lida" ? "text-wa-lida" : "text-wa-meta")}
            >
              {mensagem.statusEntrega === "enviada" ? "✓" : "✓✓"}
            </span>
          )}
        </p>
      </div>

      {/*
        A avaliação como REAÇÃO, do jeito que o app mostra o emoji numa
        mensagem: uma pílula sobreposta ao pé do balão. Dois toques possíveis
        (👍/👎), sempre visíveis — no celular não existe hover. Depois de
        avaliar, o emoji escolhido fica na pílula, e tocar nela reabre os dois:
        avaliação errada tem de poder ser trocada.

        A pílula tem 28px de altura para parecer a do app; os botões dentro
        dela têm 44px de área tocável (margem negativa), que é a régua da casa.
        Só balão da IA com `interacaoId` é avaliável: é o vínculo da 0040 que
        liga o balão à interação, e é isso que alimenta o aprendizado.
      */}
      {avaliavel && (
        <div className="relative z-[1] -mt-2 mr-2 flex h-7 items-center rounded-full bg-wa-entrada px-1 shadow-[0_1px_2px_rgba(11,20,26,0.3)] ring-1 ring-wa-divisor">
          {nota && !trocando ? (
            <button
              type="button"
              onClick={() => setTrocando(true)}
              title={nota === "boa" ? "Você marcou como boa — toque para trocar" : "Você marcou como ruim — toque para trocar"}
              aria-label={nota === "boa" ? "Avaliada como boa. Trocar avaliação" : "Avaliada como ruim. Trocar avaliação"}
              className="-my-2 flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1 px-1.5 text-[15px] transition-transform hover:scale-110"
            >
              <span aria-hidden>{nota === "boa" ? "👍" : "👎"}</span>
              <span className="text-wa-meta text-[11px] font-medium">{nota === "boa" ? "boa" : "ruim"}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => avaliar("boa")}
                disabled={salvando}
                aria-label="Marcar esta resposta da IA como boa"
                title="Esta resposta da IA foi boa"
                className={cn(
                  "-my-2 grid size-11 cursor-pointer place-items-center text-[17px] transition-transform hover:scale-125 disabled:opacity-60",
                  nota === "boa" && "scale-110",
                )}
              >
                <span aria-hidden>👍</span>
              </button>
              <button
                type="button"
                onClick={() => avaliar("ruim")}
                disabled={salvando}
                aria-label="Marcar esta resposta da IA como ruim — ela aprende a não repetir"
                title="Marcar como ruim — a IA aprende a não repetir"
                className={cn(
                  "-my-2 grid size-11 cursor-pointer place-items-center text-[17px] transition-transform hover:scale-125 disabled:opacity-60",
                  nota === "ruim" && "scale-110",
                )}
              >
                <span aria-hidden>👎</span>
              </button>
            </>
          )}
        </div>
      )}

      {/*
        O contexto da decisão, atrás de um toque.
        `<details>` de propósito: abre e fecha sem estado próprio, funciona
        sem JavaScript e o leitor de tela já anuncia que há conteúdo dentro.
        O `open` controlado existe só para o 👎 poder abri-lo sozinho.
      */}
      {avaliavel && (
        <details
          open={porQueAberto}
          onToggle={(e) => setPorQueAberto(e.currentTarget.open)}
          className="mr-1 mt-1 max-w-full min-w-0"
        >
          {/* 44px de área tocável com 32 de espaço ocupado — a margem negativa
              é o mesmo truque da pílula de avaliação: a régua de toque da casa
              sem quatro linhas de ar embaixo de cada balão. */}
          <summary className="text-wa-meta hover:text-wa-texto -my-1.5 inline-flex min-h-11 cursor-pointer items-center text-[12px] underline-offset-4 hover:underline">
            por quê?
          </summary>
          <div className="bg-wa-entrada mt-1 rounded-lg px-2.5 py-2 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
            <PorQue contexto={mensagem.contexto} />
          </div>
        </details>
      )}
    </div>
  );
}

