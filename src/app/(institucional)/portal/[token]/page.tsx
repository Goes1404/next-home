import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { CabecalhoDePagina } from "@/components/institucional/CabecalhoDePagina";
import { Pagina } from "@/components/institucional/Pagina";
import { Secao } from "@/components/institucional/Secao";
import { lerLinkPublico } from "@/lib/crm/linkPublico";
import { marcosDoComprador, ultimoPercentual } from "@/lib/crm/portalDoComprador";
import { getEmpreendimentos } from "@/lib/queries";
import { linkWhatsappPara } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/service";
import { STATUS_LABEL } from "@/lib/types";

export const metadata: Metadata = {
  title: "Acompanhe sua compra",
  robots: { index: false, follow: false },
};

const dataLonga = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" });

/**
 * Portal do comprador (0125): o link fixo que o corretor manda depois da
 * venda. Lido pelo servidor com a chave de serviço, como todo link do
 * cliente — o token é a credencial. Mostra só o que é do próprio cliente e
 * o andamento público da obra; nunca valores.
 */
export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ previa?: string }>;
}) {
  const [{ token }, { previa }] = await Promise.all([params, searchParams]);
  const link = await lerLinkPublico(token, "portal", { previa: previa === "1" });
  if (!link) notFound();

  const supabase = createServiceClient();
  const [{ data: lead }, { data: vendas }, { data: documentos }] = await Promise.all([
    supabase.from("leads").select("etapa, empreendimento_id, imovel_interesse_id").eq("id", link.leadId).maybeSingle(),
    supabase
      .from("vendas")
      .select("empreendimento_id, imovel_descricao, unidade, data_venda")
      .eq("lead_id", link.leadId)
      .eq("status", "ativa")
      .order("data_venda", { ascending: false })
      .limit(1),
    supabase.from("lead_documentos").select("item").eq("lead_id", link.leadId),
  ]);
  if (!lead) notFound();
  const venda = vendas?.[0] ?? null;
  const empreendimentoId = venda?.empreendimento_id ?? lead.imovel_interesse_id ?? lead.empreendimento_id;
  const catalogo = empreendimentoId ? await getEmpreendimentos().catch(() => []) : [];
  const imovel = catalogo.find((e) => e.id === empreendimentoId) ?? null;
  const { data: atualizacoes } = empreendimentoId
    ? await supabase
        .from("obra_atualizacoes")
        .select("id, titulo, texto, percentual, foto_url, created_at")
        .eq("empreendimento_id", empreendimentoId)
        .order("created_at", { ascending: false })
        .limit(20)
    : { data: [] };

  const percentual = ultimoPercentual(atualizacoes ?? []);
  const marcos = marcosDoComprador({
    etapa: lead.etapa,
    documentosEnviados: documentos?.length ?? 0,
    dataVenda: venda?.data_venda ?? null,
    statusObra: imovel?.status ?? null,
    entregaPrevista: imovel?.entregaPrevista ?? null,
    percentualObra: percentual,
  });
  const nomeImovel = imovel?.nome ?? venda?.imovel_descricao ?? "Seu imóvel";
  const primeiroCorretor = link.corretor.nome.trim().split(/\s+/)[0];
  const whatsapp = link.corretor.whatsapp
    ? linkWhatsappPara(link.corretor.whatsapp.replace(/\D/g, ""), `Oi, ${primeiroCorretor}! Estou no meu portal do ${nomeImovel} e tenho uma dúvida.`)
    : null;
  const itensRecebidos = [...new Set((documentos ?? []).map((d) => d.item))];

  return (
    <Pagina>
      <Secao espaco="abertura">
        <CabecalhoDePagina
          rotulo={`Acompanhado por ${link.corretor.nome}${link.corretor.creci ? ` · CRECI ${link.corretor.creci}` : ""}`}
          titulo={link.primeiroNome ? `${link.primeiroNome}, sua compra` : "Sua compra"}
          lead={`${nomeImovel}${venda?.unidade ? ` · unidade ${venda.unidade}` : ""}${imovel ? ` · ${STATUS_LABEL[imovel.status]}` : ""}`}
        />
      </Secao>

      <Secao espaco="final">
        <div className="max-w-2xl space-y-8">
          {imovel && (
            <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl">
              <Image src={imovel.capa.url} alt={imovel.capa.alt} fill sizes="(min-width: 768px) 672px, 100vw" className="object-cover" />
            </div>
          )}

          <section aria-labelledby="marcos">
            <h2 id="marcos" className="text-fluid-xl font-display text-titulo">
              Até as chaves
            </h2>
            <ol className="mt-4 space-y-3">
              {marcos.map((m) => (
                <li key={m.titulo} className="flex items-start gap-3 rounded-2xl border border-linha bg-superficie p-4">
                  <span
                    aria-hidden
                    className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      m.feito ? "bg-acento text-sobre-cor" : "border border-linha-forte text-tenue"
                    }`}
                  >
                    {m.feito ? <Check className="h-4 w-4" /> : null}
                  </span>
                  <div className="min-w-0">
                    <p className="text-fluid-base font-semibold text-titulo">
                      {m.titulo}
                      <span className="sr-only">{m.feito ? " — concluído" : " — pendente"}</span>
                    </p>
                    <p className="text-fluid-sm text-apoio">{m.detalhe}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {percentual != null && (
            <section aria-label="Andamento da obra">
              <div className="flex items-baseline justify-between">
                <p className="text-fluid-sm font-semibold text-titulo">Obra</p>
                <p className="text-fluid-sm text-apoio">{percentual}%</p>
              </div>
              <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-vidro" role="progressbar" aria-valuenow={percentual} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-acento" style={{ width: `${percentual}%` }} />
              </div>
            </section>
          )}

          <section aria-labelledby="novidades">
            <h2 id="novidades" className="text-fluid-xl font-display text-titulo">
              Novidades da obra
            </h2>
            {(atualizacoes ?? []).length === 0 ? (
              <p className="text-fluid-sm mt-2 text-apoio">
                Ainda não há atualizações. Quando {primeiroCorretor} publicar uma, ela aparece aqui.
              </p>
            ) : (
              <ul className="mt-4 space-y-4">
                {(atualizacoes ?? []).map((a) => (
                  <li key={a.id} className="rounded-2xl border border-linha bg-superficie p-4">
                    <p className="text-fluid-xs text-tenue">{dataLonga.format(new Date(a.created_at))}</p>
                    <p className="text-fluid-base mt-1 font-semibold break-words text-titulo">{a.titulo}</p>
                    {a.texto && <p className="text-fluid-sm mt-1 whitespace-pre-line break-words text-corpo">{a.texto}</p>}
                    {a.foto_url && (
                      <div className="relative mt-3 aspect-[4/3] w-full overflow-hidden rounded-xl">
                        <Image src={a.foto_url} alt={a.titulo} fill sizes="(min-width: 768px) 640px, 100vw" className="object-cover" />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {itensRecebidos.length > 0 && (
            <section aria-labelledby="documentos">
              <h2 id="documentos" className="text-fluid-xl font-display text-titulo">
                Documentos recebidos
              </h2>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-fluid-sm text-corpo">
                {itensRecebidos.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </section>
          )}

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
