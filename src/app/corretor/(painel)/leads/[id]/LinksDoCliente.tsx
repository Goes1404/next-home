import { createClient } from "@/lib/supabase/server";
import { dataHora } from "@/app/corretor/(painel)/_componentes/CartaoLead";
import { BotoesDeLink } from "./BotoesDeLink";

/**
 * Links para o cliente (26/09/2026): seleção, proposta e portal. Os
 * documentos ganharam seção própria na ficha em 16/10 (`Documentacao.tsx`).
 */
export async function LinksDoCliente({ leadId, telefone }: { leadId: string; telefone: string | null }) {
  const supabase = await createClient();
  const [{ data: links }, { data: cliques }, { data: lead }] = await Promise.all([
    supabase
      .from("links_do_cliente")
      .select("token, tipo, aberto_em, created_at, dados")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("links_do_cliente_eventos")
      .select("tipo, token, detalhe, created_at")
      .eq("lead_id", leadId)
      .in("tipo", ["clicou", "aceitou", "quer_conversar"])
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("leads")
      .select("empreendimento:empreendimentos!leads_empreendimento_id_fkey(id, nome)")
      .eq("id", leadId)
      .maybeSingle(),
  ]);
  const imovelDoLead = Array.isArray(lead?.empreendimento) ? lead?.empreendimento[0] : lead?.empreendimento;
  // O que ele abriu, do mais recente, sem repetir: é por onde começar a conversa.
  const abertos = [
    ...new Set(
      (cliques ?? [])
        .filter((c) => c.tipo === "clicou")
        .map((c) => c.detalhe)
        .filter((d): d is string => Boolean(d)),
    ),
  ];
  const propostaEnviada = links?.find((l) => l.tipo === "proposta");
  const respostaDaProposta = (cliques ?? []).find(
    (c) => (c.tipo === "aceitou" || c.tipo === "quer_conversar") && c.token === propostaEnviada?.token,
  );

  const selecao = links?.find((l) => l.tipo === "selecao");

  return (
    <section className="cartao space-y-3 p-4">
      <h2 className="text-fluid-sm text-titulo font-medium">Links para o cliente</h2>
      <BotoesDeLink
        leadId={leadId}
        telefone={telefone}
        imovelDoLead={imovelDoLead ? { id: imovelDoLead.id, nome: imovelDoLead.nome } : null}
      />

      {propostaEnviada && (
        <p className="text-fluid-xs text-apoio">
          Proposta enviada em {dataHora.format(new Date(propostaEnviada.created_at))} ·{" "}
          {respostaDaProposta?.tipo === "aceitou" ? (
            <strong className="text-ok">aceita pelo cliente</strong>
          ) : respostaDaProposta?.tipo === "quer_conversar" ? (
            <strong className="text-corpo">o cliente quer conversar</strong>
          ) : propostaEnviada.aberto_em ? (
            "aberta, sem resposta"
          ) : (
            "ainda não aberta"
          )}
        </p>
      )}

      {selecao && (
        <p className="text-fluid-xs text-apoio">
          Seleção enviada em {dataHora.format(new Date(selecao.created_at))} ·{" "}
          {selecao.aberto_em
            ? `aberta pelo cliente em ${dataHora.format(new Date(selecao.aberto_em))}`
            : "ainda não aberta"}
          {abertos.length > 0 && ` · olhou: ${abertos.join(", ")}`}
        </p>
      )}

    </section>
  );
}
