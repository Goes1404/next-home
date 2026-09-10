import type { Metadata } from "next";
import Link from "next/link";
import { WhatsappLink } from "@/components/analytics/WhatsappLink";
import { FormularioContato } from "@/components/contato/FormularioContato";
import { CabecalhoDePagina } from "@/components/institucional/CabecalhoDePagina";
import { MapaDaSede } from "@/components/institucional/MapaDaSede";
import { Pagina } from "@/components/institucional/Pagina";
import { Secao } from "@/components/institucional/Secao";
import { WhatsappCta } from "@/components/layout/WhatsappCta";
import { Reveal } from "@/components/motion/Reveal";
import { getCorretorAtivo } from "@/lib/corretorAtivo";
import { getEmpreendimentos } from "@/lib/queries";
import { enderecoLinha, linkWhatsapp, linkWhatsappPara, site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Fale com a Next Home",
  description: `WhatsApp, formulário e atendimento presencial em Alphaville. ${enderecoLinha}.`,
  alternates: { canonical: "/contato" },
  openGraph: {
    title: `Contato | ${site.nomeCompleto}`,
    description:
      "Fale com os corretores por WhatsApp para simulações, visitas e as oportunidades da região.",
    url: `${site.url}/contato`,
  },
};

/** Os outros caminhos, para a página não ser um beco: quem chega aqui sem saber o que pedir sai com uma porta. */
const OUTROS_CAMINHOS = [
  {
    href: "/financiamento",
    titulo: "Quanto cabe no bolso",
    texto: "Simule a parcela e veja se entra no Minha Casa Minha Vida — sem cadastro.",
  },
  {
    href: "/anunciar-imovel",
    titulo: "Tem um imóvel para vender?",
    texto: "Avaliação de mercado e divulgação para quem já está procurando.",
  },
  {
    href: "/corretores",
    titulo: "Escolher com quem falar",
    texto: "Os perfis da equipe, com o que cada um acompanha hoje.",
  },
];

export default async function ContatoPage({
  searchParams,
}: {
  searchParams: Promise<{ empreendimento?: string }>;
}) {
  const [sp, empreendimentos, corretorAtivo] = await Promise.all([
    searchParams,
    getEmpreendimentos(),
    getCorretorAtivo(),
  ]);

  return (
    <>
      <Pagina>
        <Secao espaco="abertura">
          <CabecalhoDePagina
            atual="Contato"
            rotulo="WhatsApp, formulário e endereço"
            titulo="Fale com a gente"
            lead="O caminho mais curto é o WhatsApp: a conversa começa na hora, com um corretor da equipe. O formulário existe para quem prefere escrever com calma — e a resposta chega pelo canal que você indicar."
          />
        </Secao>

        <Secao espaco="final">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">
            <Reveal className="border-linha bg-superficie/50 rounded-2xl border p-5 sm:p-8">
              <h2 className="font-display text-titulo text-lg">Escrever uma mensagem</h2>
              <p className="text-fluid-sm text-apoio mt-1 mb-6">
                Diga o que procura. Se já tem um imóvel em mente, escolha-o na lista.
              </p>
              <FormularioContato
                empreendimentos={empreendimentos.map((e) => ({ slug: e.slug, nome: e.nome }))}
                empreendimentoPreselecionado={sp.empreendimento}
              />
            </Reveal>

            <div className="space-y-6">
              <Reveal delay={0.1} className="border-linha bg-superficie/50 rounded-2xl border p-5 sm:p-6">
                <h2 className="font-display text-titulo text-lg">WhatsApp</h2>
                <p className="text-fluid-sm text-apoio mt-1">
                  {corretorAtivo
                    ? `Você chegou pelo link de ${corretorAtivo.nome} — é com quem a conversa abre.`
                    : "Duas linhas da casa. Qualquer uma abre a conversa com a equipe."}
                </p>
                <ul className="mt-4 flex flex-wrap gap-3">
                  {corretorAtivo ? (
                    <li>
                      <WhatsappLink
                        href={linkWhatsappPara(
                          corretorAtivo.whatsapp,
                          `Olá, ${corretorAtivo.nome}! Vim pelo site.`,
                        )}
                        origem="contato"
                        corretorId={corretorAtivo.id}
                        className="bg-acento text-sobre-cor hover:bg-acento-hover inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-medium transition-colors"
                      >
                        Falar com {corretorAtivo.nome}
                      </WhatsappLink>
                    </li>
                  ) : (
                    site.whatsapp.map((w, i) => (
                      <li key={w.numero}>
                        <WhatsappLink
                          href={linkWhatsapp(undefined, i)}
                          origem="contato"
                          className="border-linha bg-superficie/60 text-corpo hover:border-acento-linha hover:text-acento-suave inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors"
                        >
                          <span aria-hidden className="bg-ok size-2 rounded-full" />
                          {w.label}
                        </WhatsappLink>
                      </li>
                    ))
                  )}
                </ul>

                <h2 className="font-display text-titulo mt-6 text-lg">Endereço</h2>
                <address className="text-fluid-sm text-apoio mt-2 not-italic">
                  <p className="text-corpo">{site.endereco.logradouro}</p>
                  <p>
                    {site.endereco.bairro}, {site.endereco.cidade}/{site.endereco.uf} · CEP{" "}
                    {site.endereco.cep}
                  </p>
                </address>
                <p className="text-fluid-xs text-tenue mt-3">CRECI {site.creci}</p>
              </Reveal>

              <Reveal delay={0.15} from="baixo">
                <MapaDaSede />
              </Reveal>
            </div>
          </div>

          <ul className="mt-12 grid gap-4 sm:grid-cols-3">
            {OUTROS_CAMINHOS.map((c, i) => (
              <Reveal key={c.href} as="li" delay={i * 0.08} from="baixo" className="h-full">
                <Link
                  href={c.href}
                  className="border-linha bg-superficie/50 hover:border-acento-linha group flex h-full flex-col rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-xl motion-reduce:transition-none"
                >
                  <span className="font-display text-titulo group-hover:text-acento-suave text-lg transition-colors">
                    {c.titulo}
                  </span>
                  <span className="text-fluid-sm text-apoio mt-2 text-pretty">{c.texto}</span>
                  <span
                    aria-hidden
                    className="text-acento-suave mt-auto pt-3 text-sm transition-transform group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </Link>
              </Reveal>
            ))}
          </ul>
        </Secao>
      </Pagina>

      <WhatsappCta corretor={corretorAtivo ?? undefined} />
    </>
  );
}
