import Image from "next/image";
import Link from "next/link";

/**
 * O corpo da oficina: quatro ferramentas, cada uma com o estado dela à vista.
 *
 * ## Cartão de ferramenta não é cartão de menu
 *
 * A diferença é o NÚMERO. "Arte" sozinho é um link; "Arte · 12 feitas, 8
 * restam hoje" diz se vale abrir agora. Este projeto já aprendeu que contador
 * que vive em zero ensina a ignorar o contador — então o número só aparece
 * quando existe, e quando ele é zero a linha vira convite, não relatório.
 *
 * ## A hierarquia é de uso, não de importância
 *
 * Arte vem primeiro porque é o que se faz todo dia e é o que já está no ar.
 * Carrossel e Links vêm depois porque são de vez em quando. Campanha fecha
 * porque é o passo seguinte à peça pronta, não o começo.
 *
 * Componente de SERVIDOR: não há estado nem interação aqui, só navegação. Um
 * `"use client"` aqui arrastaria a tela inteira para o cliente por nada.
 */

type Arte = { id: string; url: string; titulo: string };
type ImovelCurto = { slug: string; nome: string; lugar: string };

export function OficinaDeMarketing({
  artesFeitas,
  artesHoje,
  ultimasArtes,
  imoveisProntos,
  imoveisTotal,
  linkDeIndicacao,
  temSlug,
  imoveisParaCarrossel,
  videosDisponiveis,
  videosNoMes,
}: {
  artesFeitas: number;
  artesHoje: { usadas: number; teto: number };
  ultimasArtes: Arte[];
  imoveisProntos: number;
  imoveisTotal: number;
  linkDeIndicacao: string;
  temSlug: boolean;
  imoveisParaCarrossel: ImovelCurto[];
  videosDisponiveis: number;
  videosNoMes: number;
}) {
  const restamHoje = Math.max(0, artesHoje.teto - artesHoje.usadas);

  return (
    <div className="space-y-5">
      {/* ---- A ferramenta principal, com o trabalho recente à vista ---- */}
      <section className="cartao overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="bg-acento-lavado text-acento flex size-9 shrink-0 items-center justify-center rounded-xl">
                <IconePincel />
              </span>
              <h2 className="font-display text-titulo text-fluid-lg">Criar arte</h2>
            </div>
            <p className="text-fluid-sm text-apoio max-w-md text-pretty">
              Post, story ou anúncio montado da ficha real do imóvel — com a sua
              marca, a chamada certa e a ressalva de imagem ilustrativa.
            </p>
            <p className="text-fluid-xs text-tenue tabular-nums">
              {artesFeitas > 0 ? `${artesFeitas} já criadas · ` : ""}
              {restamHoje > 0
                ? `${restamHoje} de ${artesHoje.teto} disponíveis hoje`
                : "Limite de hoje atingido"}
            </p>
          </div>
          <Link
            href="/corretor/imoveis/criar-imagem"
            className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm inline-flex min-h-12 w-full items-center justify-center rounded-xl px-5 font-medium transition-colors sm:w-auto"
          >
            Criar arte
          </Link>
        </div>

        {ultimasArtes.length > 0 && (
          <div className="border-linha bg-fundo/40 border-t px-5 py-4 sm:px-6">
            <p className="text-fluid-xs text-tenue mb-2.5">Suas últimas</p>
            <ul className="grid grid-cols-4 gap-2.5 sm:max-w-md">
              {ultimasArtes.map((a) => (
                <li key={a.id}>
                  <a href={a.url} target="_blank" rel="noreferrer" className="block">
                    <Image
                      src={a.url}
                      alt={a.titulo}
                      width={200}
                      height={200}
                      unoptimized
                      className="border-linha aspect-square w-full rounded-lg border object-cover transition-opacity hover:opacity-85"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---- A segunda de produção, ainda sem histórico próprio ---- */}
      <section className="cartao min-w-0 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="bg-acento-lavado text-acento flex size-9 shrink-0 items-center justify-center rounded-xl">
                <IconePlay />
              </span>
              <h2 className="font-display text-titulo text-fluid-lg">Criar vídeo</h2>
            </div>
            <p className="text-fluid-sm text-apoio max-w-md text-pretty">
              Um Reel montado das fotos do imóvel, com movimento de câmera por
              tipo de plano e legenda queimada. Sai mudo, para você pôr o áudio
              em alta do Instagram na hora de postar.
            </p>
            <p className="text-fluid-xs text-tenue tabular-nums">
              {videosDisponiveis > 0
                ? `${videosDisponiveis} de ${videosNoMes} disponíveis este mês`
                : "Seus vídeos do mês acabaram"}
            </p>
          </div>
          <Link
            href="/corretor/marketing/video"
            className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm inline-flex min-h-12 w-full items-center justify-center rounded-xl px-5 font-medium transition-colors sm:w-auto"
          >
            Criar vídeo
          </Link>
        </div>
      </section>

      {/* ---- As de vez em quando ---- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Ferramenta
          icone={<IconeCarrossel />}
          titulo="Carrossel do Instagram"
          descricao="Os slides e a legenda de um post, montados das fotos e da ficha."
          nota={
            imoveisProntos > 0
              ? `${imoveisProntos} de ${imoveisTotal} imóveis prontos`
              : "Nenhum imóvel com foto ainda"
          }
        >
          {imoveisParaCarrossel.length > 0 ? (
            <ul className="space-y-1">
              {imoveisParaCarrossel.slice(0, 3).map((i) => (
                <li key={i.slug}>
                  <Link
                    href={`/corretor/imoveis/${i.slug}/carrossel`}
                    /*
                     * `min-w-0` no item de flex, e o lugar EMPILHA no celular.
                     * Sem os dois, "Centro Comercial Jubran, Barueri" com
                     * `shrink-0` empurrava o cartão para 434px num viewport de
                     * 390 — item de flex tem `min-width: auto`, então texto
                     * que não quebra transborda em vez de espremer. É a mesma
                     * armadilha da barra de seleção em lote, e ela só apareceu
                     * medindo `scrollWidth` contra `clientWidth`.
                     */
                    className="text-fluid-xs text-corpo hover:text-titulo hover:bg-fundo/60 -mx-2 flex min-h-11 min-w-0 flex-col justify-center gap-0.5 rounded-lg px-2 py-1.5 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                  >
                    <span className="truncate">{i.nome}</span>
                    <span className="text-tenue truncate sm:shrink-0">{i.lugar}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-fluid-xs text-tenue">
              Cadastre uma foto num imóvel para montar o carrossel dele.
            </p>
          )}
        </Ferramenta>

        <Ferramenta
          icone={<IconeElo />}
          titulo="Seu link de indicação"
          descricao="Todo cliente que chega por ele fica vinculado a você por 30 dias."
          nota={temSlug ? "Ativo" : "Falta o seu link pessoal"}
        >
          {temSlug ? (
            <>
              <code className="text-fluid-xs text-corpo bg-fundo/60 border-linha block truncate rounded-lg border px-2.5 py-2">
                {linkDeIndicacao}
              </code>
              <Link
                href="/corretor/links"
                className="text-fluid-xs text-acento-suave hover:text-titulo mt-2 inline-flex min-h-11 items-center underline underline-offset-4"
              >
                Links por imóvel
              </Link>
            </>
          ) : (
            <p className="text-fluid-xs text-alerta">
              Sua conta ainda não tem link pessoal, então o cliente que chegar
              pelo site não fica vinculado a você. Peça a quem administra.
            </p>
          )}
        </Ferramenta>
      </div>

      {/* ---- O passo seguinte à peça pronta ---- */}
      <section className="cartao p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="bg-acento-lavado text-acento flex size-9 shrink-0 items-center justify-center rounded-xl">
                <IconeMegafone />
              </span>
              <h2 className="font-display text-titulo text-fluid-lg">Disparar campanha</h2>
            </div>
            <p className="text-fluid-sm text-apoio max-w-md text-pretty">
              Levar a peça para a sua lista no WhatsApp, com o espaçamento que
              protege o seu número.
            </p>
          </div>
          <Link
            href="/corretor/campanhas"
            className="border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo text-fluid-sm inline-flex min-h-12 w-full items-center justify-center rounded-xl border px-5 transition-colors sm:w-auto"
          >
            Abrir campanhas
          </Link>
        </div>
      </section>
    </div>
  );
}

/** O cartão das ferramentas de uso ocasional — mesma anatomia nas duas. */
function Ferramenta({
  icone,
  titulo,
  descricao,
  nota,
  children,
}: {
  icone: React.ReactNode;
  titulo: string;
  descricao: string;
  nota: string;
  children: React.ReactNode;
}) {
  return (
    /*
     * `min-w-0` no ITEM DO GRID, e é aqui que estava o vazamento de verdade.
     * Item de grid tem `min-width: auto` igual a item de flex: a URL longa e
     * sem espaços dentro do `<code>` define o min-content da coluna e empurra
     * o cartão para 434px num viewport de 390 — mesmo com `truncate`, que só
     * age depois que a largura está decidida. Medido com scrollWidth contra
     * clientWidth; a olho o cartão parecia normal.
     */
    <section className="cartao flex min-w-0 flex-col gap-3 p-5">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2.5">
          <span className="bg-acento-lavado text-acento flex size-8 shrink-0 items-center justify-center rounded-lg">
            {icone}
          </span>
          <h2 className="font-display text-titulo text-fluid-base">{titulo}</h2>
        </div>
        <p className="text-fluid-xs text-apoio text-pretty">{descricao}</p>
        <p className="text-fluid-xs text-tenue tabular-nums">{nota}</p>
      </div>
      <div className="border-linha border-t pt-3">{children}</div>
    </section>
  );
}

const traco = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function IconePincel() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" {...traco}>
      <path d="M14.5 4.5 19.5 9.5 9 20a3 3 0 0 1-4.2 0l-.8-.8a3 3 0 0 1 0-4.2Z" />
      <path d="m13 6 5 5" />
      <path d="M16.5 2.5a2.1 2.1 0 0 1 3 3L18 7 17 6Z" />
    </svg>
  );
}

function IconeCarrossel() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true" {...traco}>
      <rect x="7" y="5" width="10" height="14" rx="2" />
      <path d="M4 8v8M20 8v8" />
    </svg>
  );
}

function IconeElo() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" aria-hidden="true" {...traco}>
      <path d="M10 13.5a4 4 0 0 0 5.7.4l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.5 1.5" />
      <path d="M14 10.5a4 4 0 0 0-5.7-.4l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.5-1.5" />
    </svg>
  );
}

function IconePlay() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" {...traco}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m11 10 3.5 2-3.5 2Z" />
    </svg>
  );
}

function IconeMegafone() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true" {...traco}>
      <path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1Z" />
      <path d="M17 9a4 4 0 0 1 0 6" />
    </svg>
  );
}
