import Image from "next/image";
import Link from "next/link";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { iniciais } from "@/lib/format";
import type { AtuacaoCorretor } from "@/lib/queries";
import { linkWhatsappPara } from "@/lib/site";
import type { CorretorPerfil } from "@/lib/types";

type CardCorretorProps = {
  corretor: CorretorPerfil;
  atuacao?: AtuacaoCorretor;
  compacto?: boolean;
};

function resumoAtuacao(atuacao?: AtuacaoCorretor) {
  if (!atuacao || atuacao.total === 0) return null;
  const contagem = `${atuacao.total} empreendimento${atuacao.total === 1 ? "" : "s"}`;
  const visiveis = atuacao.cidades.slice(0, 2);
  const restantes = atuacao.cidades.length - visiveis.length;
  const cidades =
    restantes > 0 ? `${visiveis.join(", ")} +${restantes}` : visiveis.join(", ");
  return { contagem, cidades };
}

function Avatar({ corretor, tamanho }: { corretor: CorretorPerfil; tamanho: 56 | 72 }) {
  const classe = tamanho === 72 ? "h-18 w-18" : "h-14 w-14";
  if (corretor.fotoUrl) {
    return (
      <Image
        src={corretor.fotoUrl}
        alt=""
        width={tamanho}
        height={tamanho}
        className={`${classe} shrink-0 rounded-full object-cover ring-1 ring-linha/15`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${classe} font-display from-brand-500 to-brand-700 flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-lg text-mist-50 ring-1 ring-linha/15`}
    >
      {iniciais(corretor.nome)}
    </span>
  );
}

const ICONE_WHATSAPP = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4">
    <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.45 1.27 4.9L2 22l5.25-1.38a9.96 9.96 0 0 0 4.79 1.22h.01c5.52 0 10-4.48 10-10s-4.48-9.84-10.01-9.84Zm5.85 14.1c-.25.7-1.45 1.34-2 1.42-.51.08-1.16.11-1.87-.12-.43-.14-.98-.32-1.69-.62-2.97-1.28-4.9-4.27-5.05-4.47-.15-.2-1.21-1.6-1.21-3.06s.77-2.17 1.04-2.47c.27-.3.6-.37.8-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.06 1.14 1.02 2.1 1.33 2.4 1.48.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.73.82 2.02.97.3.15.5.22.57.35.07.13.07.75-.18 1.45Z" />
  </svg>
);

/**
 * Cartão do corretor.
 *
 * `compacto` (home): uma linha com avatar, nome e CRECI — porta para o perfil.
 *
 * Completo (equipe, 13/09/2026, "deixar mais profissional"): a FOTO vira o
 * herói do cartão, em 4:3 no topo, com o CRECI como selo sobre ela; embaixo,
 * nome, atuação (número de imóveis + cidades) e a bio em duas linhas quando
 * existe. Duas saídas de tamanho de polegar: WhatsApp (primária) e perfil.
 * Sem foto, o retrato é um monograma sobre degradê da marca — nunca um
 * quadro vazio nem um ícone genérico de pessoa.
 */
export function CardCorretor({ corretor, atuacao, compacto }: CardCorretorProps) {
  if (compacto) {
    return (
      <Link
        href={`/corretores/${corretor.slug}`}
        className="rounded-glass focus-visible:outline-acento-forte block focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <GlassSurface
          preset="card"
          className="group flex items-center gap-4 px-5 py-5 transition-transform duration-300 ease-[var(--ease-out-quart)] hover:-translate-y-0.5"
        >
          <Avatar corretor={corretor} tamanho={56} />
          <div className="min-w-0 flex-1">
            <p className="font-display group-hover:text-acento-suave truncate text-lg text-titulo transition-colors">
              {corretor.nome}
            </p>
            <p className="text-fluid-sm text-legenda">CRECI {corretor.creci}</p>
          </div>
          <span
            aria-hidden
            className="group-hover:text-acento-suave shrink-0 text-tenue transition-all group-hover:translate-x-0.5"
          >
            →
          </span>
        </GlassSurface>
      </Link>
    );
  }

  const resumo = resumoAtuacao(atuacao);
  const whatsapp = linkWhatsappPara(
    corretor.whatsapp,
    `Olá, ${corretor.nome}! Vim pelo site da Next Home e quero falar com você.`,
  );
  const bio = corretor.bio?.trim();

  return (
    <article className="cartao group flex h-full flex-col overflow-hidden transition-transform duration-300 ease-[var(--ease-out-quart)] hover:-translate-y-0.5">
      {/* Retrato: 4:3, com o selo do CRECI sobre a foto. Tinta fixa no selo
          (fundo escuro, texto claro) porque ele flutua sobre imagem, e token
          de tema sobre foto some no tema claro. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-elevado">
        {corretor.fotoUrl ? (
          <Image
            src={corretor.fotoUrl}
            alt={`Foto de ${corretor.nome}`}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover object-top transition-transform duration-700 ease-[var(--ease-out-quart)] group-hover:scale-[1.03]"
          />
        ) : (
          <div
            aria-hidden
            className="font-display from-brand-500 via-brand-600 to-brand-800 flex h-full w-full items-center justify-center bg-gradient-to-br text-5xl text-mist-50"
          >
            {iniciais(corretor.nome)}
          </div>
        )}
        <span className="absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold tracking-[0.12em] text-mist-50 uppercase backdrop-blur">
          CRECI {corretor.creci}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-5 pt-5 pb-5">
        <h2 className="font-display text-fluid-lg text-titulo leading-tight">
          <Link
            href={`/corretores/${corretor.slug}`}
            className="group-hover:text-acento-suave transition-colors"
          >
            {corretor.nome}
          </Link>
        </h2>

        {/* Atuação: número em destaque e cidades em seguida — o que se lê
            mais rápido varrendo sete cartões. Sem atuação apurada, a frase
            geral, para o cartão não encolher e desalinhar a grade. */}
        <p className="text-fluid-sm text-apoio">
          {resumo ? (
            <>
              <span className="font-medium text-corpo">{resumo.contagem}</span> · {resumo.cidades}
            </>
          ) : (
            <>Atende toda a região — de lançamento a pronto para morar.</>
          )}
        </p>

        {bio && <p className="text-fluid-sm text-corpo-suave line-clamp-2 text-pretty">{bio}</p>}

        <div className="mt-auto grid grid-cols-2 gap-2 pt-3">
          <Link
            href={`/corretores/${corretor.slug}`}
            className="border-linha text-corpo hover:border-acento-linha hover:text-titulo inline-flex min-h-11 items-center justify-center rounded-full border text-sm font-medium transition-colors"
          >
            Ver perfil
          </Link>
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-brand-500 hover:bg-brand-400 inline-flex min-h-11 items-center justify-center gap-2 rounded-full text-sm font-medium text-white transition-colors botao-vivo"
            aria-label={`Falar com ${corretor.nome} no WhatsApp`}
          >
            {ICONE_WHATSAPP}
            WhatsApp
          </a>
        </div>
      </div>
    </article>
  );
}
