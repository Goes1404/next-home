import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CabecalhoDePagina } from "@/components/institucional/CabecalhoDePagina";
import { Pagina } from "@/components/institucional/Pagina";
import { Secao } from "@/components/institucional/Secao";
import { lerLinkPublico } from "@/lib/crm/linkPublico";
import { createServiceClient } from "@/lib/supabase/service";
import { documentacaoDoLink } from "@/lib/crm/documentacaoDados";
import { EnvioDeDocumentos } from "./EnvioDeDocumentos";

export const metadata: Metadata = {
  title: "Envio de documentos",
  robots: { index: false, follow: false },
};

/**
 * Onde o cliente envia os documentos do financiamento pelo celular
 * (26/09/2026). É a etapa em que a venda costuma travar por semanas: o
 * corretor pede por WhatsApp, o cliente manda foto torta aos pedaços, e
 * ninguém sabe o que falta. Aqui é uma lista, um botão por item, e o
 * corretor vê na ficha o que chegou.
 *
 * A página mostra só a SITUAÇÃO de cada item (falta, enviado, conferido,
 * recusado com o motivo), nunca o arquivo: o link pode ser encaminhado, e
 * documento pessoal não aparece para quem o recebeu. A lista é a do lead
 * como está agora (0179) — o corretor pode ter posto ou tirado item.
 */
export default async function DocumentosPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ previa?: string }>;
}) {
  const [{ token }, { previa }] = await Promise.all([params, searchParams]);
  const link = await lerLinkPublico(token, "documentos", { previa: previa === "1" });
  if (!link) notFound();

  const { itens } = await documentacaoDoLink(createServiceClient(), link.leadId, link.dados);

  return (
    <Pagina>
      <Secao espaco="abertura">
        <CabecalhoDePagina
          rotulo={`Pedido por ${link.corretor.nome}${link.corretor.creci ? ` · CRECI ${link.corretor.creci}` : ""}`}
          titulo={link.primeiroNome ? `${link.primeiroNome}, envie seus documentos` : "Envie seus documentos"}
          lead="Tire uma foto ou envie o PDF de cada item. Os arquivos vão direto para o seu corretor, guardados em área privada — não ficam públicos na internet."
        />
      </Secao>
      <Secao espaco="final">
        <div className="max-w-2xl">
          <EnvioDeDocumentos token={token} itens={itens} />
        </div>
      </Secao>
    </Pagina>
  );
}
