import Image from "next/image";
import Link from "next/link";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { iniciais } from "@/lib/format";
import type { AtuacaoCorretor } from "@/lib/queries";
import { linkWhatsappPara } from "@/lib/site";
import type { CorretorPerfil } from "@/lib/types";

/**
 * Corretor na vitrine da equipe.
 *
 * Duas decisões guiam este card, e as duas vêm do dado real:
 *
 * 1. Quase ninguém tem foto e *ninguém* tem bio preenchida — o fallback de
 *    iniciais e a linha de atuação (`getAtuacaoPorCorretor`) não são caso de
 *    borda, são o estado normal. Sem eles o card fica em nome + CRECI, que
 *    não dá a ninguém como escolher com quem falar.
 * 2. O WhatsApp é a conversão da página. Ele fica aqui, no card, e não só na
 *    página de dentro: mandar quem já decidiu abrir mais uma página só para
 *    achar o mesmo botão é um passo cobrado à toa.
 *
 * Como o card tem duas ações (abrir o perfil e chamar no WhatsApp), ele não é
 * um `<Link>` por fora — HTML não permite âncora dentro de âncora, e um
 * `onClick` no container deixaria o teclado de fora. O padrão é o do "stretched
 * link": o nome é o link real, o `after:absolute inset-0` estende a área
 * clicável dele por todo o card, e o botão de WhatsApp sobe num `z-10` para
 * ficar por cima dessa camada.
 */

type CardCorretorProps = {
  corretor: CorretorPerfil;
  /** Empreendimentos e cidades sob responsabilidade dele, quando apurados. */
  atuacao?: AtuacaoCorretor;
  /**
   * Linha enxuta (avatar + nome + CRECI), para a seção de equipe da home,
   * onde o card é uma chamada para `/corretores` e não o destino final.
   */
  compacto?: boolean;
};

/** "3 empreendimentos · Alphaville, Barueri" — o que ele acompanha hoje. */
function resumoAtuacao(atuacao?: AtuacaoCorretor) {
  if (!atuacao || atuacao.total === 0) return null;

  const contagem = `${atuacao.total} empreendimento${atuacao.total === 1 ? "" : "s"}`;
  // Mais de duas cidades não cabem na linha do card sem quebrar em duas
  // alturas diferentes entre um card e outro; o resto vira "+N".
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
        // Decorativa: o nome do corretor vem logo ao lado, em texto.
        alt=""
        width={tamanho}
        height={tamanho}
        className={`${classe} shrink-0 rounded-full object-cover ring-1 ring-linha/15`}
      />
    );
  }

  return (
    // `text-mist-50` literal, como o texto branco sobre botão da marca: as
    // iniciais vivem sobre um círculo de teal sólido, igual nos dois temas.
    <span
      aria-hidden
      className={`${classe} font-display from-brand-500 to-brand-700 flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-lg text-mist-50 ring-1 ring-linha/15`}
    >
      {iniciais(corretor.nome)}
    </span>
  );
}

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
            <p className="font-display group-hover:text-acento truncate text-lg text-titulo transition-colors">
              {corretor.nome}
            </p>
            <p className="text-fluid-sm text-legenda">CRECI {corretor.creci}</p>
          </div>

          <span
            aria-hidden
            className="group-hover:text-acento shrink-0 text-tenue transition-all group-hover:translate-x-0.5"
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

  return (
    <GlassSurface
      as="article"
      preset="card"
      className="group focus-within:ring-acento-forte/60 relative flex h-full flex-col gap-4 px-5 py-5 transition-transform duration-300 ease-[var(--ease-out-quart)] focus-within:ring-1 hover:-translate-y-0.5"
    >
      <div className="flex items-center gap-4">
        <Avatar corretor={corretor} tamanho={72} />

        <div className="min-w-0">
          {/* h2: o card completo é usado na vitrine da equipe, onde os cards
              são a primeira subdivisão sob o h1 da página. Pular para h3 abre
              um buraco na hierarquia que o leitor de tela anuncia. */}
          <h2 className="font-display text-fluid-lg text-titulo">
            <Link
              href={`/corretores/${corretor.slug}`}
              className="group-hover:text-acento transition-colors after:absolute after:inset-0"
            >
              {corretor.nome}
            </Link>
          </h2>
          <p className="text-fluid-sm text-legenda">CRECI {corretor.creci}</p>
        </div>
      </div>

      {/*
        `min-h` reservado mesmo sem atuação apurada: sem isso, um corretor sem
        empreendimento encolhe o card e a grade fica com alturas irregulares.

        A frase é sem pronome ("sob responsabilidade dele" não serve para uma
        equipe que é metade mulheres, e o cadastro não guarda gênero): número
        em destaque, cidades em seguida, que é também o que se lê mais rápido
        varrendo sete cards.
      */}
      <p className="text-fluid-sm min-h-10 text-apoio">
        {resumo ? (
          <>
            <span className="font-medium text-corpo">{resumo.contagem}</span> ·{" "}
            {resumo.cidades}
          </>
        ) : (
          <>Atende toda a região — de lançamento a pronto para morar.</>
        )}
      </p>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-linha/10 pt-4">
        <span
          aria-hidden
          className="text-fluid-sm group-hover:text-acento text-legenda transition-colors"
        >
          Ver perfil →
        </span>

        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          // Sobe acima da camada que o `after` do nome estende pelo card, senão
          // o clique no botão abriria o perfil.
          className="bg-brand-500 hover:bg-brand-400 relative z-10 flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium text-white transition-colors"
          aria-label={`Falar com ${corretor.nome} no WhatsApp`}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className="h-4 w-4">
            <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.45 1.27 4.9L2 22l5.25-1.38a9.96 9.96 0 0 0 4.79 1.22h.01c5.52 0 10-4.48 10-10s-4.48-9.84-10.01-9.84Zm5.85 14.1c-.25.7-1.45 1.34-2 1.42-.51.08-1.16.11-1.87-.12-.43-.14-.98-.32-1.69-.62-2.97-1.28-4.9-4.27-5.05-4.47-.15-.2-1.21-1.6-1.21-3.06s.77-2.17 1.04-2.47c.27-.3.6-.37.8-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.06 1.14 1.02 2.1 1.33 2.4 1.48.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.73.82 2.02.97.3.15.5.22.57.35.07.13.07.75-.18 1.45Z" />
          </svg>
          WhatsApp
        </a>
      </div>
    </GlassSurface>
  );
}
