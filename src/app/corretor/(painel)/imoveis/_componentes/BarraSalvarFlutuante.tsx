"use client";

import Link from "next/link";

interface Props {
  salvando: boolean;
  onSalvar: () => void;
  slug: string;
  publicado: boolean;
  onTogglePublicado: () => void;
}

export function BarraSalvarFlutuante({
  salvando,
  onSalvar,
  slug,
  publicado,
  onTogglePublicado,
}: Props) {
  return (
    <aside
      aria-label="Barra de ações do imóvel"
      // `acima-da-nav`: no celular esta barra dividia o rodapé com a
      // navegação inferior e o botão "Salvar alterações" ficava por baixo.
      className="acima-da-nav fixed inset-x-0 z-45 bg-fundo/90 border-t border-linha-forte p-3 sm:p-4 shadow-painel-alto backdrop-blur-xl"
    >
      <div className="mx-auto flex w-full max-w-[84rem] flex-wrap items-center justify-between gap-3 px-1 md:px-4">
        {/* Toggle Publicado no Site */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onTogglePublicado}
            className={`px-3 py-2 rounded-xl text-fluid-xs font-bold border transition-all cursor-pointer flex items-center gap-2 ${
              publicado
                ? "bg-ok-lavado text-ok border-ok-linha"
                : "bg-alerta-lavado text-alerta border-alerta-linha"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                publicado ? "bg-ok animate-pulse" : "bg-alerta"
              }`}
            />
            <span>{publicado ? "Publicado no Site" : "Rascunho Oculto"}</span>
          </button>

          <Link
            href={`/empreendimentos/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-vidro hover:bg-vidro-forte text-corpo text-fluid-xs font-semibold transition-colors border border-linha"
          >
            <span>👁️ Ver na Vitrine</span>
            <span>↗</span>
          </Link>
        </div>

        {/* Botão de Salvar Grande para Polegar */}
        <div className="flex items-center gap-2">
          <Link
            href="/corretor/imoveis"
            className="px-4 py-2.5 rounded-xl bg-vidro-forte hover:bg-vidro-mais text-corpo hover:text-titulo text-fluid-xs font-bold transition-colors"
          >
            Voltar
          </Link>

          <button
            type="button"
            onClick={onSalvar}
            disabled={salvando}
            className="min-h-[48px] px-6 sm:px-8 py-2.5 rounded-xl bg-acento hover:bg-acento-hover disabled:opacity-50 text-white text-fluid-xs sm:text-fluid-sm font-bold transition-all shadow-lg shadow-acento/30 flex items-center gap-2 cursor-pointer active:scale-95"
          >
            {salvando ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-linha-forte border-t-white animate-spin" />
                <span>Salvando...</span>
              </>
            ) : (
              <>
                <span>💾 Salvar Alterações</span>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
}
