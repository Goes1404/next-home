import Link from "next/link";
import { Reveal } from "@/components/motion/Reveal";
import { TituloEditorial } from "@/components/motion/TituloEditorial";

type Passo = { href: string; label: string };

/**
 * O cabeçalho de toda página institucional abaixo da home: trilha, rótulo
 * que CONTA alguma coisa, título editorial e a frase de abertura.
 *
 * ## Por que um componente
 *
 * Cada página escrevia o próprio `<h1>`: uma centrada em `max-w-2xl`, outra
 * à esquerda em `4xl`, uma com versalete tracked, outra com pílula de
 * ícone. Página a página parecia razoável; navegando entre elas, o site
 * parecia montado por pessoas diferentes — que era o caso. Este é o mesmo
 * papel que `CabecalhoDeTela` faz no painel.
 *
 * ## O rótulo não é decoração
 *
 * A linha acima do título existe para dizer um FATO ("7 corretores com
 * CRECI", "CRECI 044589-J · Alphaville"), como na home depois de 09/09/2026.
 * Versalete com "Nossa equipe" repete o que o título já diz e foi cortado.
 *
 * ## Movimento
 *
 * O título sobe linha a linha por conta própria (`TituloEditorial`); trilha
 * e rótulo entram num `Reveal` sem deslocamento, e a frase de abertura num
 * segundo, um pouco depois. O título NÃO fica dentro de um Reveal: dois
 * donos da mesma opacidade é o jeito conhecido de um elemento sumir.
 */
export function CabecalhoDePagina({
  trilha,
  atual,
  rotulo,
  titulo,
  lead,
  children,
}: {
  /** Os passos ANTES da página atual, do mais alto para o mais próximo. */
  trilha?: Passo[];
  /** Nome desta página na trilha. Sem ele, a trilha não é desenhada. */
  atual?: string;
  rotulo?: React.ReactNode;
  titulo: React.ReactNode;
  lead?: React.ReactNode;
  /** O que vier depois da frase de abertura (atalhos, um formulário curto). */
  children?: React.ReactNode;
}) {
  const temTrilha = Boolean(atual);

  return (
    <header>
      {(temTrilha || rotulo) && (
        <Reveal from="nenhuma">
          {temTrilha && (
            <nav
              aria-label="Você está aqui"
              className="text-fluid-xs text-apoio mb-4 flex flex-wrap items-center gap-x-2 gap-y-1"
            >
              {(trilha ?? [{ href: "/", label: "Início" }]).map((passo) => (
                <span key={passo.href} className="inline-flex items-center gap-x-2">
                  <Link
                    href={passo.href}
                    className="hover:text-titulo inline-flex min-h-6 items-center underline decoration-transparent underline-offset-4 transition-colors hover:decoration-current"
                  >
                    {passo.label}
                  </Link>
                  <span aria-hidden className="text-tenue">
                    /
                  </span>
                </span>
              ))}
              <span className="text-corpo" aria-current="page">
                {atual}
              </span>
            </nav>
          )}
          {rotulo && <p className="text-fluid-xs text-apoio mb-3">{rotulo}</p>}
        </Reveal>
      )}

      <TituloEditorial as="h1" className="text-fluid-3xl text-titulo max-w-3xl text-balance">
        {titulo}
      </TituloEditorial>

      {lead && (
        <Reveal from="nenhuma" delay={0.2}>
          <p className="text-fluid-base text-apoio mt-4 max-w-2xl text-pretty">{lead}</p>
        </Reveal>
      )}

      {children}
    </header>
  );
}
