import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Galeria } from "@/components/empreendimento/Galeria";
import { Tipologias } from "@/components/empreendimento/Tipologias";
import { Wordmark } from "@/components/ui/Wordmark";
import { precoAPartirDe } from "@/lib/format";
import { srcDaMidia } from "@/lib/imagens/variantes";
import { lerFichaPublica, linkDoWhatsappDaFicha } from "@/lib/imovelPublico/ficha";
import { STATUS_LABEL } from "@/lib/types";

/**
 * A ficha pública do imóvel de uma imobiliária SEM site próprio (21/10/2026).
 *
 * Abre em qualquer endereço (o `proxy.ts` a deixa fora do site e do
 * redirecionamento do endereço só do painel): é para onde vão a seleção de
 * imóveis do cliente e os links que a IA manda no WhatsApp quando o grupo
 * não tem endereço em `enderecos_do_site`. Mostra só imóvel PUBLICADO do
 * grupo da URL, com a marca dele, fora do Google. O botão de WhatsApp existe
 * só com `?c=<corretor>` ativo do mesmo grupo.
 */
type Params = { grupo: string; slug: string };
type Busca = { c?: string | string[] };

const unico = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Busca>;
}): Promise<Metadata> {
  const [{ grupo, slug }, busca] = await Promise.all([params, searchParams]);
  const ficha = await lerFichaPublica({ grupoSlug: grupo, imovelSlug: slug, corretorSlug: unico(busca.c) });
  const semIndexar = { index: false, follow: false } as const;
  if (!ficha) return { title: "Imóvel", robots: semIndexar };
  return {
    title: `${ficha.imovel.nome} · ${ficha.marca.nome}`,
    description: `${ficha.imovel.bairro}, ${ficha.imovel.cidade}.`,
    robots: semIndexar,
  };
}

export default async function FichaPublicaPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Busca>;
}) {
  const [{ grupo, slug }, busca] = await Promise.all([params, searchParams]);
  const ficha = await lerFichaPublica({ grupoSlug: grupo, imovelSlug: slug, corretorSlug: unico(busca.c) });
  if (!ficha) notFound();

  const { imovel: e, marca, corretor } = ficha;
  const whatsapp = linkDoWhatsappDaFicha(corretor, e.nome);

  return (
    <div className="flex min-h-dvh flex-col bg-fundo">
      <header className="mx-auto flex w-full max-w-6xl items-center px-4 py-4 sm:px-8">
        {marca.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo do grupo (URL pública do Storage), tamanho fixo pequeno
          <img src={marca.logoUrl} alt={marca.nome} className="block h-8 max-w-44 object-contain object-left" />
        ) : (
          <span className="font-display text-fluid-lg text-titulo">
            <Wordmark nomes={marca.wordmark} destaque="" />
          </span>
        )}
      </header>

      <main className="flex flex-1 flex-col">
        <div className="relative aspect-[4/3] max-h-[60vh] w-full overflow-hidden bg-black/10 sm:aspect-[16/7]">
          <Image src={srcDaMidia(e.capa)} alt={e.capa.alt || e.nome} fill priority sizes="100vw" className="object-cover" />
        </div>

        <section className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-8">
          <p className="text-fluid-xs tracking-[0.18em] text-apoio uppercase">{STATUS_LABEL[e.status] ?? e.status}</p>
          <h1 className="font-display text-titulo text-fluid-3xl mt-2">{e.nome}</h1>
          <p className="text-fluid-base mt-2 text-apoio">
            {e.bairro}, {e.cidade}
          </p>
          <p className="text-fluid-xl mt-4 font-medium text-titulo">{precoAPartirDe(e.precoAPartir)}</p>
          {e.tagline && <p className="text-fluid-lg mt-4 text-apoio">{e.tagline}</p>}

          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="botao-vivo mt-6 inline-flex min-h-12 items-center rounded-full bg-[#25D366] px-6 font-semibold text-white"
            >
              Falar com {corretor?.nome.trim().split(/\s+/)[0]} no WhatsApp
            </a>
          )}

          {e.descricao && <p className="text-fluid-base mt-8 whitespace-pre-line text-titulo">{e.descricao}</p>}

          {e.lazer.length > 0 && (
            <div className="mt-8">
              <h2 className="font-display text-titulo text-fluid-xl">Lazer</h2>
              <ul className="text-fluid-base mt-3 flex flex-wrap gap-2 text-apoio">
                {e.lazer.map((item) => (
                  <li key={item} className="rounded-full border border-current/20 px-3 py-1">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <Tipologias tipologias={e.tipologias} plantasGerais={e.plantas} contatoWhatsapp={whatsapp ?? undefined} />
        <Galeria fotos={e.galeria} />
      </main>
    </div>
  );
}
