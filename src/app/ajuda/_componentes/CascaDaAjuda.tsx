import Link from "next/link";
import { SeloAstro } from "@/components/marca/SeloAstro";
import { MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";
import { RodapeLegal } from "@/app/astro/_componentes/PaginaLegal";
import s from "@/app/astro/astro.module.css";

/**
 * A casca das páginas da central de ajuda: o topo claro das páginas legais
 * da Astro, com "Central de ajuda" e o atalho para o painel, e o mesmo
 * rodapé. Só leitura: reaproveita o estilo de `/astro` sem mexer nele.
 */
export function CascaDaAjuda({ children }: { children: React.ReactNode }) {
  return (
    <main id="conteudo" className={`${s.pagina} flex-1`}>
      <header className="border-b border-[var(--linha)] bg-white">
        <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <Link href="/ajuda" className={`${s.titulo} flex min-w-0 items-center gap-2.5 text-lg font-bold`}>
            <SeloAstro className="size-8 shrink-0" />
            <span className="truncate">Central de ajuda</span>
          </Link>
          <Link href="/corretor" className={`${s.botao} ${s.botaoNoClaro} min-h-11 px-4 text-sm`}>
            Abrir o painel
          </Link>
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl px-5 py-10 md:py-14">{children}</div>
      <RodapeLegal />
    </main>
  );
}

/** O fecho de cada página: não resolveu, fale com o suporte. */
export function AindaPrecisaDeAjuda() {
  return (
    <aside className="mt-12 rounded-2xl border border-[var(--linha)] bg-white p-5">
      <h2 className={`${s.titulo} text-lg font-bold`}>Ainda precisa de ajuda?</h2>
      <p className="mt-2 text-[var(--tinta-suave)]">
        Abra um chamado pelo painel, no menu da sua conta → Suporte da {MARCA_DA_PLATAFORMA.nome}. A equipe responde em
        até 1 dia útil.
      </p>
      <Link href="/corretor/suporte" className={`${s.botao} ${s.botaoPrincipal} mt-4 min-h-11 px-5 text-sm`}>
        Falar com o suporte
      </Link>
    </aside>
  );
}
