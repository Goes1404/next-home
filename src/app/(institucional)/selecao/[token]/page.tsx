import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardEmpreendimento } from "@/components/empreendimento/CardEmpreendimento";
import { Simulador } from "@/components/financiamento/Simulador";
import { CabecalhoDePagina } from "@/components/institucional/CabecalhoDePagina";
import { Pagina } from "@/components/institucional/Pagina";
import { Secao } from "@/components/institucional/Secao";
import { getParametrosCredito } from "@/lib/credito/parametros";
import { lerLinkPublico } from "@/lib/crm/linkPublico";
import { getEmpreendimentos } from "@/lib/queries";
import { linkWhatsappPara } from "@/lib/site";

/** Link pessoal: fora do Google, sempre. */
export const metadata: Metadata = {
  title: "Sua seleção de imóveis",
  robots: { index: false, follow: false },
};

/**
 * A seleção personalizada que o corretor manda ao cliente (26/09/2026).
 *
 * Os imóveis que mais combinam com o que ele contou, o simulador (a MESMA
 * conta do site e do consultor) e o WhatsApp do corretor dele. Nada do CRM
 * aparece além do primeiro nome: o link pode ser encaminhado para quem
 * decide junto, e é para isso que ele serve.
 */
export default async function SelecaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ previa?: string }>;
}) {
  const [{ token }, { previa }] = await Promise.all([params, searchParams]);
  const link = await lerLinkPublico(token, "selecao", { previa: previa === "1" });
  if (!link) notFound();

  const ids = Array.isArray(link.dados.empreendimentos) ? (link.dados.empreendimentos as string[]) : [];
  const [catalogo, parametros] = await Promise.all([getEmpreendimentos(), getParametrosCredito()]);
  // Na ordem da seleção; imóvel despublicado depois sai sem deixar buraco.
  const imoveis = ids
    .map((id) => catalogo.find((e) => e.id === id))
    .filter((e): e is NonNullable<typeof e> => Boolean(e));

  const primeiroCorretor = link.corretor.nome.trim().split(/\s+/)[0];
  const whatsapp = link.corretor.whatsapp
    ? linkWhatsappPara(
        link.corretor.whatsapp.replace(/\D/g, ""),
        `Oi, ${primeiroCorretor}! Vi a seleção de imóveis que você me mandou e quero conversar.`,
      )
    : null;

  return (
    <Pagina>
      <Secao espaco="abertura">
        <CabecalhoDePagina
          rotulo={`Separado por ${link.corretor.nome}${link.corretor.creci ? ` · CRECI ${link.corretor.creci}` : ""}`}
          titulo={link.primeiroNome ? `${link.primeiroNome}, estes combinam com você` : "Estes imóveis combinam com você"}
          lead="Escolhidos pelo que você contou que procura. Veja as fotos, simule o financiamento e me chame quando quiser visitar."
        />
      </Secao>

      <Secao>
        {imoveis.length === 0 ? (
          <p className="text-fluid-base text-apoio">
            Os imóveis desta seleção saíram do catálogo. Fale com {primeiroCorretor} para uma seleção nova.
          </p>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {imoveis.map((e, i) => (
              <li key={e.slug}>
                <CardEmpreendimento
                  empreendimento={e}
                  prioridade={i === 0}
                  nivel="h2"
                  href={`/selecao/${token}/ir/${e.slug}${previa === "1" ? "?previa=1" : ""}`}
                />
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao espaco="final" banda>
        <h2 className="font-display text-titulo text-fluid-2xl">Quanto cabe no seu bolso</h2>
        <p className="text-fluid-base text-apoio mt-2 max-w-xl">
          A mesma conta que o banco faz, com as regras públicas de crédito. É uma estimativa:
          quem aprova é o banco.
        </p>
        <div className="mt-6">
          <Simulador
            parametros={parametros}
            whatsapp={whatsapp}
            valorInicial={imoveis.find((e) => e.precoAPartir)?.precoAPartir ?? null}
          />
        </div>
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="botao-vivo mt-8 inline-flex min-h-12 items-center rounded-full bg-[#25D366] px-6 font-semibold text-white"
          >
            Falar com {primeiroCorretor} no WhatsApp
          </a>
        )}
      </Secao>
    </Pagina>
  );
}
