"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { ChatBase } from "@/app/corretor/(painel)/_componentes/ChatBase";
import { ListaDeConversas } from "@/app/corretor/(painel)/_componentes/ListaDeConversas";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { ROTULO_STATUS, type VideoJob } from "@/lib/video/videoTipos";
import type {
  ConversaDoEstudio,
  MensagemDoEstudio,
  PerguntaDoEstudio,
  PropostaDeVideo,
} from "@/lib/estudio/contrato";
import {
  abrirConversa,
  confirmarPropostaDeVideo,
  enviarMensagemDoEstudio,
  excluirConversaDoEstudio,
  type EstadoDoChat,
} from "@/app/corretor/(painel)/estudio/acoes";
import { statusDosVideos } from "./acoes";

/**
 * Criar vídeo, em forma de chat.
 *
 * O corretor diz o que quer ("um story do Eternity, lançamento"); a IA
 * descobre qual imóvel, objetivo e canal — perguntando o que faltar, um chip
 * por vez — e devolve o ROTEIRO de verdade (o mesmo `montarRoteiro` de
 * sempre) como proposta. "Gerar assim" chama `criarVideo`, que reserva
 * crédito e enfileira; o render acontece no worker e chega aqui pelo polling
 * que a tela antiga já fazia.
 */

const INTERVALO_MS = 6000;

export function ChatDeVideo({
  conversasIniciais,
  videosIniciais,
  saldoInicial,
}: {
  conversasIniciais: ConversaDoEstudio[];
  videosIniciais: VideoJob[];
  saldoInicial: { disponiveis: number; cotaMensal: number };
}) {
  const { avisar, falhar } = useAvisos();
  const [conversas, setConversas] = useState(conversasIniciais);
  const [estado, setEstado] = useState<EstadoDoChat | null>(null);
  const [pendente, setPendente] = useState<{ id: string; conteudo: string } | null>(null);
  const [pensando, setPensando] = useState(false);
  const [gerando, setGerando] = useState<string | null>(null);
  const [videos, setVideos] = useState(videosIniciais);
  const [saldo, setSaldo] = useState(saldoInicial);
  const [, iniciar] = useTransition();

  const aplicar = (r: EstadoDoChat | { erro: string }) => {
    if ("erro" in r) {
      falhar(r.erro);
      return false;
    }
    setEstado(r);
    setConversas((lista) => [r.conversa, ...lista.filter((c) => c.id !== r.conversa.id)]);
    return true;
  };

  const enviar = async (texto: string, escolha?: { perguntaId: string; pergunta: string }) => {
    setPendente({ id: `temp-${Date.now()}`, conteudo: texto });
    setPensando(true);
    try {
      const r = await enviarMensagemDoEstudio({
        tipo: "video",
        conversaId: estado?.conversa.id ?? null,
        texto,
        escolha: escolha ?? null,
      });
      if (!aplicar(r)) throw new Error("falhou");
    } catch (e) {
      if (!(e instanceof Error && e.message === "falhou")) falhar("Sem conexão. Tente de novo.");
      throw e;
    } finally {
      setPendente(null);
      setPensando(false);
    }
  };

  const escolher = (pergunta: PerguntaDoEstudio, escolha: string) =>
    enviar(escolha, { perguntaId: pergunta.id, pergunta: pergunta.texto });

  const gerar = async (m: MensagemDoEstudio) => {
    if (!estado || gerando) return;
    setGerando(m.id);
    try {
      const r = await confirmarPropostaDeVideo({
        conversaId: estado.conversa.id,
        proposta: m.dados as PropostaDeVideo,
      });
      if (aplicar(r)) {
        avisar("Na fila. O vídeo aparece aqui quando ficar pronto.");
        void atualizar();
      }
    } catch {
      falhar("Sem conexão. Tente de novo.");
    } finally {
      setGerando(null);
    }
  };

  // Polling só enquanto houver render em andamento — como a tela antiga.
  const emAndamento = videos.some((v) => v.status === "pendente" || v.status === "renderizando");
  const atualizar = useCallback(async () => {
    try {
      const r = await statusDosVideos();
      setVideos(r.videos);
      setSaldo(r.saldo);
    } catch {
      // Rede falhou: o próximo tique tenta de novo.
    }
  }, []);

  useEffect(() => {
    if (!emAndamento) return;
    const id = setInterval(() => void atualizar(), INTERVALO_MS);
    return () => clearInterval(id);
  }, [emAndamento, atualizar]);

  const videoDe = (m: MensagemDoEstudio) => (m.videoJobId ? videos.find((v) => v.id === m.videoJobId) : undefined);

  const abrir = (id: string) => iniciar(async () => void aplicar(await abrirConversa(id)));
  const excluir = async (id: string) => {
    const r = await excluirConversaDoEstudio(id);
    if (r.erro) return falhar(r.erro);
    setConversas((l) => l.filter((c) => c.id !== id));
    if (estado?.conversa.id === id) setEstado(null);
  };

  return (
    <div className="grid gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
      <ListaDeConversas
        conversas={conversas}
        ativa={estado?.conversa.id ?? null}
        onAbrir={abrir}
        onNova={() => setEstado(null)}
        onExcluir={excluir}
      />

      <div className="space-y-2">
        <ChatBase
          mensagens={estado?.mensagens ?? []}
          pendente={pendente}
          pensando={pensando}
          placeholder='Ex.: "um story do Eternity, de lançamento"'
          vazio={
            <>
              <p className="text-titulo font-medium">Qual vídeo você quer?</p>
              <p className="mt-1">
                Diz o imóvel e a ideia. Eu monto o roteiro das fotos, mostro os planos, e só gero quando
                você aprovar. Sai mudo de propósito — você põe o áudio em alta no Instagram.
              </p>
            </>
          }
          onEnviar={enviar}
          onEscolher={escolher}
          renderProposta={(m) => (
            <CartaoDeRoteiro
              proposta={m.dados as PropostaDeVideo}
              gerando={gerando === m.id}
              bloqueada={Boolean(gerando) || saldo.disponiveis <= 0}
              onGerar={() => void gerar(m)}
            />
          )}
          renderResultado={(m) => {
            const v = videoDe(m);
            if (!v) return null;
            if (v.status === "pronto" && v.url) {
              return (
                <video
                  src={v.url}
                  controls
                  playsInline
                  className="border-linha mt-2 max-h-80 w-auto max-w-full rounded-xl border"
                />
              );
            }
            return (
              <p className="text-apoio mt-2 text-xs">
                {ROTULO_STATUS[v.status]}
                {v.status === "erro" && v.erroMotivo ? ` — ${v.erroMotivo}` : ""}
              </p>
            );
          }}
        />
        <p className="text-tenue px-1 text-right text-[11px]">
          {saldo.disponiveis > 0
            ? `${saldo.disponiveis} vídeo${saldo.disponiveis === 1 ? "" : "s"} disponíve${saldo.disponiveis === 1 ? "l" : "is"} este mês`
            : "Sem vídeos disponíveis este mês"}
          {" · "}conversar não gasta crédito
        </p>
      </div>
    </div>
  );
}

