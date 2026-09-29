import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CabecalhoDePagina } from "@/components/institucional/CabecalhoDePagina";
import { Pagina } from "@/components/institucional/Pagina";
import { Secao } from "@/components/institucional/Secao";
import { lerLinkPublico } from "@/lib/crm/linkPublico";
import { createServiceClient } from "@/lib/supabase/service";
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
 * A página mostra só QUE o item foi enviado, nunca o arquivo: o link pode
 * ser encaminhado, e documento pessoal não aparece para quem o recebeu.
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

  const itens = Array.isArray(link.dados.itens) ? (link.dados.itens as string[]) : [];
  const { data: enviados } = await createServiceClient()
    .from("lead_documentos")
    .select("item")
    .eq("link_token", token);
  const contagem: Record<string, number> = {};
  for (const d of enviados ?? []) contagem[d.item] = (contagem[d.item] ?? 0) + 1;

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
          <EnvioDeDocumentos token={token} itens={itens} jaEnviados={contagem} />
        </div>
      </Secao>
    </Pagina>
  );
}
