import type { Metadata } from "next";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getEmpreendimentosDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { createClient } from "@/lib/supabase/server";
import {
  resumirImpulsionamentos,
  totaisDosImpulsionamentos,
  type LinhaImpulsionamento,
} from "@/lib/crm/impulsionamentosCalculo";
import { ListaDeImpulsionamentos } from "./ListaDeImpulsionamentos";

export const metadata: Metadata = { title: "Impulsionamentos" };
export const dynamic = "force-dynamic";

/**
 * Quanto rendeu cada impulsionamento do Instagram/Facebook (27/09/2026).
 *
 * O corretor não conecta conta nenhuma: o anúncio aparece aqui sozinho
 * quando o primeiro cliente chega por ele (o webhook reconhece a etiqueta da
 * Meta). Ele só digita quanto gastou, e o custo por lead e por visita sai da
 * contagem dos leads. A conexão com a conta da Meta (gasto automático) ficou
 * para depois, porque exige aprovação do app pela Meta.
 *
 * A RLS recorta: o corretor vê os dele; o gestor vê os da equipe inteira
 * (mas só o dono edita o gasto).
 */
export default async function PaginaImpulsionamentos() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const supabase = await createClient();
  const [{ data: linhas, error }, { data: leads }, catalogo, { data: corretores }] = await Promise.all([
    supabase
      .from("impulsionamentos")
      .select(
        "id, corretor_id, chave, titulo, url, empreendimento_id, valor_gasto, primeiro_lead_em, ultimo_lead_em",
      )
      .order("ultimo_lead_em", { ascending: false })
      .limit(200),
    supabase
      .from("leads")
      .select("corretor_id, meta_ad_id, anuncio_origem, etapa, visita_agendada_em")
      .eq("origem", "meta/ctwa")
      .is("arquivado_em", null)
      .limit(5000),
    getEmpreendimentosDoPainel(),
    supabase.from("corretores").select("id, nome"),
  ]);

  const doBanco: LinhaImpulsionamento[] = (linhas ?? []).map((l) => ({
    id: l.id,
    corretorId: l.corretor_id,
    chave: l.chave,
    titulo: l.titulo,
    url: l.url,
    empreendimentoId: l.empreendimento_id,
    valorGasto: l.valor_gasto === null ? null : Number(l.valor_gasto),
    primeiroLeadEm: l.primeiro_lead_em,
    ultimoLeadEm: l.ultimo_lead_em,
  }));

  const resumos = resumirImpulsionamentos(
    doBanco,
    (leads ?? []).map((l) => ({
      corretorId: l.corretor_id,
      metaAdId: l.meta_ad_id,
      anuncioOrigem: l.anuncio_origem,
      etapa: l.etapa,
      visitaAgendadaEm: l.visita_agendada_em,
    })),
  );
  const nomes = Object.fromEntries((corretores ?? []).map((c) => [c.id, c.nome]));

  return (
    <div className="space-y-6">
      <CabecalhoDeTela
        titulo="Impulsionamentos"
        descricao="Quanto cada post impulsionado trouxe de clientes, e quanto custou cada um."
      />
      <ListaDeImpulsionamentos
        resumos={resumos}
        totais={totaisDosImpulsionamentos(resumos)}
        meuId={corretor.id}
        verEquipe={corretor.papel === "gestor"}
        nomes={nomes}
        imoveis={catalogo.filter((i) => i.id).map((i) => ({ id: i.id as string, nome: i.nome }))}
        indisponivel={Boolean(error)}
      />
    </div>
  );
}
