import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { dataHora } from "@/app/corretor/(painel)/_componentes/CartaoLead";
import { BotoesDeLink } from "./BotoesDeLink";

/** Link assinado de um documento dura isto: o bastante para abrir, não para vazar. */
const VALIDADE_DO_LINK_S = 60 * 30;

/**
 * Links para o cliente (26/09/2026): seleção personalizada e documentos.
 *
 * Os documentos ficam no bucket PRIVADO `documentos-clientes`; a leitura é
 * pela RLS (`lead_documentos`: dono ou gestor) e cada arquivo abre por URL
 * assinada de 30 minutos, gerada no servidor. Nada disso tem URL pública.
 */
export async function LinksDoCliente({ leadId, telefone }: { leadId: string; telefone: string | null }) {
  const supabase = await createClient();
  const [{ data: links }, { data: documentos }, { data: cliques }, { data: lead }] = await Promise.all([
    supabase
      .from("links_do_cliente")
      .select("token, tipo, aberto_em, created_at, dados")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("lead_documentos")
      .select("id, item, caminho, nome_arquivo, created_at, alerta")
      .eq("lead_id", leadId)
      .order("created_at", { ascending: false }),
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
  const pedido = links?.find((l) => l.tipo === "documentos");

  const assinados = new Map<string, string>();
  if (documentos && documentos.length > 0) {
    const { data } = await createServiceClient()
      .storage.from("documentos-clientes")
      .createSignedUrls(
        documentos.map((d) => d.caminho),
        VALIDADE_DO_LINK_S,
      );
    for (const s of data ?? []) {
      if (s.path && s.signedUrl) assinados.set(s.path, s.signedUrl);
    }
  }

  const itensPedidos: string[] = Array.isArray((pedido?.dados as { itens?: unknown })?.itens)
    ? ((pedido!.dados as { itens: string[] }).itens)
    : [];
  const recebidos = new Set((documentos ?? []).map((d) => d.item));
  const faltam = itensPedidos.filter((i) => !recebidos.has(i));

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

      {(pedido || (documentos && documentos.length > 0)) && (
        <div className="space-y-2 border-t border-linha pt-3">
          <p className="text-fluid-xs font-semibold text-corpo">
            Documentos {documentos?.length ? `(${documentos.length} recebidos)` : ""}
          </p>
          {documentos && documentos.length > 0 && (
            <ul className="space-y-1">
              {documentos.map((d) => {
                const url = assinados.get(d.caminho);
                return (
                  <li key={d.id} className="text-fluid-xs text-corpo break-words">
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
                        {d.item}
                      </a>
                    ) : (
                      <span className="font-semibold">{d.item}</span>
                    )}{" "}
                    <span className="text-tenue">
                      · {d.nome_arquivo ?? "arquivo"} · {dataHora.format(new Date(d.created_at))}
                    </span>
                    {d.alerta && <span className="block text-alerta">⚠ {d.alerta}</span>}
                  </li>
                );
              })}
            </ul>
          )}
          {faltam.length > 0 && (
            <p className="text-fluid-xs text-apoio">Faltam: {faltam.join(" · ")}</p>
          )}
        </div>
      )}
    </section>
  );
}
