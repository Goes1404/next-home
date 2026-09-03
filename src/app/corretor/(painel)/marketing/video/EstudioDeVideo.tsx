"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { CANAIS, OBJETIVOS, type ChaveCanal, type ChaveObjetivo } from "@/lib/imagens/marketing";
import { ROTULO_STATUS, type VideoJob } from "@/lib/video/videoTipos";
import { criarVideo, statusDosVideos, verRoteiro, type Roteiro } from "./acoes";

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
  imoveis,
  iniciais,
  saldoInicial,
}: {
  imoveis: ImovelDoEstudio[];
  iniciais: VideoJob[];
  saldoInicial: { disponiveis: number; cotaMensal: number };
}) {
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

  async function ver() {
    if (!slug || vendo) return;
    setVendo(true);
    try {
      const r = await verRoteiro(slug, objetivo, canal);
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
      const r = await criarVideo(slug, objetivo, canal);
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
            disabled={vendo || criando}
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
