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
import { enviarFotoDeReferencia } from "@/app/corretor/(painel)/estudio/uploadReferencia";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
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

/** Os pedidos que abrem a conversa vazia. Ver o comentário em `ChatDeArte`. */
const SUGESTOES = [
  "Story de lançamento com as fotos do imóvel",
  "Vídeo para o feed, público investidor",
  "Tour rápido do decorado",
] as const;

export function ChatDeVideo({
  corretorId,
  conversasIniciais,
  videosIniciais,
  saldoInicial,
}: {
  corretorId: string;
  conversasIniciais: ConversaDoEstudio[];
  videosIniciais: VideoJob[];
  saldoInicial: { disponiveis: number; cotaMensal: number };
}) {
  const { avisar, falhar } = useAvisos();
  const [conversas, setConversas] = useState(conversasIniciais);
  const [estado, setEstado] = useState<EstadoDoChat | null>(null);
  const [pendente, setPendente] = useState<{ id: string; conteudo: string; previewUrls?: string[] } | null>(null);
  const [anexos, setAnexos] = useState<{ file: File; previewUrl: string }[]>([]);
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
    const fotosDaVez = escolha ? [] : anexos;
    setPendente({
      id: `temp-${Date.now()}`,
      conteudo: texto || "📎 Foto de referência",
      previewUrls: fotosDaVez.map((foto) => foto.previewUrl),
    });
    setPensando(true);
    try {
      // Sobe a foto antes de gravar a mensagem — referência quebrada não entra.
      const referencias: { path: string; url: string }[] = [];
      for (const foto of fotosDaVez) {
        const up = await enviarFotoDeReferencia(corretorId, foto.file);
        if ("erro" in up) {
          falhar(up.erro);
          throw new Error("falhou");
        }
        referencias.push(up);
      }

      const r = await enviarMensagemDoEstudio({
        tipo: "video",
        conversaId: estado?.conversa.id ?? null,
        texto,
        escolha: escolha ?? null,
        referencias,
      });
      if (!aplicar(r)) throw new Error("falhou");
      if (fotosDaVez.length > 0) {
        fotosDaVez.forEach((foto) => URL.revokeObjectURL(foto.previewUrl));
        setAnexos([]);
      }
    } catch (e) {
      if (ehActionDeOutroBuild(e)) falhar(avisoDePaginaVelha());
      else if (!(e instanceof Error && e.message === "falhou")) falhar("Sem conexão. Tente de novo.");
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
    } catch (e) {
      falhar(ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
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
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[14rem_minmax(0,1fr)]">
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
          placeholder="Qual vídeo?"
          sugestoes={SUGESTOES}
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
          anexos={anexos.map((anexo) => ({ previewUrl: anexo.previewUrl, nome: anexo.file.name }))}
          onAnexar={(files) => {
            setAnexos((atuais) => {
              const novos = files.slice(0, Math.max(0, 4 - atuais.length)).map((file) => ({ file, previewUrl: URL.createObjectURL(file) }));
              if (files.length > novos.length) falhar("Você pode usar até 4 fotos como referência.");
              return [...atuais, ...novos];
            });
          }}
          onRemoverAnexo={(indice) => {
            setAnexos((atuais) => {
              const alvo = atuais[indice];
              if (alvo) URL.revokeObjectURL(alvo.previewUrl);
              return atuais.filter((_, i) => i !== indice);
            });
          }}
          renderAcima={(m) =>
            m.dados?.tipo === "referencia" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.dados.url}
                alt="Foto de referência anexada"
                className="border-linha mb-1.5 max-h-44 w-auto max-w-full rounded-lg border"
              />
            ) : null
          }
          renderAbaixo={(m) => {
            if (m.dados?.tipo === "proposta") {
              return (
                <CartaoDeRoteiro
                  proposta={m.dados as PropostaDeVideo}
                  gerando={gerando === m.id}
                  bloqueada={Boolean(gerando) || saldo.disponiveis <= 0}
                  onGerar={() => void gerar(m)}
                />
              );
            }
            if (m.dados?.tipo !== "resultado") return null;
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
