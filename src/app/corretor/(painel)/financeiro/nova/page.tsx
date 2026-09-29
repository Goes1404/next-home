import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado, getEmpreendimentosParaFiltro, getEquipeAtiva } from "@/lib/corretorSessao";
import { getUltimoRepasse } from "@/lib/financeiro/dados";
import { CabecalhoDeTela } from "../../_componentes/CabecalhoDeTela";
import { FormularioVenda } from "../FormularioVenda";
import type { LeadParaVenda } from "../acoes";

export const metadata: Metadata = { title: "Registrar venda" };

/**
 * Registrar uma venda. `?lead=<id>` chega da ficha do lead e já traz o
 * cliente e o imóvel de interesse preenchidos — registrar não pode exigir
 * procurar de novo quem acabou de fechar.
 */
export default async function NovaVendaPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const params = await searchParams;
  const leadId = typeof params.lead === "string" ? params.lead : null;

  const supabase = await createClient();
  const [empreendimentos, equipe, ultimoRepasse, { data: lead }] = await Promise.all([
    getEmpreendimentosParaFiltro(),
    getEquipeAtiva(),
    getUltimoRepasse(corretor.id),
    leadId
      ? supabase
          .from("leads")
          .select("id, nome, telefone, empreendimento_id, imovel_interesse_id")
          .eq("id", leadId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const leadInicial: LeadParaVenda | null = lead
    ? {
        id: lead.id,
        nome: lead.nome,
        telefone: lead.telefone,
        empreendimentoId: lead.imovel_interesse_id ?? lead.empreendimento_id ?? null,
      }
    : null;

  return (
    <div className="space-y-4">
      <Link
        href="/corretor/financeiro"
        className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center gap-1.5"
      >
        ← Vendas
      </Link>
      <CabecalhoDeTela
        secao="Vendas"
        titulo="Registrar venda"
        descricao="Valor, comissão desta venda e quem participou. Leva menos de um minuto."
      />
      <FormularioVenda
        inicial={null}
        leadInicial={leadInicial}
        empreendimentos={empreendimentos}
        equipe={equipe.map((c) => ({ id: c.id, nome: c.nome }))}
        eu={{ id: corretor.id, nome: corretor.nome }}
        ultimoRepasse={ultimoRepasse}
        podeExcluir={false}
      />
    </div>
  );
}
