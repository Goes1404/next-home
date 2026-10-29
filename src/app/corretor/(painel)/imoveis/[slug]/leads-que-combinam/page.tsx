import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { recursosDeImoveis } from "@/lib/grupos/ramo";
import { getEmpreendimentoDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { nomeParaExibir } from "@/lib/leads/nomeExibido";
import { ETAPA_LABEL, type EtapaFunil } from "@/lib/types";
import { lerLeadsQueCombinam } from "../../_componentes/lerLeadsQueCombinam";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const imovel = await getEmpreendimentoDoPainel(slug);
  return { title: imovel ? `Leads que combinam com ${imovel.nome}` : "Leads que combinam" };
}

/**
 * "Leads que combinam com <imóvel>" (29/10/2026): a lista inteira, com os
 * motivos, da carteira do corretor da sessão — cada um vê só os próprios
 * leads, inclusive o gestor. É para onde leva o aviso no celular quando um
 * imóvel é publicado ou atualizado (`avisoDeMatch.ts`).
 *
 * Mandar o imóvel é sempre gesto do corretor: a lista leva à ficha (vitrine
 * pelo próprio WhatsApp) ou à campanha com os leads marcados, que passa pelas
 * travas de envio. Nada aqui dispara mensagem.
 */
export default async function LeadsQueCombinamPage({ params }: Props) {
  const { slug } = await params;
  const corretor = await getCorretorLogado();
  if (!corretor || !recursosDeImoveis(corretor.ramo)) notFound();
  const imovel = await getEmpreendimentoDoPainel(slug);
  if (!imovel) notFound();

  const combinam = (await lerLeadsQueCombinam(imovel)) ?? [];
  const ativos = combinam.filter((l) => l.etapa !== "perdido");
  const perdidos = combinam.length - ativos.length;
  const campanha = new URLSearchParams({ imovel: imovel.slug, leads: ativos.map((l) => l.id).join(",") });

  return (
    <div className="space-y-4">
      <Link
        href={`/corretor/imoveis/${imovel.slug}`}
        className="text-fluid-xs text-apoio hover:text-titulo inline-flex min-h-11 items-center px-3 botao-secundario"
      >
        ← {imovel.nome}
      </Link>
      <CabecalhoDeTela
        secao="Imóveis"
        titulo={`Leads que combinam com ${imovel.nome}`}
        descricao="Da sua carteira, pelo que cada lead disse que procura: região, dormitórios, orçamento e pressa."
      />

      {ativos.length === 0 ? (
        <p className="cartao p-4 text-fluid-sm text-apoio">
          Nenhum lead ativo da sua carteira combina com este imóvel
          {perdidos > 0 ? ` (${perdidos} perdido${perdidos > 1 ? "s" : ""} combina${perdidos > 1 ? "m" : ""}; dá para reabrir no editor do imóvel)` : ""}.
        </p>
      ) : (
        <section className="cartao p-4 sm:p-5 space-y-3">
          <ol className="divide-y divide-linha">
            {ativos.map((l) => (
              <li key={l.id} className="py-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 min-w-0">
                <Link
                  href={`/corretor/leads/${l.id}`}
                  className="min-h-11 flex items-center font-semibold text-titulo min-w-0 break-words link-acao"
                >
                  {nomeParaExibir(l)}
                </Link>
                <span className="text-fluid-xs text-apoio">{ETAPA_LABEL[l.etapa as EtapaFunil] ?? l.etapa}</span>
                <span className="basis-full text-fluid-xs text-corpo break-words">{l.match.motivos.join(" · ")}</span>
              </li>
            ))}
          </ol>
          {imovel.publicado !== false && (
            <Link
              href={`/corretor/campanhas?${campanha.toString()}`}
              className="botao-vivo min-h-11 inline-flex items-center justify-center rounded-xl bg-acento hover:bg-acento-hover px-4 text-fluid-xs font-bold text-sobre-cor"
            >
              Mandar este imóvel para {ativos.length === 1 ? "ele" : `os ${ativos.length}`}
            </Link>
          )}
        </section>
      )}
    </div>
  );
}
