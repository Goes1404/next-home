"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { CANAIS, OBJETIVOS, type ChaveCanal, type ChaveObjetivo } from "@/lib/imagens/marketing";
import { ROTULO_STATUS, type VideoJob } from "@/lib/video/videoTipos";
import { createClient } from "@/lib/supabase/client";
import { STATUS_LABEL, type StatusObra } from "@/lib/types";
import { criarVideo, statusDosVideos, verRoteiro, type PedidoDeVideo, type Roteiro } from "./acoes";

/**
 * O estúdio: escolher → ver o roteiro → criar → acompanhar.
 *
 * ## O roteiro aparece ANTES do gasto
 *
 * É a peça central da tela. O corretor vê quais fotos entram, em que ordem,
 * com que movimento e por quanto tempo — e só então decide. Sem isso, criar
 * vídeo seria apostar um crédito num resultado invisível.
 *
 * ## A tela se atualiza sozinha só enquanto precisa
 *
 * O polling liga quando há vídeo em andamento e DESLIGA quando não há. Timer
 * que roda para sempre numa tela aberta o dia inteiro é bateria e consulta ao
 * banco por nada — e este projeto já tem a régua de não deixar a tela mais
 * aberta do painel pagar por informação que ninguém está esperando.
 */

const INTERVALO_MS = 6000;
const BUCKET = "empreendimentos";
const TETO_FOTO_BYTES = 15 * 1024 * 1024;
const MAX_FOTOS = 10;

export type ImovelDoEstudio = {
  slug: string;
  nome: string;
  lugar: string;
  estagio: string;
  fotos: number;
};

const chip = (ativo: boolean) =>
  `text-fluid-xs min-h-11 cursor-pointer rounded-full border px-3.5 transition-colors disabled:opacity-50 ${
    ativo
      ? "border-acento-linha bg-acento text-sobre-cor font-medium"
      : "border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo"
  }`;

