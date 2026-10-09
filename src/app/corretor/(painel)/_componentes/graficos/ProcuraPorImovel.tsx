import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { janelaDeDias } from "@/lib/admin/janelaDeDias";
import { procuraPorImovel, type LinhaDeImovel } from "@/lib/graficos/calculos";
import { CartaoDeGrafico, GraficoVazio } from "./Moldura";

const DIAS = 90;
/** Os mais procurados; o resto vira uma frase, não trinta linhas. */
const TETO = 8;

/**
 * "O que vende e o que encalha?" (28/09/2026) — na tela de Imóveis.
 *
 * Leads, visitas e vendas por empreendimento nos últimos 90 dias, cada
 * coluna na sua escala. O lead conta pelo imóvel de interesse (o que ele
 * está conversando) ou, sem ele, pelo que o trouxe — uma vez só.
 *
 * O que NÃO aparece também decide: imóvel publicado sem nenhum lead no
 * período é candidato a anúncio ou a sair da vitrine, e o rodapé conta
 * quantos são.
 */
export async function ProcuraPorImovel({
  imoveis,
}: {
  imoveis: { id: string; nome: string; slug: string; publicado: boolean; foto: string | null }[];
}) {
  const supabase = await createClient();
  const { corte, corteDia } = janelaDeDias(DIAS);
  const [{ data: leads }, { data: vendas }] = await Promise.all([
    supabase
      .from("leads")
      .select("empreendimento_id, imovel_interesse_id, etapa, visita_agendada_em")
      .is("arquivado_em", null)
      .gte("created_at", corte.toISOString()),
    supabase.from("vendas").select("empreendimento_id").eq("status", "ativa").gte("data_venda", corteDia),
  ]);

  const publicados = imoveis.filter((i) => i.publicado);
  const linhas = procuraPorImovel(
    publicados,
    (leads ?? []).map((l) => ({
      empreendimentoId: l.empreendimento_id,
      imovelInteresseId: l.imovel_interesse_id,
      etapa: l.etapa,
      visitaAgendadaEm: l.visita_agendada_em,
    })),
    (vendas ?? []).map((v) => ({ empreendimentoId: v.empreendimento_id })),
  );
  const comProcura = linhas.filter((l) => l.leads > 0 || l.vendas > 0);
  const semProcura = linhas.length - comProcura.length;

  return (
    <ProcuraVisual
      comProcura={comProcura.map((l) => ({ ...l, foto: publicados.find((i) => i.id === l.id)?.foto ?? null }))}
      semProcura={semProcura}
      corteDia={corteDia}
    />
  );
}

export function ProcuraVisual({
  comProcura,
  semProcura,
  corteDia,
}: {
  comProcura: (LinhaDeImovel & { foto: string | null })[];
  semProcura: number;
  corteDia: string;
}) {
  const maxLeads = Math.max(1, ...comProcura.map((l) => l.leads));

  return (
    <CartaoDeGrafico
      titulo="Os imóveis mais procurados"
      subtitulo={`Últimos ${DIAS} dias. A barra é quantos leads cada um trouxe; ao lado, quantos visitaram e compraram.`}
      rodape={
        comProcura.length > 0 && semProcura > 0
          ? `${semProcura} ${semProcura === 1 ? "imóvel publicado não teve" : "imóveis publicados não tiveram"} nenhum lead no período: vale anunciar ou rever a ficha.`
          : undefined
      }
    >
      {comProcura.length === 0 ? (
        <GraficoVazio texto="Quando os leads chegarem com o imóvel de interesse, aqui aparece o que vende e o que encalha." />
      ) : (
        <ol aria-label={`Leads, visitas e vendas por imóvel nos últimos ${DIAS} dias`} className="space-y-1">
          {comProcura.slice(0, TETO).map((l, i) => {
            const foto = l.foto;
            return (
              <li key={l.id}>
                <Link
                  href={`/corretor/leads?empreendimento=${l.id}&de=${corteDia}`}
                  title={`${l.nome}: ${l.leads} leads, ${l.visitas} visitas, ${l.vendas} vendas`}
                  className="hover:bg-vidro active:bg-vidro-forte -mx-2 flex min-h-11 items-center gap-3 rounded-xl px-2 py-2 transition-colors linha-abre"
                >
                  <span className="bg-vidro-forte relative size-12 shrink-0 overflow-hidden rounded-lg">
                    {foto ? (
                      <Image src={foto} alt="" fill sizes="48px" className="object-cover" />
                    ) : null}
                    <span className="bg-fundo/85 text-titulo absolute top-0.5 left-0.5 rounded-md px-1 text-[11px] leading-4 font-bold tabular-nums">
                      {i + 1}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="text-fluid-sm text-titulo block truncate font-medium">{l.nome}</span>
                    <span className="mt-1.5 flex items-center gap-2">
                      <span aria-hidden className="bg-vidro-forte h-2 flex-1 overflow-hidden rounded-full">
                        <span
                          className="bg-acento block h-full rounded-full"
                          style={{ width: `${l.leads > 0 ? Math.max(4, Math.round((l.leads / maxLeads) * 100)) : 0}%` }}
                        />
                      </span>
                      <span className="text-fluid-xs text-titulo w-16 shrink-0 text-right font-semibold tabular-nums">
                        {l.leads} {l.leads === 1 ? "lead" : "leads"}
                      </span>
                    </span>
                  </span>
                  <span className="hidden shrink-0 gap-1.5 sm:flex">
                    <Pilula valor={l.visitas} rotulo={l.visitas === 1 ? "visita" : "visitas"} />
                    <Pilula valor={l.vendas} rotulo={l.vendas === 1 ? "venda" : "vendas"} forte />
                  </span>
                </Link>
                <p className="text-fluid-xs text-apoio pl-[3.75rem] sm:hidden">
                  {l.visitas} {l.visitas === 1 ? "visita" : "visitas"} · {l.vendas} {l.vendas === 1 ? "venda" : "vendas"}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </CartaoDeGrafico>
  );
}

function Pilula({ valor, rotulo, forte = false }: { valor: number; rotulo: string; forte?: boolean }) {
  const ativa = valor > 0;
  return (
    <span
      className={`text-fluid-xs rounded-full border px-2.5 py-1 tabular-nums ${
        ativa && forte
          ? "bg-acento text-sobre-cor border-transparent font-semibold"
          : ativa
            ? "bg-acento-lavado text-acento-forte border-acento-linha font-semibold"
            : "border-linha text-tenue"
      }`}
    >
      {valor} {rotulo}
    </span>
  );
}
