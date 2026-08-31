import Link from "next/link";
import {
  apelidosPendentes,
  contarPendencias,
  EXPLICACAO_URGENCIA,
  type ImovelParaCuradoria,
} from "@/lib/imoveis/apelidoPendente";

/**
 * A lista dos imóveis sem "também conhecido como".
 *
 * ## Por que uma lista, e não mais um aviso no editor
 *
 * O aviso dentro do editor do imóvel existe desde 26/08 e não moveu nada:
 * em 31/08, nenhum empreendimento tinha sido editado desde 25/08 01h55 —
 * antes do próprio aviso. Ele só é visto por quem já abriu aquele imóvel,
 * e quem abre um imóvel foi lá fazer outra coisa. A lista inverte isso:
 * mostra os 23 de uma vez, na tela por onde o corretor passa, com o link
 * direto de cada um.
 *
 * ## Por que os urgentes ficam de fora do "ver os outros"
 *
 * 23 linhas é lista, e lista ninguém lê. Os 9 cujo nome é TÍTULO DE ANÚNCIO
 * ("Melhor valor de metro da Região") são os que o bot não tem como
 * reconhecer de jeito nenhum — esses aparecem abertos. Os outros 14 têm
 * nome de verdade e a perda é pequena: ficam atrás de um clique.
 *
 * O cartão some sozinho quando não há pendência. Contador que vive em zero
 * ensina a ignorar o contador.
 */

function Linha({
  slug,
  nome,
  detalhe,
  motivo,
}: {
  slug: string;
  nome: string;
  detalhe: string;
  motivo: string | null;
}) {
  return (
    <li>
      <Link
        href={`/corretor/imoveis/${slug}`}
        className="border-linha hover:bg-elevado flex items-center gap-3 border-t px-5 py-3 transition-colors sm:px-6"
      >
        <span className="min-w-0 flex-1">
          <span className="text-fluid-sm text-titulo block truncate font-medium">{nome}</span>
          <span className="text-fluid-xs text-apoio block truncate">
            {detalhe}
            {motivo ? ` · ${motivo}` : ""}
          </span>
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-tenue h-4 w-4 shrink-0"
          aria-hidden
        >
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </Link>
    </li>
  );
}

function detalheDe(i: ImovelParaCuradoria): string {
  return [i.bairro, i.construtora].filter(Boolean).join(" · ") || "sem bairro cadastrado";
}

export function ApelidosPendentes({ imoveis }: { imoveis: readonly ImovelParaCuradoria[] }) {
  const pendentes = apelidosPendentes(imoveis);
  const { total, urgentes } = contarPendencias(pendentes);

  if (total === 0) return null;

  const semNomeReal = pendentes.filter((p) => p.motivo !== null);
  const comNomeReal = pendentes.filter((p) => p.motivo === null);

  return (
    <section className="border-alerta-linha bg-superficie shadow-painel overflow-hidden rounded-2xl border">
      <div className="px-5 pt-5 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-titulo text-lg">
            {total} {total === 1 ? "imóvel sem apelido" : "imóveis sem apelido"}
          </h2>
          {urgentes > 0 && (
            <span className="text-alerta border-alerta-linha bg-alerta-lavado text-fluid-xs rounded-full border px-2.5 py-1 font-semibold">
              {urgentes} {urgentes === 1 ? "urgente" : "urgentes"}
            </span>
          )}
        </div>
        <p className="text-fluid-xs text-corpo mt-2 leading-relaxed text-pretty">
          O apelido é como o cliente chama o imóvel no WhatsApp — &ldquo;Manacá&rdquo; para um
          cadastro chamado &ldquo;More na Aldeia de Barueri&rdquo;. Sem ele, a assistente trata um
          imóvel <strong className="text-titulo">nosso</strong> como se fosse de outra imobiliária.
          {urgentes > 0 && (
            <>
              {" "}
              Os {urgentes} de cima são os mais graves: o nome cadastrado é um título de anúncio,
              então não há nome nenhum para o cliente acertar.
            </>
          )}
        </p>
      </div>

      {semNomeReal.length > 0 && (
        <ul className="mt-4">
          {semNomeReal.map(({ imovel, motivo }) => (
            <Linha
              key={imovel.slug}
              slug={imovel.slug}
              nome={imovel.nome}
              detalhe={detalheDe(imovel)}
              motivo={motivo ? EXPLICACAO_URGENCIA[motivo] : null}
            />
          ))}
        </ul>
      )}

      {comNomeReal.length > 0 && (
        <details className="group">
          <summary className="text-fluid-xs text-apoio hover:text-titulo border-linha cursor-pointer list-none border-t px-5 py-3.5 transition-colors select-none sm:px-6">
            <span className="group-open:hidden">
              Ver os outros {comNomeReal.length} — têm nome de verdade, mas ainda ganham com apelido
            </span>
            <span className="hidden group-open:inline">Esconder os outros {comNomeReal.length}</span>
          </summary>
          <ul>
            {comNomeReal.map(({ imovel }) => (
              <Linha
                key={imovel.slug}
                slug={imovel.slug}
                nome={imovel.nome}
                detalhe={detalheDe(imovel)}
                motivo={null}
              />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
