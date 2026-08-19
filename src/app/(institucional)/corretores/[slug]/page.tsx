import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardEmpreendimento } from "@/components/empreendimento/CardEmpreendimento";
import { GlassSurface } from "@/components/glass/GlassSurface";
import { Reveal } from "@/components/motion/Reveal";
import { iniciais, telefoneBR } from "@/lib/format";
import { getCorretorPorSlug, getEmpreendimentosPorCorretor } from "@/lib/queries";
import { linkWhatsappPara, site } from "@/lib/site";
import type { CorretorPerfil, Empreendimento } from "@/lib/types";

type Params = { slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const corretor = await getCorretorPorSlug(slug);
  if (!corretor) return { title: "Corretor não encontrado" };

  // Sem pronome nem "corretor/corretora": o cadastro não guarda gênero e
  // metade da equipe é de mulheres.
  const description = `${corretor.nome} atende pela ${site.nomeCompleto} — CRECI ${corretor.creci}. Atuação em ${site.regioes.join(", ")}.`;

  return {
    title: corretor.nome,
    description,
    alternates: { canonical: `/corretores/${corretor.slug}` },
    // Sem foto cadastrada não há o que compartilhar: omitir `images` deixa o
    // Open Graph cair na imagem padrão do site, melhor que um card vazio.
    openGraph: {
      type: "profile",
      title: `${corretor.nome} — ${site.nome}`,
      description,
      url: `${site.url}/corretores/${corretor.slug}`,
      ...(corretor.fotoUrl ? { images: [{ url: corretor.fotoUrl }] } : {}),
    },
  };
}

/** Cidades onde ele tem empreendimento hoje, sem repetição. */
function cidadesDe(empreendimentos: Empreendimento[]): string[] {
  return [...new Set(empreendimentos.map((e) => e.cidade))].sort();
}

/**
 * Texto de apresentação.
 *
 * A `bio` é preenchida pelo próprio corretor no painel e, hoje, nenhum dos
 * perfis tem uma. Sem um substituto, a página abre com um painel de vidro
 * praticamente vazio — nome, CRECI e dois botões —, que é o oposto do que uma
 * página de apresentação precisa fazer. O texto abaixo é montado do que o
 * banco já sabe: quantos empreendimentos ele acompanha e onde.
 */
function apresentacao(corretor: CorretorPerfil, empreendimentos: Empreendimento[]) {
  if (corretor.bio) return corretor.bio;

  const cidades = cidadesDe(empreendimentos);
  const primeiroNome = corretor.nome.split(" ")[0];

  if (empreendimentos.length === 0) {
    return `${primeiroNome} atende pela ${site.nomeCompleto}, com CRECI ${corretor.creci} e atuação em ${site.regioes.slice(0, 3).join(", ")} e região. Chame no WhatsApp e conte o que você procura.`;
  }

  const onde =
    cidades.length === 1
      ? cidades[0]
      : `${cidades.slice(0, -1).join(", ")} e ${cidades.at(-1)}`;

  return `${primeiroNome} acompanha ${empreendimentos.length} empreendimento${empreendimentos.length === 1 ? "" : "s"} em ${onde}, do primeiro contato à entrega das chaves.`;
}

/**
 * Página do corretor — o "microsite de agente" que a RE/MAX usa, adaptado ao
 * porte da Next Home: quem é, o que ele acompanha hoje, e dois caminhos para
 * falar com ele.
 *
 * O cabeçalho é de duas colunas a partir de `sm`: centralizado, o bloco
 * inteiro (avatar + nome + texto + botões) empurra a lista de empreendimentos
 * para baixo da dobra em desktop, e a lista é justamente a prova de que ele
 * trabalha — o que mais convence alguém a chamar.
 *
 * O botão "Ver portfólio completo" leva ao mesmo link pessoal que ele copia no
 * painel (`/portfolio?corretor=<slug>`): a partir dali, todo CTA do site passa
 * a apontar para o WhatsApp dele, mesmo em imóveis de outro responsável.
 */