export function EstudioDeVideo({
  corretorId,
  imoveis,
  iniciais,
  saldoInicial,
}: {
  corretorId: string;
  imoveis: ImovelDoEstudio[];
  iniciais: VideoJob[];
  saldoInicial: { disponiveis: number; cotaMensal: number };
}) {
  /*
   * Duas fontes de foto. O catálogo é o caminho rico — traz `alt` descrito por
   * visão e a ficha inteira. "Minhas fotos" é o caminho que funciona para
   * imóvel que não está cadastrado aqui, e é o que o produto precisa para
   * atender imobiliária de fora. Quando não há catálogo, ele nem aparece.
   */
  const [fonte, setFonte] = useState<"catalogo" | "minhas">(
    imoveis.length > 0 ? "catalogo" : "minhas",
  );
  const [fotos, setFotos] = useState<string[]>([]);
  const [subindo, setSubindo] = useState(false);
  const [nome, setNome] = useState("");
  const [lugar, setLugar] = useState("");
  const [estagio, setEstagio] = useState<StatusObra>("lancamento");
  const [slug, setSlug] = useState(imoveis[0]?.slug ?? "");
  const [objetivo, setObjetivo] = useState<ChaveObjetivo>("lancamento");
  const [canal, setCanal] = useState<ChaveCanal>("story");
  const [roteiro, setRoteiro] = useState<Roteiro | null>(null);
  const [vendo, setVendo] = useState(false);
  const [videos, setVideos] = useState(iniciais);
  const [saldo, setSaldo] = useState(saldoInicial);
  const [, iniciar] = useTransition();
  const [criando, setCriando] = useState(false);
  const { avisar, falhar } = useAvisos();

  const imovel = imoveis.find((i) => i.slug === slug) ?? null;

  const pedido: PedidoDeVideo =
    fonte === "catalogo"
      ? { fonte: "catalogo", slug, objetivo, canal }
      : { fonte: "minhas", fotos: fotos.map((url) => ({ url })), nome, lugar, estagio, objetivo, canal };

  const prontoParaMontar =
    fonte === "catalogo" ? Boolean(slug) : fotos.length >= 3 && nome.trim().length > 0;
  const emAndamento = videos.some((v) => v.status === "pendente" || v.status === "renderizando");
  const podeCriar = Boolean(roteiro) && roteiro?.problemas.length === 0 && saldo.disponiveis > 0 && !criando;

  // Trocar qualquer escolha invalida o roteiro: ele foi montado para outra peça.
  function escolher<T>(setar: (v: T) => void) {
    return (v: T) => {
      setar(v);
      setRoteiro(null);
    };
  }

  /*
   * `useCallback` com dependência vazia porque só usa setters, que são
   * estáveis. A primeira versão atribuía a um `ref` durante o render — o lint
   * pegou (`react-hooks/refs`), e com razão: além de ser render impuro, a
   * versão com ref não tinha guarda de desmontagem e chamava `setState` numa
   * tela que já saiu.
   */
  const atualizar = useCallback(
    (vivo: () => boolean = () => true) => {
      iniciar(async () => {
        try {
          const r = await statusDosVideos();
          if (!vivo()) return;
          setVideos(r.videos);
          setSaldo(r.saldo);
        } catch {
          /* falha de rede não vira aviso: o próximo tique tenta */
        }
      });
    },
    [iniciar],
  );

  useEffect(() => {
    // Liga só enquanto há vídeo em andamento e desliga quando não há. Timer
    // eterno numa tela aberta o dia inteiro é bateria e consulta por nada.
    if (!emAndamento) return;
    let montado = true;
    const id = setInterval(() => atualizar(() => montado), INTERVALO_MS);
    return () => {
      montado = false;
      clearInterval(id);
    };
  }, [emAndamento, atualizar]);

  async function subirFotos(arquivos: FileList) {
    const cabem = MAX_FOTOS - fotos.length;
    if (cabem <= 0) {
      falhar(`São no máximo ${MAX_FOTOS} fotos.`);
      return;
    }
    setSubindo(true);
    try {
      const supabase = createClient();
      const novas: string[] = [];
      for (const arquivo of Array.from(arquivos).slice(0, cabem)) {
        if (arquivo.size > TETO_FOTO_BYTES) {
          falhar(`"${arquivo.name}" passa de 15 MB.`);
          continue;
        }
        const ext = arquivo.name.split(".").pop()?.toLowerCase() || "jpg";
        // Nome aleatório: o bucket é público, então a URL é o segredo. Mesma
        // razão do UUID no PDF de staging da importação.
        const caminho = `corretores/${corretorId}/video-fotos/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(caminho, arquivo, { contentType: arquivo.type || "image/jpeg", upsert: true });
        if (error) {
          falhar(`Não deu para enviar "${arquivo.name}".`);
          continue;
        }
        novas.push(supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl);
      }
      if (novas.length > 0) {
        setFotos((atuais) => [...atuais, ...novas]);
        setRoteiro(null);
      }
    } finally {
      setSubindo(false);
    }
  }

  async function ver() {
    if (!prontoParaMontar || vendo) return;
    setVendo(true);
    try {
      const r = await verRoteiro(pedido);
      if (r.erro || !r.roteiro) {
        falhar(r.erro ?? "Não deu para montar o roteiro.");
        return;
      }
      setRoteiro(r.roteiro);
    } catch {
      falhar("Não deu para montar o roteiro. Confira a conexão.");
    } finally {
      setVendo(false);
    }
  }

  async function criar() {
    if (!podeCriar) return;
    setCriando(true);
    try {
      const r = await criarVideo(pedido);
      if (r.erro) {
        falhar(r.erro);
        return;
      }
      avisar("Na fila. O vídeo aparece aqui quando ficar pronto.");
      setRoteiro(null);
      atualizar();
    } catch {
      falhar("Não deu para entrar na fila. Confira a conexão.");
    } finally {
      setCriando(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="border-linha bg-superficie shadow-painel min-w-0 space-y-4 rounded-2xl border p-4 sm:p-5">
        {imoveis.length > 0 && (
          <div role="tablist" className="flex gap-2">
            {(
              [
                ["catalogo", "Imóvel do catálogo"],
                ["minhas", "Minhas fotos"],
              ] as const
            ).map(([chave, rotulo]) => (
              <button
                key={chave}
                role="tab"
                type="button"
                aria-selected={fonte === chave}
                disabled={criando}
                onClick={() => {
                  setFonte(chave);
                  setRoteiro(null);
                }}
                className={chip(fonte === chave)}
              >
                {rotulo}
              </button>
            ))}
          </div>
        )}

        {fonte === "catalogo" ? (
          <label className="block space-y-1.5">
            <span className="text-fluid-xs text-apoio">Imóvel</span>
            <select
              value={slug}
              disabled={criando}
              onChange={(e) => escolher(setSlug)(e.target.value)}
              className="text-fluid-sm border-linha-forte bg-campo text-corpo focus:border-acento-linha min-h-11 w-full cursor-pointer rounded-xl border px-3 outline-none transition-colors"
            >
              {imoveis.map((i) => (
                <option key={i.slug} value={i.slug}>
                  {i.nome} · {i.lugar} · {i.fotos} fotos
                </option>
              ))}
            </select>
            {imovel && <span className="text-fluid-xs text-tenue">{imovel.estagio}</span>}
          </label>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <span className="text-fluid-xs text-apoio">
                Fotos {fotos.length > 0 && `· ${fotos.length} de ${MAX_FOTOS}`}
              </span>
              {fotos.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {fotos.map((url, i) => (
                    <li key={url} className="relative">
                      <Image
                        src={url}
                        alt=""
                        width={72}
                        height={72}
                        unoptimized
                        className="border-linha size-[72px] rounded-lg border object-cover"
                      />
                      <button
                        type="button"
                        aria-label={`Tirar a foto ${i + 1}`}
                        onClick={() => {
                          setFotos((f) => f.filter((u) => u !== url));
                          setRoteiro(null);
                        }}
                        className="bg-fundo/85 text-corpo hover:text-perigo border-linha absolute -top-1.5 -right-1.5 flex size-6 cursor-pointer items-center justify-center rounded-full border text-xs leading-none"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="border-linha-forte text-corpo hover:border-acento-linha inline-flex min-h-11 cursor-pointer items-center rounded-xl border px-3.5 text-fluid-sm transition-colors">
                {subindo ? "Enviando…" : fotos.length > 0 ? "Adicionar mais" : "Escolher fotos"}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={subindo || criando}
                  onChange={(e) => {
                    if (e.target.files?.length) void subirFotos(e.target.files);
                    e.target.value = "";
                  }}
                  className="sr-only"
                />
              </label>
              <p className="text-fluid-xs text-tenue">
                A ordem não importa: o sistema reconhece o que é fachada, ambiente
                interno, lazer e implantação, e dá o movimento de câmera certo a
                cada um.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-fluid-xs text-apoio">Nome do imóvel</span>
                <input
                  value={nome}
                  disabled={criando}
                  onChange={(e) => escolher(setNome)(e.target.value)}
                  placeholder="ex.: Residencial Alphaville"
                  className="text-fluid-sm border-linha-forte bg-campo text-corpo placeholder:text-tenue focus:border-acento-linha min-h-11 w-full rounded-xl border px-3 outline-none transition-colors"
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-fluid-xs text-apoio">Bairro e cidade</span>
                <input
                  value={lugar}
                  disabled={criando}
                  onChange={(e) => escolher(setLugar)(e.target.value)}
                  placeholder="ex.: Alphaville, Barueri"
                  className="text-fluid-sm border-linha-forte bg-campo text-corpo placeholder:text-tenue focus:border-acento-linha min-h-11 w-full rounded-xl border px-3 outline-none transition-colors"
                />
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-fluid-xs text-apoio">Estágio da obra</span>
              <select
                value={estagio}
                disabled={criando}
                onChange={(e) => escolher(setEstagio)(e.target.value as StatusObra)}
                className="text-fluid-sm border-linha-forte bg-campo text-corpo focus:border-acento-linha min-h-11 w-full cursor-pointer rounded-xl border px-3 outline-none transition-colors"
              >
                {Object.entries(STATUS_LABEL).map(([chave, rotulo]) => (
                  <option key={chave} value={chave}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </label>

            {fotos.length > 0 && fotos.length < 3 && (
              <p className="text-fluid-xs text-alerta">
                Faltam {3 - fotos.length} foto{3 - fotos.length > 1 ? "s" : ""}: com menos de
                três planos não sai vídeo, sai slideshow — e gastaria um crédito do mesmo jeito.
              </p>
            )}
          </div>
        )}

        <fieldset className="space-y-1.5">
          <legend className="text-fluid-xs text-apoio mb-1.5">Objetivo</legend>
          <div className="flex flex-wrap gap-2">
            {OBJETIVOS.map((o) => (
              <button
                key={o.chave}
                type="button"
                aria-pressed={o.chave === objetivo}
                disabled={criando}
                onClick={() => escolher(setObjetivo)(o.chave)}
                className={chip(o.chave === objetivo)}
              >
                {o.rotulo}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-1.5">
          <legend className="text-fluid-xs text-apoio mb-1.5">Onde vai ser postado</legend>
          <div className="flex flex-wrap gap-2">
            {CANAIS.map((c) => (
              <button
                key={c.chave}
                type="button"
                aria-pressed={c.chave === canal}
                disabled={criando}
                onClick={() => escolher(setCanal)(c.chave)}
                className={chip(c.chave === canal)}
              >
                {c.rotulo} · {c.arte.largura}×{c.arte.altura}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void ver()}
            disabled={vendo || criando || !prontoParaMontar}
            aria-busy={vendo}
            className={`text-fluid-sm min-h-12 cursor-pointer rounded-xl px-4 font-medium transition-colors disabled:cursor-wait disabled:opacity-60 ${
              roteiro
                ? "border-linha-forte text-corpo hover:border-acento-linha border"
                : "bg-acento text-sobre-cor hover:bg-acento-hover"
            }`}
          >
            {vendo ? "Montando…" : roteiro ? "Montar de novo" : "Ver o roteiro"}
          </button>
          <span className="text-fluid-xs text-tenue">Não gasta vídeo do seu limite.</span>
        </div>
      </section>

      {roteiro && (
        <section className="border-linha bg-superficie shadow-painel min-w-0 space-y-4 rounded-2xl border p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-titulo text-fluid-base">O roteiro</h2>
            <p className="text-fluid-xs text-tenue tabular-nums">
              {roteiro.planos.length} planos · {roteiro.duracaoS}s · {roteiro.canalRotulo}{" "}
              {roteiro.largura}×{roteiro.altura}
            </p>
          </div>

          <ol className="space-y-2">
            {roteiro.planos.map((p, i) => (
              <li key={`${p.url}-${i}`} className="flex min-w-0 items-center gap-3">
                <span className="text-fluid-xs text-tenue w-4 shrink-0 text-right tabular-nums">
                  {i + 1}
                </span>
                <Image
                  src={p.url}
                  alt=""
                  width={88}
                  height={50}
                  unoptimized
                  className="border-linha h-[50px] w-[88px] shrink-0 rounded-lg border object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-fluid-xs text-corpo truncate">
                    {p.legenda || p.rotuloTipo}
                  </p>
                  <p className="text-fluid-xs text-tenue truncate">
                    <span className="text-acento-suave font-medium uppercase">{p.movimento}</span>{" "}
                    · {p.ajuda}
                  </p>
                </div>
                <span className="text-fluid-xs text-tenue shrink-0 tabular-nums">{p.duracao}s</span>
              </li>
            ))}
          </ol>

          <div className="border-linha space-y-1 border-t pt-3">
            <p className="text-fluid-sm text-titulo font-medium">{roteiro.copy.titulo}</p>
            <p className="text-fluid-xs text-apoio">{roteiro.copy.apoio}</p>
            <p className="text-fluid-xs text-acento-suave">{roteiro.copy.cta}</p>
          </div>

          {roteiro.problemas.length > 0 && (
            <p className="text-fluid-xs text-alerta">
              A copy não pode ir assim: {roteiro.problemas.join("; ")}.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void criar()}
              disabled={!podeCriar}
              aria-busy={criando}
              className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm min-h-12 flex-1 cursor-pointer rounded-xl px-4 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
            >
              {criando ? "Entrando na fila…" : "Criar vídeo"}
            </button>
            <span className="text-fluid-xs text-tenue tabular-nums">
              {saldo.disponiveis > 0
                ? `${saldo.disponiveis} de ${saldo.cotaMensal} este mês`
                : "Seus vídeos do mês acabaram"}
            </span>
          </div>

          <p className="text-fluid-xs text-apoio border-linha border-t pt-3">
            O vídeo sai <strong className="text-corpo">mudo</strong>, de propósito: a maioria
            assiste sem som, e o áudio em alta do próprio Instagram rende mais alcance que trilha
            embutida. A mensagem vai na legenda queimada.
          </p>
        </section>
      )}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-display text-titulo text-fluid-base">Seus vídeos</h2>
          {emAndamento && (
            <span className="text-fluid-xs text-tenue">Atualizando sozinho…</span>
          )}
        </div>

        {videos.length === 0 ? (
          <p className="text-fluid-sm text-apoio border-linha bg-superficie rounded-2xl border p-6 text-center">
            Nenhum vídeo ainda. Escolha um imóvel acima e veja o roteiro — é de graça.
          </p>
        ) : (
          <ul className="space-y-2">
            {videos.map((v) => (
              <li
                key={v.id}
                className="border-linha bg-superficie flex min-w-0 flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:gap-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-fluid-sm text-titulo truncate">
                    {v.titulo ?? v.empreendimentoNome ?? "Vídeo"}
                  </p>
                  <p className="text-fluid-xs text-tenue truncate">
                    <Selo status={v.status} />
                    {v.duracaoS ? ` · ${v.duracaoS}s` : ""}
                    {v.erroMotivo ? ` · ${v.erroMotivo}` : ""}
                  </p>
                </div>
                {v.url && (
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-fluid-xs bg-acento text-sobre-cor hover:bg-acento-hover inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg px-3.5 font-medium transition-colors"
                  >
                    Baixar
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** O estado, em cor: só o que exige atenção sai do cinza. */
function Selo({ status }: { status: VideoJob["status"] }) {
  const cor =
    status === "pronto"
      ? "text-acento-suave"
      : status === "erro"
        ? "text-perigo"
        : status === "renderizando"
          ? "text-alerta"
          : "text-tenue";
  return <span className={cor}>{ROTULO_STATUS[status]}</span>;
}
