"use client";

import { useState, useTransition } from "react";
import type { Midia } from "@/lib/types";
import { videoEmbedUrl, youtubeId } from "@/lib/embedMidia";
import { Clapperboard, ExternalLink, Rotate3d, Trash2 } from "lucide-react";
import { adicionarMidiaExterna, removerMidiaImovel } from "../actions";

/**
 * A "porta de entrada" dos tours 3D e vídeos do YouTube: o corretor cola o
 * link, dá um título e o site público ganha o player/iframe na página do
 * imóvel (seções Vídeos e Tours 360°). Nada é hospedado por nós — só o
 * link validado vai para a tabela `midias`.
 */

type Props = {
  empreendimentoId: string;
  slug: string;
  midiasIniciais: Midia[];
};

function FormularioLink({
  tipo,
  onAdicionado,
  empreendimentoId,
  slug,
}: {
  tipo: "video" | "tour360";
  onAdicionado: (m: Midia) => void;
  empreendimentoId: string;
  slug: string;
}) {
  const [url, setUrl] = useState("");
  const [titulo, setTitulo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const rotulos =
    tipo === "video"
      ? {
          placeholder: "https://www.youtube.com/watch?v=…  (ou youtu.be, Shorts, Vimeo, .mp4)",
          tituloPlaceholder: "Ex.: Tour pelo decorado",
          botao: "Adicionar vídeo",
        }
      : {
          placeholder: "https://my.matterport.com/show/?m=…  (ou Kuula, tour da construtora)",
          tituloPlaceholder: "Ex.: Decorado de 3 suítes",
          botao: "Adicionar tour 3D",
        };

  function enviar() {
    setErro(null);
    if (!url.trim()) {
      setErro("Cole o link primeiro.");
      return;
    }
    iniciar(async () => {
      const res = await adicionarMidiaExterna(empreendimentoId, slug, {
        tipo,
        url,
        titulo,
      });
      if (!res.ok || !res.midia) {
        setErro(res.erro ?? "Não foi possível salvar.");
        return;
      }
      onAdicionado(res.midia);
      setUrl("");
      setTitulo("");
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={rotulos.placeholder}
          className="text-fluid-xs min-w-0 flex-[2] rounded-xl border border-linha-forte bg-campo px-3.5 py-2.5 text-corpo placeholder:text-tenue focus:border-acento focus:outline-none"
        />
        <input
          type="text"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder={rotulos.tituloPlaceholder}
          maxLength={80}
          className="text-fluid-xs min-w-0 flex-1 rounded-xl border border-linha-forte bg-campo px-3.5 py-2.5 text-corpo placeholder:text-tenue focus:border-acento focus:outline-none"
        />
        <button
          type="button"
          onClick={enviar}
          disabled={salvando}
          className="text-fluid-xs shrink-0 cursor-pointer rounded-xl bg-acento px-4 py-2.5 font-bold text-white transition-colors hover:bg-acento-hover disabled:opacity-60"
        >
          {salvando ? "Salvando…" : rotulos.botao}
        </button>
      </div>
      {erro && <p className="text-fluid-xs text-perigo">{erro}</p>}
    </div>
  );
}

function CartaoMidia({ midia, onRemover }: { midia: Midia; onRemover: () => void }) {
  const [removendo, iniciar] = useTransition();
  const ytId = midia.tipo === "video" ? youtubeId(midia.url) : null;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-linha bg-elevado p-3">
      {/* Miniatura: YouTube tem thumbnail pública; o resto ganha um ícone. */}
      {ytId ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura pequena de admin; <Image> exigiria layout fixo
        <img
          src={`https://i.ytimg.com/vi/${ytId}/default.jpg`}
          alt=""
          className="h-12 w-16 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-vidro-forte text-apoio">
          {midia.tipo === "video" ? <Clapperboard className="h-5 w-5" /> : <Rotate3d className="h-5 w-5" />}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="text-fluid-xs truncate font-semibold text-titulo">{midia.alt || "(sem título)"}</p>
        <a
          href={midia.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-fluid-xs inline-flex max-w-full items-center gap-1 truncate text-acento-suave hover:underline"
        >
          <span className="truncate">{midia.url}</span>
          <ExternalLink className="h-3 w-3 shrink-0" />
        </a>
      </div>

      <button
        type="button"
        onClick={() => iniciar(async () => onRemover())}
        disabled={removendo}
        title="Remover"
        aria-label={`Remover ${midia.alt || midia.tipo}`}
        className="shrink-0 cursor-pointer rounded-lg border border-linha p-2 text-apoio transition-colors hover:border-perigo-linha hover:text-perigo disabled:opacity-60"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export function EditorMidiasExternas({ empreendimentoId, slug, midiasIniciais }: Props) {
  const [videos, setVideos] = useState<Midia[]>(midiasIniciais.filter((m) => m.tipo === "video"));
  const [tours, setTours] = useState<Midia[]>(midiasIniciais.filter((m) => m.tipo === "tour360"));

  async function remover(midia: Midia, deTipo: "video" | "tour360") {
    const res = await removerMidiaImovel(midia.id ?? "", midia.url, slug);
    if (!res.ok) return;
    if (deTipo === "video") setVideos((v) => v.filter((m) => m.url !== midia.url));
    else setTours((t) => t.filter((m) => m.url !== midia.url));
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h3 className="text-fluid-base flex items-center gap-2 font-bold text-titulo">
            <Clapperboard className="h-5 w-5 text-acento-suave" /> Vídeos (YouTube / Vimeo)
          </h3>
          <p className="text-fluid-xs mt-1 text-apoio">
            Cole o link do vídeo no YouTube — ele aparece na página do imóvel como player, com a capa
            oficial e sem pesar o carregamento.
          </p>
        </div>
        <FormularioLink
          tipo="video"
          empreendimentoId={empreendimentoId}
          slug={slug}
          onAdicionado={(m) => setVideos((v) => [...v, m])}
        />
        {videos.length > 0 && (
          <div className="space-y-2">
            {videos.map((m) => (
              <CartaoMidia key={m.url} midia={m} onRemover={() => remover(m, "video")} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3 border-t border-linha pt-8">
        <div>
          <h3 className="text-fluid-base flex items-center gap-2 font-bold text-titulo">
            <Rotate3d className="h-5 w-5 text-acento-suave" /> Tours 3D / 360°
          </h3>
          <p className="text-fluid-xs mt-1 text-apoio">
            Cole o link do tour virtual (Matterport, Kuula ou o tour da construtora). O cliente anda
            pelo imóvel direto na página, e há um atalho de tela cheia.
          </p>
        </div>
        <FormularioLink
          tipo="tour360"
          empreendimentoId={empreendimentoId}
          slug={slug}
          onAdicionado={(m) => setTours((t) => [...t, m])}
        />
        {tours.length > 0 && (
          <div className="space-y-2">
            {tours.map((m) => (
              <CartaoMidia key={m.url} midia={m} onRemover={() => remover(m, "tour360")} />
            ))}
          </div>
        )}
      </section>

      {/* Preview real: exatamente o embed que o cliente verá. */}
      {(videos.length > 0 || tours.length > 0) && (
        <section className="border-t border-linha pt-8">
          <h3 className="text-fluid-sm mb-3 font-bold text-titulo">Prévia de como o cliente vê</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {videos[0] && (
              <div className="overflow-hidden rounded-xl border border-linha">
                {videoEmbedUrl(videos[0].url) ? (
                  <iframe
                    src={videoEmbedUrl(videos[0].url)!}
                    title={videos[0].alt}
                    className="aspect-video w-full"
                    allowFullScreen
                    loading="lazy"
                  />
                ) : (
                  <video src={videos[0].url} controls className="aspect-video w-full" />
                )}
              </div>
            )}
            {tours[0] && (
              <div className="overflow-hidden rounded-xl border border-linha">
                <iframe
                  src={tours[0].url}
                  title={tours[0].alt}
                  className="aspect-video w-full"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
