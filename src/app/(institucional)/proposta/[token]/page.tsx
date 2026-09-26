import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { CabecalhoDePagina } from "@/components/institucional/CabecalhoDePagina";
import { Pagina } from "@/components/institucional/Pagina";
import { Secao } from "@/components/institucional/Secao";
import { lerLinkPublico } from "@/lib/crm/linkPublico";
import { lerProposta, propostaVencida, ultimaResposta } from "@/lib/crm/proposta";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { getEmpreendimentos } from "@/lib/queries";
import { linkWhatsappPara } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/service";
import { RespostaDaProposta } from "./RespostaDaProposta";

export const metadata: Metadata = {
  title: "Sua proposta",
  robots: { index: false, follow: false },
};

const dataLonga = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "long",
});

/**
 * A proposta que o corretor manda ao cliente (0123, 26/09/2026): imóvel,
 * unidade, valor, condição e validade, e duas respostas em um toque.
 * Não é contrato — a página diz isso, e a assinatura acontece com o
 * corretor.
 */
export default async function PropostaPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ previa?: string }>;
}) {
  const [{ token }, { previa }] = await Promise.all([params, searchParams]);
  const link = await lerLinkPublico(token, "proposta", { previa: previa === "1" });
  if (!link) notFound();
  const proposta = lerProposta(link.dados);
  if (!proposta) notFound();

  const [catalogo, { data: eventos }] = await Promise.all([
    proposta.empreendimentoId ? getEmpreendimentos().catch(() => []) : Promise.resolve([]),
    createServiceClient()
      .from("links_do_cliente_eventos")
      .select("tipo, created_at")
      .eq("token", token)
      .in("tipo", ["aceitou", "quer_conversar"]),
  ]);
  const imovel = catalogo.find((e) => e.id === proposta.empreendimentoId) ?? null;
  const vencida = propostaVencida(proposta);
  const primeiroCorretor = link.corretor.nome.trim().split(/\s+/)[0];
  const whatsapp = link.corretor.whatsapp
    ? linkWhatsappPara(
        link.corretor.whatsapp.replace(/\D/g, ""),
        `Oi, ${primeiroCorretor}! Vi a proposta do ${proposta.imovel} e quero conversar.`,
      )
    : null;

  return (
    <Pagina>
      <Secao espaco="abertura">
        <CabecalhoDePagina
          rotulo={`Preparada por ${link.corretor.nome}${link.corretor.creci ? ` · CRECI ${link.corretor.creci}` : ""}`}
          titulo={link.primeiroNome ? `${link.primeiroNome}, sua proposta` : "Sua proposta"}
          lead={`${proposta.imovel}${proposta.unidade ? ` · unidade ${proposta.unidade}` : ""}`}
        />
      </Secao>

      <Secao espaco="final">
        <div className="max-w-2xl space-y-6">
          {imovel && (
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl">
              <Image src={imovel.capa.url} alt={imovel.capa.alt} fill sizes="(min-width: 768px) 672px, 100vw" className="object-cover" />
            </div>
          )}

          <dl className="rounded-2xl border border-linha bg-superficie p-5 space-y-4">
            <div>
              <dt className="text-fluid-xs text-apoio">Valor total</dt>
              <dd className="font-display text-fluid-2xl text-titulo">{formatarMoedaBRL(proposta.valor)}</dd>
            </div>
            <div>
              <dt className="text-fluid-xs text-apoio">Condição</dt>
              <dd className="text-fluid-base text-corpo whitespace-pre-line break-words">{proposta.condicao}</dd>
            </div>
            <div>
              <dt className="text-fluid-xs text-apoio">Válida até</dt>
              <dd className="text-fluid-base text-corpo">
                {dataLonga.format(new Date(proposta.validaAte))}
                {vencida ? " — venceu" : ""}
              </dd>
            </div>
          </dl>

          {vencida ? (
            <p className="text-fluid-base text-apoio">
              Esta proposta venceu. Fale com {primeiroCorretor} para receber uma atualizada.
            </p>
          ) : (
            <RespostaDaProposta token={token} inicial={ultimaResposta(eventos ?? [])} previa={previa === "1"} />
          )}

          <p className="text-fluid-xs text-tenue">
            Esta proposta não é contrato. Valores e condições dependem da aprovação do crédito e da disponibilidade
            da unidade; a formalização acontece com seu corretor.
          </p>

          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="botao-vivo inline-flex min-h-12 items-center rounded-full bg-[#25D366] px-6 font-semibold text-white"
            >
              Falar com {primeiroCorretor} no WhatsApp
            </a>
          )}
        </div>
      </Secao>
    </Pagina>
  );
}
