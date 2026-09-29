import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CabecalhoDePagina } from "@/components/institucional/CabecalhoDePagina";
import { Pagina } from "@/components/institucional/Pagina";
import { Secao } from "@/components/institucional/Secao";
import { resumoDoEspelho, type UnidadeDoEspelho } from "@/lib/crm/espelhoDeVendas";
import { precoAPartirDe } from "@/lib/format";
import { site } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/service";
import { STATUS_LABEL, type StatusObra } from "@/lib/types";
import { IndicarCliente } from "./IndicarCliente";

export const metadata: Metadata = {
  title: "Espelho de vendas",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Espelho de vendas para corretores parceiros (0125). O token é a
 * credencial; suspender o parceiro no painel derruba o acesso na hora.
 * Mostra estoque e preço de tabela — o que um parceiro precisa para
 * oferecer —, nunca dados de cliente.
 */
export default async function EspelhoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID.test(token)) notFound();
  const supabase = createServiceClient();
  const { data: parceiro } = await supabase.from("parceiros").select("nome, ativo").eq("token", token).maybeSingle();
  if (!parceiro || !parceiro.ativo) notFound();

  const { data: imoveis } = await supabase
    .from("empreendimentos")
    .select("id, nome, slug, bairro, cidade, status, preco_a_partir, unidades(identificacao, status, dormitorios, area_m2, andar)")
    .eq("publicado", true)
    .order("nome", { ascending: true });

  const lista = (imoveis ?? []).map((e) => ({ ...e, resumo: resumoDoEspelho(((e.unidades ?? []) as unknown) as UnidadeDoEspelho[]) }));

  return (
    <Pagina>
      <Secao espaco="abertura">
        <CabecalhoDePagina
          rotulo={`Parceiro: ${parceiro.nome}`}
          titulo="Espelho de vendas"
          lead={`Imóveis e unidades disponíveis da ${site.nome}, atualizados em tempo real.`}
        />
      </Secao>
      <Secao espaco="final">
        <div className="space-y-8">
          <ul className="grid gap-4 md:grid-cols-2">
            {lista.map((e) => (
              <li key={e.id} className="space-y-2 rounded-2xl border border-linha-forte bg-superficie p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/empreendimentos/${e.slug}`} className="text-fluid-base font-semibold break-words text-titulo underline-offset-4 hover:underline">
                    {e.nome}
                  </Link>
                  <span className="text-fluid-xs text-apoio">{STATUS_LABEL[e.status as StatusObra]}</span>
                </div>
                <p className="text-fluid-xs text-apoio">
                  {e.bairro}, {e.cidade} · {precoAPartirDe(e.preco_a_partir != null ? Number(e.preco_a_partir) : null)}
                </p>
                {e.resumo.total === 0 ? (
                  <p className="text-fluid-xs text-tenue">Unidades não cadastradas: consulte a imobiliária.</p>
                ) : (
                  <>
                    <p className="text-fluid-sm text-corpo">
                      <strong className="text-titulo">{e.resumo.disponiveis.length}</strong> disponíveis ·{" "}
                      {e.resumo.reservadas} reservadas · {e.resumo.vendidas} vendidas
                    </p>
                    {e.resumo.disponiveis.length > 0 && (
                      <ul className="flex flex-wrap gap-1.5">
                        {e.resumo.disponiveis.slice(0, 40).map((u) => (
                          <li key={u.identificacao} className="rounded-full border border-linha px-2.5 py-1 text-fluid-xs text-corpo">
                            {u.identificacao}
                            {u.dormitorios ? ` · ${u.dormitorios}d` : ""}
                            {u.area_m2 ? ` · ${Number(u.area_m2)} m²` : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="max-w-2xl">
            <IndicarCliente token={token} imoveis={lista.map((e) => ({ id: e.id, nome: e.nome }))} />
          </div>
        </div>
      </Secao>
    </Pagina>
  );
}