export default async function CorretorPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const corretor = await getCorretorPorSlug(slug);
  if (!corretor) notFound();

  const empreendimentos = await getEmpreendimentosPorCorretor(corretor.id);
  const primeiroNome = corretor.nome.split(" ")[0];
  const whatsapp = linkWhatsappPara(
    corretor.whatsapp,
    `Olá, ${corretor.nome}! Vim pelo site da Next Home e quero falar com você.`,
  );
  const cidades = cidadesDe(empreendimentos);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "RealEstateAgent",
    name: corretor.nome,
    jobTitle: "Corretor de imóveis",
    identifier: `CRECI ${corretor.creci}`,
    telephone: `+${corretor.whatsapp}`,
    url: `${site.url}/corretores/${corretor.slug}`,
    ...(corretor.fotoUrl ? { image: corretor.fotoUrl } : {}),
    worksFor: {
      "@type": "RealEstateAgent",
      name: site.nomeCompleto,
      url: site.url,
    },
    areaServed: (cidades.length > 0 ? cidades : [...site.regioes]).map((nome) => ({
      "@type": "Place",
      name: nome,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        // Nome e bio vêm do cadastro que o próprio corretor edita no painel,
        // então o `<` é escapado antes de entrar no HTML — a recomendação da
        // documentação do Next para JSON-LD com conteúdo de terceiros.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <main className="flex flex-1 flex-col px-4 pt-28 pb-24">
        {/* No topo, não só no rodapé: quem entra pela busca do Google cai
            direto aqui e precisa de um caminho para o resto da equipe sem ter
            de rolar a página inteira. */}
        <nav aria-label="Trilha" className="mx-auto w-full max-w-5xl">
          <Link
            href="/corretores"
            className="text-fluid-sm hover:text-acento inline-flex items-center gap-1.5 text-legenda transition-colors"
          >
            <span aria-hidden>←</span> Toda a equipe
          </Link>
        </nav>

        <Reveal className="mx-auto mt-4 w-full max-w-5xl">
          <GlassSurface preset="painel" className="px-6 py-8 sm:px-10 sm:py-10">
            <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-start sm:gap-8 sm:text-left">
              {corretor.fotoUrl ? (
                <Image
                  src={corretor.fotoUrl}
                  // Decorativa: o nome vem em seguida, no h1.
                  alt=""
                  width={128}
                  height={128}
                  priority
                  className="h-28 w-28 shrink-0 rounded-full object-cover ring-1 ring-linha/15 sm:h-32 sm:w-32"
                />
              ) : (
                <span
                  aria-hidden
                  className="font-display from-brand-500 to-brand-700 flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-3xl text-mist-50 ring-1 ring-linha/15 sm:h-32 sm:w-32"
                >
                  {iniciais(corretor.nome)}
                </span>
              )}

              <div className="min-w-0 flex-1">
                <h1 className="text-fluid-2xl text-titulo">{corretor.nome}</h1>
                <p className="text-fluid-sm mt-1.5 text-legenda">
                  Equipe Next Home · CRECI {corretor.creci}
                </p>

                {cidades.length > 0 && (
                  <ul className="mt-4 flex flex-wrap justify-center gap-2 sm:justify-start">
                    {cidades.map((cidade) => (
                      <li
                        key={cidade}
                        className="text-fluid-xs border-brand-300/25 bg-brand-500/10 text-acento rounded-full border px-3 py-1"
                      >
                        {cidade}
                      </li>
                    ))}
                  </ul>
                )}

                <p className="text-fluid-base mt-5 whitespace-pre-line text-apoio">
                  {apresentacao(corretor, empreendimentos)}
                </p>

                <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-brand-500 hover:bg-brand-400 inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-sm font-medium text-white transition-colors"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden
                      className="h-4 w-4"
                    >
                      <path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.45 1.27 4.9L2 22l5.25-1.38a9.96 9.96 0 0 0 4.79 1.22h.01c5.52 0 10-4.48 10-10s-4.48-9.84-10.01-9.84Zm5.85 14.1c-.25.7-1.45 1.34-2 1.42-.51.08-1.16.11-1.87-.12-.43-.14-.98-.32-1.69-.62-2.97-1.28-4.9-4.27-5.05-4.47-.15-.2-1.21-1.6-1.21-3.06s.77-2.17 1.04-2.47c.27-.3.6-.37.8-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.06 1.14 1.02 2.1 1.33 2.4 1.48.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.73.82 2.02.97.3.15.5.22.57.35.07.13.07.75-.18 1.45Z" />
                    </svg>
                    Falar com {primeiroNome}
                  </a>

                  <Link
                    href={`/portfolio?corretor=${corretor.slug}`}
                    className="hover:border-brand-300/50 hover:text-acento inline-flex h-12 items-center justify-center rounded-full border border-linha/20 px-7 text-sm font-medium text-corpo transition-colors"
                  >
                    Ver portfólio completo
                  </Link>
                </div>

                {/* Para quem prefere salvar o contato a abrir a conversa agora. */}
                <p className="text-fluid-sm mt-4 text-legenda">
                  WhatsApp {telefoneBR(corretor.whatsapp)}
                </p>
              </div>
            </div>
          </GlassSurface>
        </Reveal>

        {empreendimentos.length > 0 && (
          <section className="mx-auto mt-20 w-full max-w-5xl">
            <Reveal>
              <h2 className="text-fluid-2xl text-titulo">
                Acompanhados por {primeiroNome}
              </h2>
              <p className="text-fluid-base mt-3 text-apoio">
                {empreendimentos.length} empreendimento
                {empreendimentos.length === 1 ? "" : "s"} sob responsabilidade direta.
              </p>
            </Reveal>

            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {empreendimentos.map((e, i) => (
                <Reveal key={e.slug} delay={i * 0.06} from="baixo">
                  <CardEmpreendimento empreendimento={e} prioridade={i < 3} />
                </Reveal>
              ))}
            </div>
          </section>
        )}
      </main>
    </>
  );
}
