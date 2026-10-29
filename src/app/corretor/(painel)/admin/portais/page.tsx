import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { recursosDeImoveis } from "@/lib/grupos/ramo";
import { linkDoPainel } from "@/lib/marcaDoCrm/marca";
import { SLUG_DA_INTEGRACAO, type IntegracaoDePortal } from "@/lib/portais/formatos";
import { createServiceClient } from "@/lib/supabase/service";
import { inicioDaJanelaEmDias } from "@/lib/tempoServidor";
import { IntegracoesDosPortais, type IntegracaoNaTela } from "./IntegracoesDosPortais";

export const metadata: Metadata = { title: "Integração com portais" };
export const dynamic = "force-dynamic";

const JANELA_DIAS = 30;

/**
 * Integração com portais (29/10/2026, 0245): a URL que o gestor cola no
 * Canal Pro (ZAP, Viva Real e OLX) e a do formato genérico, cada uma com o
 * token do grupo, o último lead recebido e o passo a passo.
 *
 * O token é credencial: a tabela não tem grant para o painel, e a leitura é
 * pela chave de serviço DEPOIS da guarda, sempre com o grupo do gestor.
 */
export default async function PortaisPage() {
  const gestor = await exigirGestorNaPagina();
  if (!recursosDeImoveis(gestor.ramo)) notFound();
  const supabase = createServiceClient();
  const desde = inicioDaJanelaEmDias(JANELA_DIAS);

  const [{ data: integracoes, error }, { data: recibos }] = await Promise.all([
    supabase
      .from("integracoes_de_portais")
      .select("id, portal, token, ativo, criado_em, token_trocado_em")
      .eq("grupo_id", gestor.grupoId),
    supabase
      .from("portais_recebimentos")
      .select("integracao_id, status, recebido_em, detalhe")
      .eq("grupo_id", gestor.grupoId)
      .gte("recebido_em", desde)
      .order("recebido_em", { ascending: false })
      .limit(1000),
  ]);

  const porIntegracao = (id: string) => (recibos ?? []).filter((r) => r.integracao_id === id);
  const linha = (portal: IntegracaoDePortal): IntegracaoNaTela => {
    const i = (integracoes ?? []).find((x) => x.portal === portal);
    if (!i) return { portal, url: null, ativo: false, ultimo: null, recebidos30d: 0, criados30d: 0, ignorados30d: 0 };
    const meus = porIntegracao(i.id);
    return {
      portal,
      url: linkDoPainel(gestor.grupoId, `/api/webhooks/portais/${SLUG_DA_INTEGRACAO[portal]}?token=${i.token}`),
      ativo: i.ativo,
      ultimo: meus[0] ? { quando: meus[0].recebido_em, status: meus[0].status, detalhe: meus[0].detalhe } : null,
      recebidos30d: meus.length,
      criados30d: meus.filter((r) => r.status === "criado").length,
      ignorados30d: meus.filter((r) => r.status === "ignorado" || r.status === "erro").length,
    };
  };

  return (
    <div>
      <CabecalhoDeTela
        secao="Administração"
        titulo="Integração com portais"
        descricao="Os leads do ZAP, Viva Real e OLX chegam direto no CRM, na hora, e entram na roleta como os outros."
      />
      <div className="mt-6">
        {error ? (
          <p className="cartao p-4 text-fluid-sm text-apoio">
            A integração com portais ainda não foi ligada neste ambiente (falta a atualização do banco 0245). Fale com o
            suporte da Astro.
          </p>
        ) : (
          <IntegracoesDosPortais integracoes={[linha("grupo_olx"), linha("generico")]} />
        )}
      </div>
    </div>
  );
}
