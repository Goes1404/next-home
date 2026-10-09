"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  destinoAtivo,
  ehPasta,
  gruposVisiveis,
  moduloDoTopico,
  subitemAtivo,
  type GrupoNav,
  type ItemNav,
  type SubItemNav,
} from "./_componentes/navegacao";
import { useContadoresDoMenu, type MarcaDoMenu as Marca } from "./_componentes/contadoresDoMenu";
import { MarcaDoMenu, temPendencia } from "./_componentes/MarcaDoMenu";
import { CarregandoLink } from "./_componentes/CarregandoLink";
import { gravarMenuRecolhido } from "./_componentes/menuLateral";

/**
 * Barra lateral do painel (desktop).
 *
 * Substitui a fileira de treze pílulas que rolava na horizontal: a partir da
 * sétima aba o destino ficava fora da tela sem nenhum sinal de que existia,
 * e "Equipe" — a última — era invisível para o gestor que nunca arrastou a
 * barra. Empilhado e agrupado, o painel inteiro cabe de uma vez.
 *
 * ## Os subtópicos só aparecem sob o destino ABERTO
 *
 * Abrir todos de uma vez devolveria a lista de treze que esta barra veio
 * desfazer — só que na vertical. Aberto um por vez, o menu continua cabendo
 * numa olhada e a hierarquia aparece onde ela importa: onde a pessoa está.
 *
 * Quem decide o destino aberto é `destinoAtivo`, e não `itemAtivo`: com
 * subtópicos passou a haver rota em que dois itens acendem
 * (`/corretor/imoveis/criar-imagem` é subtópico de Marketing e casa por
 * prefixo com Imóveis), e dois itens acesos não dizem onde a pessoa está.
 *
 * ## Rolagem própria (09/10/2026)
 *
 * A lateral é grudenta, e até aqui não tinha altura máxima. Com uma pasta
 * longa aberta (Financeiro e Administração têm nove subtópicos para o
 * gestor), ela passava da altura da janela, e o que ficava abaixo da dobra
 * só aparecia no FIM da página: rolar para baixo não descia o menu, porque
 * grudenta é justamente o que não se mexe. Hoje ela cabe na janela e rola
 * sozinha, com um esmaecido na borda que diz "tem mais menu para lá".
 *
 * ## Recolhida (09/10/2026)
 *
 * O botão no pé recolhe a lateral num trilho só de ícones, para a tela de
 * trabalho (funil, listas, tabelas) ganhar a largura. A escolha vai num
 * cookie (`menuLateral.ts`) e o layout a lê: a lateral nasce do jeito
 * escolhido, sem abrir e fechar na frente da pessoa a cada recarga.
 *
 * No trilho nada fica a dois cliques: o tópico simples continua sendo o
 * link, e a pasta mostra os subtópicos num cartão ao lado, ao passar o mouse
 * ou ao tocar. Sem o cartão, recolher a lateral esconderia o Funil, as
 * Visitas e tudo o mais que só existe no menu desde que a caixa de abas saiu
 * das telas (29/09/2026).
 */