function CartaoDeRoteiro({
  proposta,
  gerando,
  bloqueada,
  onGerar,
}: {
  proposta: PropostaDeVideo;
  gerando: boolean;
  bloqueada: boolean;
  onGerar: () => void;
}) {
  const temProblema = proposta.problemas.length > 0;
  return (
    <div className="border-linha bg-superficie mt-2 space-y-2 rounded-xl border p-3">
      <p className="text-tenue text-[10px] font-medium tracking-[0.14em] uppercase">Roteiro</p>
      <p className="text-corpo text-sm font-medium">
        {proposta.imovelNome} · {proposta.resumo}
      </p>
      <ol className="text-apoio list-decimal space-y-0.5 pl-5 text-xs">
        {proposta.planos.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ol>
      <div className="text-apoio border-linha border-t pt-2 text-xs">
        <p className="text-corpo font-medium">{proposta.copy.titulo}</p>
        <p>{proposta.copy.apoio}</p>
        <p className="text-tenue">{proposta.copy.cta}</p>
      </div>
      {temProblema && (
        <p className="text-perigo text-xs">{proposta.problemas.join("; ")}</p>
      )}
      <button
        type="button"
        onClick={onGerar}
        disabled={bloqueada || temProblema}
        aria-busy={gerando}
        className={cn(
          "bg-acento text-sobre-cor hover:bg-acento-hover min-h-11 w-full cursor-pointer rounded-xl px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {gerando ? "Entrando na fila…" : "Gerar assim"}
      </button>
    </div>
  );
}
