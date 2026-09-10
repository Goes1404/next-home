import Link from "next/link";
import { FundoEmCamadas } from "@/components/motion/FundoEmCamadas";
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
    // Os chips são alvo de clique e por isso NÃO se movem. Quem dá
    // profundidade aqui é o fundo. `overflow-hidden` é obrigatório: sem ele
    // as manchas vazam e criam barra de rolagem horizontal.
    <section className="relative overflow-hidden px-4 pb-16 sm:px-8 sm:pb-24">
      <FundoEmCamadas />
      {/* Alinhado à ESQUERDA como as outras seções (09/09/2026). A página
          alternava entre esquerda e centro sem critério — quatro títulos à
          esquerda e dois centrados —, e alinhamento que não se decide é o que
          faz uma página parecer montada aos pedaços. O centro ficou só onde
          é escolha: o painel de fechamento (`CtaFinal`), que é um convite
          isolado e não um título no fluxo. */}
      <div className="mx-auto w-full max-w-6xl">
        <Reveal>
          <h2 className="text-fluid-2xl text-titulo">
            As melhores regiões para morar ou investir
          </h2>
          <p className="text-fluid-base text-apoio mt-3 max-w-xl">
            Encontre opções nos principais bairros e cidades com infraestrutura completa, mobilidade e alta valorização.
          </p>
        </Reveal>

        <Reveal stagger={0.08} className="mt-8 flex flex-wrap items-center gap-3">
          {REGIOES.map((r) => (
            <Link
              key={r.nome}
              href={r.href}
              className="rounded-full border border-linha/15 bg-superficie/50 px-5 py-2.5 text-sm text-corpo transition-colors hover:border-brand-300/50 hover:text-acento-suave"
            >
              {r.nome}
            </Link>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
