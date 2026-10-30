import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ARTIGOS_DE_AJUDA, artigoPorSlug } from "@/lib/ajuda/artigos";
import s from "@/app/astro/astro.module.css";
import { AindaPrecisaDeAjuda, CascaDaAjuda } from "../_componentes/CascaDaAjuda";

/** Só os artigos do código: endereço inventado é 404, sem tentar renderizar. */
export const dynamicParams = false;

export function generateStaticParams() {
  return ARTIGOS_DE_AJUDA.map((a) => ({ slug: a.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const artigo = artigoPorSlug((await params).slug);
  return artigo ? { title: artigo.titulo, description: artigo.resumo } : {};
}

/** Um artigo da central de ajuda (29/10/2026). */
export default async function ArtigoDeAjudaPage({ params }: { params: Promise<{ slug: string }> }) {
  const artigo = artigoPorSlug((await params).slug);
  if (!artigo) notFound();
  const outros = ARTIGOS_DE_AJUDA.filter((a) => a.slug !== artigo.slug).slice(0, 4);

  return (
    <CascaDaAjuda>
      <Link href="/ajuda" className="inline-flex min-h-11 items-center text-sm text-[var(--tinta-suave)] hover:text-[var(--azul)]">
        ← Todos os artigos
      </Link>
      <article>
        <h1 className={`${s.titulo} mt-2 text-[clamp(1.8rem,4vw,2.4rem)] leading-tight font-bold`}>{artigo.titulo}</h1>
        <p className="mt-3 text-lg leading-relaxed text-[var(--tinta-suave)]">{artigo.resumo}</p>
        <div className="mt-8 space-y-8 leading-relaxed text-[var(--tinta)]">
          {artigo.secoes.map((secao, i) => (
            <section key={secao.titulo ?? i}>
              {secao.titulo && <h2 className={`${s.titulo} text-xl font-bold`}>{secao.titulo}</h2>}
              {secao.paragrafos?.map((p) => (
                <p key={p} className="mt-3">
                  {p}
                </p>
              ))}
              {secao.passos && (
                <ol className="mt-3 list-decimal space-y-2 pl-6">
                  {secao.passos.map((p) => (
                    <li key={p} className="pl-1">
                      {p}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      </article>

      <nav aria-label="Outros artigos" className="mt-12">
        <h2 className={`${s.titulo} text-lg font-bold`}>Outros artigos</h2>
        <ul className="mt-3 space-y-1">
          {outros.map((a) => (
            <li key={a.slug}>
              <Link href={`/ajuda/${a.slug}`} className="inline-flex min-h-11 items-center text-[var(--azul)] underline underline-offset-4">
                {a.titulo}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <AindaPrecisaDeAjuda />
    </CascaDaAjuda>
  );
}
