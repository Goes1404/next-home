import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";

/**
 * Cada região linka para o filtro que de fato tem resultado hoje — Barueri e
 * Osasco batem no campo `cidade`, Alphaville é cadastrado como `bairro`
 * dentro de Barueri. Santana de Parnaíba e Itapevi são área de atuação da
 * imobiliária mas ainda sem lançamento cadastrado, então caem na listagem
 * geral em vez de um filtro que voltaria vazio.
 */
const REGIOES = [
  { nome: "Alphaville", href: "/empreendimentos?bairro=Alphaville" },
  { nome: "Barueri", href: "/empreendimentos?cidade=Barueri" },
  { nome: "Santana de Parnaíba", href: "/empreendimentos" },
  { nome: "Osasco", href: "/empreendimentos?cidade=Osasco" },
  { nome: "Itapevi", href: "/empreendimentos" },
];

export function Regioes() {
  return (
    <section className="px-4 pb-16 sm:pb-24">
      <div className="mx-auto w-full max-w-3xl text-center">
        <Reveal>
          <h2 className="text-fluid-2xl text-titulo">Localizações Privilegiadas</h2>
          <p className="text-fluid-base mt-3 text-apoio">
            Os endereços mais nobres e desejados de Alphaville, Barueri e região metropolitana.
          </p>
        </Reveal>

        <Reveal stagger={0.08} className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {REGIOES.map((r) => (
            <Link
              key={r.nome}
              href={r.href}
              className="rounded-full border border-linha/15 bg-superficie/50 px-5 py-2.5 text-sm text-corpo transition-colors hover:border-brand-300/50 hover:text-acento"
            >
              {r.nome}
            </Link>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
