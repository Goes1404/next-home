"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { Empreendimento } from "@/lib/types";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { MapPin, MoreVertical, Pencil, Eye, Trash2 } from "lucide-react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { excluirImovel } from "./actions";

interface Props {
  imoveis: Empreendimento[];
  /**
   * Arte de IA por id de imóvel, para servir de capa a quem não tem foto
   * (0101). Objeto simples e não `Map` porque atravessa a fronteira
   * servidor→cliente, e `Map` não sobrevive à serialização do React.
   */
  artePorImovel?: Record<string, string>;
}

export function ListaImoveisClient({ imoveis, artePorImovel = {} }: Props) {
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<string>("todos");

  const filtrados = imoveis.filter((imovel) => {
    const termo = busca.toLowerCase();
    const bateBusca =
      imovel.nome.toLowerCase().includes(termo) ||
      imovel.bairro.toLowerCase().includes(termo) ||
      imovel.cidade.toLowerCase().includes(termo);

    if (!bateBusca) return false;
    const ehPublicado = imovel.publicado ?? true;
    if (filtroStatus === "todos") return true;
    if (filtroStatus === "publicados") return ehPublicado;
    if (filtroStatus === "rascunhos") return !ehPublicado;
    return imovel.status === filtroStatus;
  });

  return (
    <div className="space-y-6">
      {/* Barra de Busca & Filtros para Celular */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar imóvel"
            className="min-h-[48px] w-full rounded-2xl border border-linha-forte bg-campo px-4 pl-11 text-fluid-xs sm:text-fluid-sm text-titulo placeholder:text-tenue focus:border-acento focus:outline-none"
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-apoio"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="min-h-[48px] rounded-2xl border border-linha-forte bg-campo px-4 text-fluid-xs sm:text-fluid-sm text-titulo focus:border-acento focus:outline-none cursor-pointer"
        >
          <option value="todos">Todos os Imóveis ({imoveis.length})</option>
          <option value="publicados">Apenas Publicados</option>
          <option value="rascunhos">Apenas Rascunhos</option>
          <option value="lancamento">Lançamentos</option>
          <option value="em_construcao">Em Construção</option>
          <option value="pronto_para_morar">Prontos para Morar</option>
        </select>
      </div>

      {/* Grid de Cards Mobile-First */}
      {filtrados.length === 0 ? (
        <div className="p-12 text-center rounded-3xl border border-dashed border-linha-forte bg-elevado space-y-3">
          <span className="text-4xl block">🔍</span>
          <h4 className="text-fluid-base font-bold text-corpo">Nenhum imóvel encontrado</h4>
          <p className="text-fluid-xs text-tenue">Tente ajustar o termo de busca ou o filtro.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtrados.map((imovel) => {
            const precoFormatado = imovel.precoAPartir
              ? formatarMoedaBRL(imovel.precoAPartir)
              : "Sob Consulta";
            /*
             * `capa` NUNCA é nula: `mapEmpreendimento` devolve o logotipo da
             * NextHome quando não há foto. Por isso o ramo "Sem Foto de Capa"
             * abaixo era código morto desde sempre, e o cartão de um imóvel
             * sem foto mostrava o logotipo esticado em `object-cover`. Quem
             * responde "tem foto?" é a GALERIA, que só tem mídia do tipo foto.
             */
            const capaUrl = imovel.galeria?.[0]?.url ?? null;
            const arte = capaUrl || !imovel.id ? null : artePorImovel[imovel.id];

            return (
              <div
                key={imovel.slug}
                className="group rounded-3xl border border-linha bg-superficie shadow-lg hover:border-acento-linha hover:shadow-xl hover:-translate-y-0.5 transition-all motion-reduce:transition-none flex flex-col justify-between"
              >
                {/* Imagem de Capa. Sem foto, a arte de IA do imóvel entra no
                    lugar — SEMPRE com selo, porque um render que se passa por
                    foto é a única coisa que este empréstimo não pode fazer. */}
                {/* O corte mora AQUI, não na raiz do cartão: com
                    `overflow-hidden` na raiz, o menu de três pontos — que abre
                    para cima, em `absolute` — sairia decapitado pela borda.
                    O raio desconta o fio da borda para os cantos casarem. */}
                <div className="relative aspect-[16/9] bg-campo overflow-hidden rounded-t-[calc(1.5rem-1px)]">
                  {/* O zoom lento no hover é o mesmo vocabulário da vitrine
                      pública: diz "isto abre" sem uma palavra. */}
                  {capaUrl ? (
                    <Image
                      src={capaUrl}
                      alt={imovel.nome}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none"
                    />
                  ) : arte ? (
                    <>
                      <Image
                        src={arte}
                        alt={`Arte de IA de ${imovel.nome}`}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover"
                      />
                      <span className="absolute bottom-2 left-3 rounded-full border border-white/25 bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md">
                        arte de IA · não é foto
                      </span>
                    </>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-tenue text-fluid-xs font-semibold">
                      Sem Foto de Capa
                    </div>
                  )}

                  {/* Badges Flutuantes */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold border backdrop-blur-md ${
                        imovel.publicado ?? true
                          ? "bg-ok-lavado text-ok border-ok-linha"
                          : "bg-alerta-lavado text-alerta border-alerta-linha"
                      }`}
                    >
                      {imovel.publicado ?? true ? "Publicado" : "Rascunho"}
                    </span>

                    {/* `text-white`, não `text-titulo`: o token de título é
                        #05211c no tema claro, e sobre `bg-black/60` isso é
                        preto sobre preto. O selo flutua sobre a FOTO, que é
                        escura nos dois temas — quem manda na cor aqui é o
                        fundo do selo, não o tema. */}
                    <span className="rounded-full border border-white/25 bg-black/60 px-2.5 py-1 text-[10px] font-bold text-white backdrop-blur-md">
                      {imovel.midias?.length || imovel.galeria?.length || 0} fotos
                    </span>
                  </div>
                </div>

                {/* Conteúdo do Card */}
                <div className="p-4 sm:p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-1">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      {/* `min-w-0` + `break-words`: item de flex tem largura
                          mínima de conteúdo por padrão, então um nome de uma
                          palavra só ("ResidencialAlphaville") empurrava o
                          cartão para fora da coluna em vez de quebrar. */}
                      <h3 className="text-fluid-base text-titulo min-w-0 leading-tight font-bold break-words">
                        {imovel.nome}
                      </h3>
                    </div>
                    {/* O alfinete estava em 20px numa linha de ~12px: ícone
                        maior que o texto que ele acompanha desalinha a linha
                        inteira e come a largura do endereço. */}
                    <p className="text-fluid-xs text-apoio flex items-start gap-1.5">
                      <MapPin aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 break-words">
                        {imovel.bairro}, {imovel.cidade}
                      </span>
                    </p>
                    <p className="text-fluid-xs font-bold text-acento-suave pt-1">
                      A partir de: {precoFormatado}
                    </p>
                  </div>

                  {/* Botões de Ação para Celular */}
                  <div className="pt-2 flex items-center gap-2 border-t border-linha">
                    <Link
                      href={`/corretor/imoveis/${imovel.slug}`}
                      className="flex-1 min-h-[46px] rounded-xl bg-acento hover:bg-acento-hover text-sobre-cor text-fluid-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-acento/20 active:scale-98"
                    >
                      <span>✏️ Editar Fotos & Dados</span>
                    </Link>

                    {/* O menu de três pontos (07/09/2026): editar, ver no
                        site e excluir num lugar só. O olho solto saiu — era
                        um botão sem rótulo que ninguém decifrava, e excluir
                        não tinha porta nenhuma nesta tela. */}
                    <MenuDoCard imovel={imovel} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * O menu de três pontos de um cartão do catálogo.
 *
 * Três ações, na ordem do uso: editar (a mesma do botão grande — repetida
 * aqui porque o menu é a lista COMPLETA do que dá para fazer), ver a página
 * pública, e excluir.
 *
 * ## Excluir segue a regra de dois passos, e ela mora na POLICY
 *
 * A 0097 só deixa apagar imóvel DESPUBLICADO — despublicar é o primeiro
 * passo, reversível, feito no editor. Para o publicado o item explica o
 * caminho em vez de sumir: botão que some sem dizer por quê é a pior versão
 * de um botão desabilitado (a régua de `ExcluirImovel`, que é o irmão deste
 * menu dentro do editor). A confirmação acontece NO menu, com o nome do
 * imóvel — o `confirm()` do navegador é fácil de despachar sem ler.
 */
function MenuDoCard({ imovel }: { imovel: Empreendimento }) {
  const router = useRouter();
  const { avisar, falhar } = useAvisos();
  const [aberto, setAberto] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciar] = useTransition();
  const raiz = useRef<HTMLDivElement>(null);

  const publicado = imovel.publicado ?? true;

  // Fecha ao tocar fora e no Esc — um menu que só fecha no próprio botão
  // vira um post-it esquecido na tela.
  useEffect(() => {
    if (!aberto) return;
    const aoTocarFora = (e: PointerEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) fechar();
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    document.addEventListener("pointerdown", aoTocarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("pointerdown", aoTocarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  function fechar() {
    setAberto(false);
    setConfirmando(false);
  }

  function apagar() {
    iniciar(async () => {
      try {
        const r = await excluirImovel(imovel.slug);
        if (!r.ok) {
          falhar(r.erro ?? "Não deu para excluir o imóvel.");
          fechar();
          return;
        }
        avisar(`"${imovel.nome}" foi excluído.`);
        fechar();
        router.refresh();
      } catch {
        falhar("A conexão caiu no meio da exclusão. Confira a lista antes de tentar de novo.");
        fechar();
      }
    });
  }

  const ITEM =
    "text-fluid-xs flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-left transition-colors";

  return (
    <div ref={raiz} className="relative shrink-0">
      <button
        type="button"
        onClick={() => (aberto ? fechar() : setAberto(true))}
        aria-expanded={aberto}
        aria-haspopup="menu"
        aria-label={`Mais ações para ${imovel.nome}`}
        className="bg-vidro-forte hover:bg-vidro-mais text-corpo hover:text-titulo flex min-h-[46px] w-[46px] shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors"
      >
        <MoreVertical aria-hidden className="h-5 w-5" />
      </button>

      {aberto && (
        <div
          role="menu"
          className="border-linha-forte bg-superficie shadow-painel menu-abre absolute right-0 bottom-[calc(100%+0.5rem)] z-20 w-56 rounded-xl border p-1.5"
        >
          {!confirmando ? (
            <>
              <Link
                role="menuitem"
                href={`/corretor/imoveis/${imovel.slug}`}
                className={`${ITEM} text-corpo hover:bg-vidro hover:text-titulo`}
              >
                <Pencil aria-hidden className="h-4 w-4 shrink-0" />
                Editar
              </Link>
              {/* Rascunho não tem página pública: a vitrine filtra
                  `publicado`, e mandar para um 404 com a marca em cima é pior
                  que explicar. */}
              {publicado ? (
                <a
                  role="menuitem"
                  href={`/empreendimentos/${imovel.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${ITEM} text-corpo hover:bg-vidro hover:text-titulo`}
                >
                  <Eye aria-hidden className="h-4 w-4 shrink-0" />
                  Ver no site
                </a>
              ) : (
                <p className={`${ITEM} text-tenue cursor-default`}>
                  <Eye aria-hidden className="h-4 w-4 shrink-0" />
                  Sem página — é rascunho
                </p>
              )}
              {publicado ? (
                <p className={`${ITEM} text-tenue cursor-default items-start py-2`}>
                  <Trash2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    Para excluir, primeiro <strong className="text-apoio">despublique</strong> no
                    editor.
                  </span>
                </p>
              ) : (
                <button
                  role="menuitem"
                  type="button"
                  onClick={() => setConfirmando(true)}
                  className={`${ITEM} text-perigo hover:bg-perigo-lavado`}
                >
                  <Trash2 aria-hidden className="h-4 w-4 shrink-0" />
                  Excluir…
                </button>
              )}
            </>
          ) : (
            <div className="space-y-2 p-1.5">
              <p className="text-fluid-xs text-corpo">
                Apagar <strong className="text-titulo">{imovel.nome}</strong> de vez? Fotos,
                plantas e tipologias vão junto, sem volta.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={apagar}
                  disabled={pendente}
                  className="bg-perigo text-sobre-cor text-fluid-xs min-h-10 flex-1 cursor-pointer rounded-lg px-3 font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {pendente ? "Excluindo…" : "Excluir de vez"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmando(false)}
                  disabled={pendente}
                  className="border-linha-forte text-fluid-xs text-corpo min-h-10 flex-1 cursor-pointer rounded-lg border px-3 transition-colors hover:bg-vidro"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
