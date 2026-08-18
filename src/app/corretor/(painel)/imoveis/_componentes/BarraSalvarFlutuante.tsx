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
      className="fixed bottom-0 left-0 right-0 z-40 bg-ink-950/90 border-t border-white/15 p-3 sm:p-4 backdrop-blur-xl shadow-[0_-10px_30px_rgba(0,0,0,0.8)] animate-in slide-in-from-bottom-2 duration-300"
    >
      <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Toggle Publicado no Site */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onTogglePublicado}
            className={`px-3 py-2 rounded-xl text-fluid-xs font-bold border transition-all cursor-pointer flex items-center gap-2 ${
              publicado
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                : "bg-amber-500/20 text-amber-300 border-amber-500/40"
            }`}
          >
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                publicado ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
            <span>{publicado ? "Publicado no Site" : "Rascunho Oculto"}</span>
          </button>

          <Link
            href={`/empreendimentos/${slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-mist-300 text-fluid-xs font-semibold transition-colors border border-white/10"
          >
            <span>👁️ Ver na Vitrine</span>
            <span>↗</span>
          </Link>
        </div>

        {/* Botão de Salvar Grande para Polegar */}
        <div className="flex items-center gap-2">
          <Link
            href="/corretor/imoveis"
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-mist-300 hover:text-white text-fluid-xs font-bold transition-colors"
          >
            Voltar
          </Link>

          <button
            type="button"
            onClick={onSalvar}
            disabled={salvando}
            className="min-h-[48px] px-6 sm:px-8 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white text-fluid-xs sm:text-fluid-sm font-bold transition-all shadow-lg shadow-brand-500/30 flex items-center gap-2 cursor-pointer active:scale-95"
          >
            {salvando ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
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