export function NavPainel({ ehGestor, recolhidoInicial }: { ehGestor: boolean; recolhidoInicial: boolean }) {
  const atual = usePathname();
  const grupos = gruposVisiveis(ehGestor);
  const dono = destinoAtivo(atual);
  const marcas = useContadoresDoMenu();
  const [recolhido, setRecolhido] = useState(recolhidoInicial);
  const cartao = useCartaoDoTrilho(atual);

  // Pasta aberta à mão nesta rota; ao navegar, volta a ser a da rota nova.
  const [manual, setManual] = useState<{ rota: string | null; href: string | null } | null>(null);
  const expandido = manual && manual.rota === atual ? manual.href : (dono?.href ?? null);

  const rolagem = useRef<HTMLDivElement>(null);
  // O que a rolagem própria deve trazer à vista depois de desenhar: o item
  // da tela atual (ao chegar) ou a pasta que a pessoa acabou de abrir.
  const revelar = useRef<"ativo" | "pasta">("ativo");

  const alternar = (href: string) => {
    revelar.current = "pasta";
    setManual({ rota: atual, href: expandido === href ? null : href });
  };

  const alternarRecolhido = () => {
    const novo = !recolhido;
    cartao.fechar();
    setRecolhido(novo);
    gravarMenuRecolhido(novo);
  };

  useEffect(() => {
    const caixa = rolagem.current;
    if (!caixa) return;
    const motivo = revelar.current;
    revelar.current = "ativo";
    if (motivo === "pasta") {
      // Fechar uma pasta não pede rolagem nenhuma.
      if (!expandido) return;
      const pasta = caixa.querySelector<HTMLElement>(`[data-pasta="${expandido}"]`);
      if (pasta) mostrarDentro(caixa, pasta, true);
      return;
    }
    const alvo = caixa.querySelector<HTMLElement>('[aria-current="page"]');
    if (alvo) mostrarDentro(caixa, alvo, false);
  }, [atual, expandido, recolhido]);

  return (
    <nav
      aria-label="Seções do painel"
      data-recolhido={recolhido ? "sim" : "nao"}
      className={cn(
        // A largura é da própria lateral, e a coluna da grade é `auto`: é ela
        // que diz à grade quanto ocupa, aberta ou recolhida.
        "hidden transition-[width] duration-200 ease-out motion-reduce:transition-none md:block",
        recolhido ? "md:w-16" : "md:w-60",
      )}
    >
      {/* Desconta a altura do cabeçalho grudente (`--painel-header-h`): com
          `top-6` os primeiros itens escorregavam por baixo dele ao rolar. A
          altura máxima desconta o mesmo, mais a folga de cima e a de baixo.
          `z-30` é a camada dos grudentos (ver globals.css): sem ela, o cartão
          do trilho saía POR BAIXO dos cartões da tela, que vêm depois na
          árvore — medido em 09/10/2026, o mouse "entrava" no cartão e caía
          num lead. */}
      <div
        data-trilho
        className="sticky top-[calc(var(--painel-header-h)+1.5rem)] z-30 flex max-h-[calc(100svh-var(--painel-header-h)-3rem)] flex-col"
      >
        {/* `-mx-1.5 px-1.5`: o contorno de foco passa 5px da borda do item, e
            uma caixa com rolagem corta o que sai dela. O esmaecido das bordas
            só existe aberta: a máscara recortaria o cartão do trilho, que é
            `fixed` mas continua sendo pintado dentro desta caixa. */}
        <div
          ref={rolagem}
          className={cn(
            "lateral-rolagem -mx-1.5 min-h-0 flex-1 overflow-y-auto px-1.5 py-1.5",
            !recolhido && "lateral-rolagem-esmaece",
          )}
        >
          {recolhido ? (
            <Trilho grupos={grupos} atual={atual} dono={dono} marcas={marcas} cartao={cartao} />
          ) : (
            <ListaAberta
              grupos={grupos}
              atual={atual}
              dono={dono}
              marcas={marcas}
              expandido={expandido}
              aoAlternar={alternar}
            />
          )}
        </div>

        <div className="border-linha mt-2 shrink-0 border-t pt-2">
          {recolhido ? (
            <div {...cartao.gatilho("expandir", "rotulo")} className="relative">
              <button
                type="button"
                onClick={alternarRecolhido}
                aria-label="Expandir menu"
                className="text-apoio hover:bg-vidro hover:text-titulo mx-auto grid h-11 w-11 cursor-pointer place-items-center rounded-xl transition-colors"
              >
                <IconeLateral className="h-[18px] w-[18px]" />
              </button>
              {cartao.aberto?.chave === "expandir" && (
                <CartaoDoTrilho aberto={cartao.aberto} refCartao={cartao.ref}>
                  <Rotulo texto="Expandir menu" />
                </CartaoDoTrilho>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={alternarRecolhido}
              className="text-apoio hover:bg-vidro hover:text-titulo flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-xl px-2 text-[13px] font-medium transition-colors"
            >
              <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center">
                <IconeLateral recolher className="h-[18px] w-[18px]" />
              </span>
              <span className="min-w-0 flex-1 truncate text-left">Recolher menu</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}

/**
 * Traz `alvo` à vista DENTRO da caixa, mexendo só na rolagem dela.
 * `scrollIntoView` rolaria a página inteira junto, e a pessoa perderia o
 * lugar em que estava lendo.
 */
function mostrarDentro(caixa: HTMLElement, alvo: HTMLElement, suave: boolean) {
  const c = caixa.getBoundingClientRect();
  const a = alvo.getBoundingClientRect();
  const folga = 8;
  let delta = 0;
  // Mais alto que a caixa, ou acima dela: alinha pelo topo, que é onde está o
  // nome da pasta. Abaixo: desce só o necessário para o fim aparecer.
  if (a.height > c.height - 2 * folga || a.top < c.top + folga) delta = a.top - (c.top + folga);
  else if (a.bottom > c.bottom - folga) delta = a.bottom - (c.bottom - folga);
  if (Math.abs(delta) < 1) return;
  const semMovimento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  caixa.scrollTo({ top: caixa.scrollTop + delta, behavior: suave && !semMovimento ? "smooth" : "auto" });
}

function ListaAberta({
  grupos,
  atual,
  dono,
  marcas,
  expandido,
  aoAlternar,
}: {
  grupos: GrupoNav[];
  atual: string | null;
  dono: ItemNav | null;
  marcas: Record<string, Marca>;
  expandido: string | null;
  aoAlternar: (href: string) => void;
}) {
  return (
    <div className="space-y-6">
      {grupos.map((grupo) => (
        <div key={grupo.titulo}>
          {/* Título de grupo só quando há mais de um. Hoje todo mundo tem
              pelo menos dois (Trabalho e Ferramentas; o gestor, Equipe
              também), mas um rótulo sozinho em cima de tudo não separaria
              nada de nada. */}
          {grupos.length > 1 && (
            <p className="text-tenue px-3 pb-2 text-[11px] font-medium tracking-[0.14em] uppercase">
              {grupo.titulo}
            </p>
          )}
          <ul className="space-y-0.5">
            {grupo.itens.map((item) => {
              const ativa = dono?.href === item.href;
              const pasta = ehPasta(item);
              const aberta = pasta && expandido === item.href;
              const subs = aberta ? (item.subitens ?? []) : [];
              const subAtivo = ativa ? subitemAtivo(atual, item) : null;
              const pendente = pasta && !aberta && temPendencia((item.subitens ?? []).map((s) => s.href), marcas);
              const classes = cn(
                "group relative flex min-h-11 items-center gap-3 overflow-hidden rounded-xl px-2 py-1.5 text-[15px] transition-colors",
                /*
                 * Tópico ativo é SÓLIDO, igual ao da gaveta do celular
                 * (06/09/2026, pedido do usuário: "deixe mais visível qual
                 * está selecionado"). O `bg-acento-lavado` de antes era
                 * acento a ~10% sobre um fundo já translúcido — no claro
                 * ele praticamente empatava com o hover, e a barra inteira
                 * parecia não ter seleção nenhuma. A gaveta e as abas já
                 * eram sólidas; era a lateral que destoava das duas.
                 */
                ativa ? "bg-acento text-sobre-cor font-medium" : "text-apoio hover:bg-vidro hover:text-titulo",
                pasta && "w-full cursor-pointer text-left",
              );
              const miolo = (
                <>
                  {/* Régua à esquerda: marca a seção aberta sem depender
                      só da cor, que some para quem não distingue verde.
                      Sobre o fundo sólido ela é CLARA — em `bg-acento` uma
                      régua `bg-acento` seria invisível. */}
                  <span
                    aria-hidden
                    className={cn(
                      "absolute top-1/2 left-0 h-5 w-[3px] -translate-y-1/2 rounded-r-full transition-opacity",
                      ativa ? "bg-sobre-cor opacity-90" : "bg-acento opacity-0",
                    )}
                  />
                  <IconeDoTopico item={item} ativa={ativa} />
                  {/* Sem quebra de linha: ao abrir a lateral recolhida a
                      largura cresce por 200ms, e o rótulo que quebrasse
                      empurraria a lista inteira para baixo enquanto isso. */}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {/* Pasta fechada: um ponto diz que há pendência lá dentro,
                      já que os números moram nos subtópicos escondidos. */}
                  {pendente && (
                    <span
                      aria-hidden
                      className={cn("size-2 shrink-0 rounded-full", ativa ? "bg-sobre-cor" : "bg-acento")}
                    />
                  )}
                  {!pasta && <MarcaDoMenu marca={marcas[item.href]} sobreSolido={ativa} />}
                  {pasta && (
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 opacity-60 transition-transform motion-reduce:transition-none",
                        aberta && "rotate-90",
                      )}
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  )}
                </>
              );
              return (
                <li key={item.href} data-pasta={pasta ? item.href : undefined}>
                  {pasta ? (
                    /* Pasta: tocar ABRE, não navega. Quem tem página é o
                       subtópico (o primeiro deles é a própria tela do tópico). */
                    <button type="button" onClick={() => aoAlternar(item.href)} aria-expanded={aberta} className={classes}>
                      {miolo}
                    </button>
                  ) : (
                    <Link href={item.href} aria-current={ativa ? "page" : undefined} className={classes}>
                      {miolo}
                      <CarregandoLink />
                    </Link>
                  )}

                  {subs.length > 0 && (
                    /* Recuo alinhado ao rótulo do pai e uma régua vertical:
                       é o recuo que diz "isto pertence àquilo". */
                    <ul className="border-linha mt-1 mb-1 ml-6 space-y-px border-l pl-3">
                      <Subtopicos subs={subs} subAtivo={subAtivo} marcas={marcas} />
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * As linhas dos subtópicos — iguais na lateral aberta e no cartão do trilho.
 * Uma implementação só, para as duas não divergirem no primeiro ajuste.
 */
function Subtopicos({
  subs,
  subAtivo,
  marcas,
}: {
  subs: SubItemNav[];
  subAtivo: SubItemNav | null;
  marcas: Record<string, Marca>;
}) {
  return (
    <>
      {subs.map((sub, i) => {
        const aberto = subAtivo?.href === sub.href;
        const IconeSub = sub.icone;
        // Título de seção quando ela muda (Administração: Equipe · Negócio ·
        // Sistema).
        const novaSecao = sub.secao && sub.secao !== subs[i - 1]?.secao;
        return (
          <li key={sub.href}>
            {novaSecao && (
              <p className="text-tenue px-2 pt-2.5 pb-1 text-[10.5px] font-semibold tracking-[0.14em] uppercase">
                {sub.secao}
              </p>
            )}
            <Link
              href={sub.href}
              aria-current={aberto ? "page" : undefined}
              className={cn(
                "relative flex min-h-9 items-center gap-2.5 rounded-lg px-2 py-1.5 text-[14px] transition-colors",
                /* O subtópico aberto ganhou FUNDO: só a cor do texto não
                   vencia a régua vertical ao lado, e numa lista de seis a
                   linha atual se perdia. Mesmo lavado da gaveta. */
                aberto ? "bg-acento-lavado text-acento-suave font-medium" : "text-apoio hover:text-titulo hover:bg-vidro",
              )}
            >
              {IconeSub && <IconeSub aria-hidden className="h-4 w-4 shrink-0 opacity-80" />}
              <span className="min-w-0 flex-1 truncate">{sub.label}</span>
              <MarcaDoMenu marca={marcas[sub.href]} />
              <CarregandoLink />
            </Link>
          </li>
        );
      })}
    </>
  );
}

/**
 * O ícone num quadradinho na cor da PRÓPRIA seção (30/09/2026): o menu vira
 * a legenda das cores do painel. No ativo, o fundo já é sólido e o
 * quadradinho só clareia.
 */
function IconeDoTopico({ item, ativa }: { item: ItemNav; ativa: boolean }) {
  const Icone = item.icone;
  return (
    <span
      aria-hidden
      data-modulo={moduloDoTopico(item.href) ?? undefined}
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-colors",
        ativa ? "bg-white/20" : "bg-acento-lavado text-acento-suave",
      )}
    >
      <Icone className="h-[18px] w-[18px]" />
    </span>
  );
}

function Trilho({
  grupos,
  atual,
  dono,
  marcas,
  cartao,
}: {
  grupos: GrupoNav[];
  atual: string | null;
  dono: ItemNav | null;
  marcas: Record<string, Marca>;
  cartao: ControleDoCartao;
}) {
  return (
    <div className="space-y-2">
      {grupos.map((grupo, g) => (
        <div key={grupo.titulo}>
          {/* No trilho não cabe o título do grupo: um traço curto separa. */}
          {g > 0 && <div aria-hidden className="bg-linha mx-auto mb-2 h-px w-7" />}
          <ul aria-label={grupo.titulo} className="space-y-1">
            {grupo.itens.map((item) => (
              <ItemDoTrilho
                key={item.href}
                item={item}
                ativa={dono?.href === item.href}
                atual={atual}
                marcas={marcas}
                cartao={cartao}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ItemDoTrilho({
  item,
  ativa,
  atual,
  marcas,
  cartao,
}: {
  item: ItemNav;
  ativa: boolean;
  atual: string | null;
  marcas: Record<string, Marca>;
  cartao: ControleDoCartao;
}) {
  const pasta = ehPasta(item);
  const subs = item.subitens ?? [];
  const pendente = pasta
    ? temPendencia(subs.map((s) => s.href), marcas)
    : (marcas[item.href]?.numero ?? 0) > 0;
  const chave = item.href;
  const aberto = cartao.aberto?.chave === chave ? cartao.aberto : null;
  const listaAberta = aberto?.modo === "lista";
  const idCartao = `trilho${item.href.replace(/\//g, "-")}`;
  // Sem o rótulo na tela, o nome acessível carrega a pendência que o ponto
  // mostra a quem enxerga.
  const nome = pendente ? `${item.label}, com pendências` : item.label;
  const classes = cn(
    "relative mx-auto grid h-11 w-11 place-items-center rounded-xl transition-colors",
    ativa ? "bg-acento text-sobre-cor" : "text-apoio hover:bg-vidro",
    pasta && "cursor-pointer",
  );
  const miolo = (
    <>
      <IconeDoTopico item={item} ativa={ativa} />
      {pendente && (
        <span
          aria-hidden
          className={cn(
            "absolute top-1 right-1 size-2.5 rounded-full ring-2",
            ativa ? "bg-sobre-cor ring-acento" : "bg-acento ring-fundo",
          )}
        />
      )}
    </>
  );

  return (
    <li {...cartao.gatilho(chave, pasta ? "lista" : "rotulo")} className="relative">
      {pasta ? (
        <button
          type="button"
          onClick={(e) => cartao.alternarFixo(chave, e.currentTarget)}
          aria-label={nome}
          aria-expanded={listaAberta}
          aria-controls={listaAberta ? idCartao : undefined}
          className={classes}
        >
          {miolo}
        </button>
      ) : (
        <Link href={item.href} aria-label={nome} aria-current={ativa ? "page" : undefined} className={classes}>
          {miolo}
          <CarregandoLink />
        </Link>
      )}

      {aberto && (
        <CartaoDoTrilho aberto={aberto} refCartao={cartao.ref} id={listaAberta ? idCartao : undefined}>
          {listaAberta ? (
            <div
              data-lista-do-cartao
              className="bg-elevado border-linha shadow-painel-alto w-60 overflow-y-auto overscroll-contain rounded-2xl border p-1.5"
            >
              {/* O nome da pasta encabeça o cartão: no trilho ele não está
                  escrito em lugar nenhum. Não é link — pasta não é destino. */}
              <p className="text-titulo flex items-center gap-2.5 px-1.5 pt-1 pb-2 text-[13px] font-semibold">
                <IconeDoTopico item={item} ativa={false} />
                {item.label}
              </p>
              <ul className="space-y-px">
                <Subtopicos subs={subs} subAtivo={ativa ? subitemAtivo(atual, item) : null} marcas={marcas} />
              </ul>
            </div>
          ) : (
            <Rotulo texto={item.label} />
          )}
        </CartaoDoTrilho>
      )}
    </li>
  );
}

function Rotulo({ texto }: { texto: string }) {
  return (
    <span className="bg-elevado text-titulo border-linha shadow-painel-alto flex min-h-9 items-center rounded-xl border px-3 text-[13px] font-medium whitespace-nowrap">
      {texto}
    </span>
  );
}

function CartaoDoTrilho({
  aberto,
  refCartao,
  id,
  children,
}: {
  aberto: CartaoAberto;
  refCartao: React.RefObject<HTMLDivElement | null>;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={refCartao}
      id={id}
      // O rótulo repete o nome que o ícone já tem: para o leitor de tela ele
      // seria dito duas vezes.
      aria-hidden={aberto.modo === "rotulo" ? true : undefined}
      /*
       * `fixed` escapa do corte da caixa com rolagem: ela recorta o que é
       * posicionado DENTRO dela, e o containing block deste é a janela.
       * Nenhum ancestral da lateral tem transform, filter nem
       * backdrop-filter — se um dia tiver, o cartão fica preso a ele.
       *
       * O `pl-3` é a ponte: o vão entre o ícone e o cartão pertence ao
       * cartão, e o mouse que atravessa do ícone para ele não sai de cima de
       * nada no caminho.
       *
       * A posição não vem por prop: quem escreve é `posicionar`, antes de
       * pintar e a cada rolagem da página.
       */
      className={cn("fixed z-50 pl-3", aberto.modo === "rotulo" && "pointer-events-none")}
    >
      {children}
    </div>
  );
}

/** O ícone do botão de recolher e expandir: a própria lateral, com a seta. */
function IconeLateral({ recolher = false, className }: { recolher?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9 4.5v15" />
      {recolher ? <path d="M15.5 9.5 13 12l2.5 2.5" /> : <path d="M13 9.5l2.5 2.5-2.5 2.5" />}
    </svg>
  );
}

/* ── O cartão do trilho ─────────────────────────────────────────────────── */

type CartaoAberto = {
  chave: string;
  /** `rotulo`: só o nome, ao lado do ícone. `lista`: os subtópicos da pasta. */
  modo: "rotulo" | "lista";
  /** Aberto por clique ou toque: só fecha com outro clique, Esc ou fora. */
  fixo: boolean;
  rota: string | null;
};

type ControleDoCartao = ReturnType<typeof useCartaoDoTrilho>;

/** Quanto o mouse precisa parar sobre o ícone: passar por cima não abre nada. */
const ATRASO_ABRIR_MS = 120;
/** Folga para o mouse atravessar na diagonal até o cartão sem ele sumir. */
const ATRASO_FECHAR_MS = 180;
/**
 * Com um cartão aberto, passar por cima do ícone VIZINHO só troca o cartão
 * depois disto. É o caminho do mouse até o cartão: ele sai do ícone na
 * diagonal e cruza o vizinho de baixo antes de chegar (medido em 09/10/2026 —
 * trocando na hora, o cartão da pasta sumia no meio do caminho).
 */
const ATRASO_TROCAR_MS = 150;

/**
 * Um cartão de cada vez no trilho, aberto pelo mouse (passar), pelo teclado
 * (foco mostra o nome; Enter abre a pasta) ou pelo toque (tocar abre e
 * prende). Fecha ao navegar — `rota` é guardada com ele, como na gaveta —,
 * com Esc e clicando fora.
 *
 * Rolar a PÁGINA não fecha: reposiciona. A lateral é grudenta, então o ícone
 * quase nunca sai do lugar, e fechar a cada evento de rolagem fazia o cartão
 * sumir sozinho logo depois de abrir, enquanto a rolagem suave do "voltar ao
 * topo" ainda corria (medido em 09/10/2026). Quem fecha é a rolagem do
 * próprio trilho, a única que tira o ícone de baixo do cartão.
 */
function useCartaoDoTrilho(atual: string | null) {
  const [estado, setEstado] = useState<CartaoAberto | null>(null);
  const aberto = estado && estado.rota === atual ? estado : null;
  const ref = useRef<HTMLDivElement | null>(null);
  const gatilhoAtual = useRef<HTMLElement | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const limpar = () => {
    window.clearTimeout(timer.current);
    timer.current = undefined;
  };

  const abrir = (chave: string, modo: CartaoAberto["modo"], gatilho: HTMLElement, fixo: boolean) => {
    limpar();
    gatilhoAtual.current = gatilho;
    setEstado({ chave, modo, fixo, rota: atual });
  };

  const fechar = () => {
    limpar();
    setEstado(null);
  };

  // Antes de pintar: o cartão nasce no lugar certo, sem piscar no canto.
  useLayoutEffect(() => {
    if (aberto) posicionar(ref.current, gatilhoAtual.current, aberto.modo);
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const modo = aberto.modo;
    const dentroDoItem = (alvo: EventTarget | null) =>
      alvo instanceof Node && !!ref.current?.parentElement?.contains(alvo);
    let quadro = 0;
    const reposicionar = () => {
      if (quadro) return;
      quadro = window.requestAnimationFrame(() => {
        quadro = 0;
        posicionar(ref.current, gatilhoAtual.current, modo);
      });
    };

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const voltarFoco = dentroDoItem(document.activeElement);
      const gatilho = ref.current?.parentElement?.querySelector<HTMLElement>("button, a");
      setEstado(null);
      if (voltarFoco) gatilho?.focus();
    };
    const aoRolar = (e: Event) => {
      // A lista longa do cartão rola por dentro dele sem fechá-lo.
      if (e.target instanceof Node && ref.current?.contains(e.target)) return;
      if (e.target instanceof Element && e.target.classList.contains("lateral-rolagem")) {
        setEstado(null);
        return;
      }
      reposicionar();
    };
    const aoApertar = (e: PointerEvent) => {
      if (!dentroDoItem(e.target)) setEstado(null);
    };

    window.addEventListener("keydown", aoTeclar);
    window.addEventListener("scroll", aoRolar, { capture: true, passive: true });
    window.addEventListener("resize", reposicionar);
    document.addEventListener("pointerdown", aoApertar, true);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("scroll", aoRolar, { capture: true });
      window.removeEventListener("resize", reposicionar);
      document.removeEventListener("pointerdown", aoApertar, true);
      if (quadro) window.cancelAnimationFrame(quadro);
    };
  }, [aberto]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const gatilho = (chave: string, modo: CartaoAberto["modo"]) => ({
    onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
      // O toque não tem "passar por cima": no tablet quem abre é o clique.
      if (e.pointerType === "touch") return;
      const item = e.currentTarget;
      limpar();
      if (aberto?.chave === chave) return;
      // Com um cartão já aberto, o vizinho não troca na hora: entrar no
      // cartão aberto antes disso cancela a troca (é o `limpar` acima,
      // chamado pelo item dono do cartão).
      timer.current = window.setTimeout(
        () => abrir(chave, modo, item, false),
        aberto ? ATRASO_TROCAR_MS : ATRASO_ABRIR_MS,
      );
    },
    onPointerLeave: (e: React.PointerEvent<HTMLElement>) => {
      if (e.pointerType === "touch") return;
      limpar();
      timer.current = window.setTimeout(
        () => setEstado((s) => (s && s.chave === chave && !s.fixo ? null : s)),
        ATRASO_FECHAR_MS,
      );
    },
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      const alvo = e.target as HTMLElement;
      // Foco que vem do teclado mostra o nome; o do clique não precisa.
      if (!alvo.matches(":focus-visible")) return;
      if (ref.current?.contains(alvo) || aberto?.chave === chave) return;
      abrir(chave, "rotulo", e.currentTarget, false);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      const proximo = e.relatedTarget;
      if (proximo instanceof Node && e.currentTarget.contains(proximo)) return;
      setEstado((s) => (s && s.chave === chave ? null : s));
    },
  });

  /** Clique ou toque na pasta: abre o cartão preso, ou fecha se já estava. */
  const alternarFixo = (chave: string, gatilho: HTMLElement) => {
    if (aberto?.chave === chave && aberto.fixo) {
      fechar();
      return;
    }
    abrir(chave, "lista", gatilho.closest<HTMLElement>("li, div") ?? gatilho, true);
  };

  return { aberto, ref, gatilho, alternarFixo, fechar };
}

/**
 * Põe o cartão ao lado do item que o abriu: encostado na borda do trilho, na
 * altura do ícone (o rótulo, centrado nele) e dentro da janela — perto do pé
 * ele sobe até caber, e a lista longa ganha rolagem própria. Escreve direto
 * no elemento, sem estado: roda a cada rolagem da página.
 */
function posicionar(cartao: HTMLElement | null, gatilho: HTMLElement | null, modo: CartaoAberto["modo"]) {
  if (!cartao || !gatilho) return;
  const r = gatilho.getBoundingClientRect();
  const trilho = gatilho.closest<HTMLElement>("[data-trilho]")?.getBoundingClientRect();
  const minTopo = Math.max(8, (trilho?.top ?? 8) - 4);
  const lista = cartao.querySelector<HTMLElement>("[data-lista-do-cartao]");
  if (lista) lista.style.maxHeight = `${Math.max(160, window.innerHeight - minTopo - 12)}px`;
  const h = cartao.offsetHeight;
  let topo = modo === "rotulo" ? r.top + (r.height - h) / 2 : r.top;
  topo = Math.max(Math.min(topo, window.innerHeight - 12 - h), minTopo);
  cartao.style.top = `${Math.round(topo)}px`;
  // Encosta na borda do trilho: o `pl-3` do cartão faz o vão visível.
  cartao.style.left = `${Math.round(trilho?.right ?? r.right)}px`;
}
