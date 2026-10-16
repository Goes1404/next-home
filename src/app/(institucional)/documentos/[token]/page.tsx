import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CabecalhoDePagina } from "@/components/institucional/CabecalhoDePagina";
import { Pagina } from "@/components/institucional/Pagina";
import { Secao } from "@/components/institucional/Secao";
import { lerLinkPublico, lerLinkVencido, type LinkVencido } from "@/lib/crm/linkPublico";
import { normalizarTelefoneBr } from "@/lib/whatsapp/telefone";
import { linkWhatsappPara } from "@/lib/site";
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
  if (!link) {
    const vencido = await lerLinkVencido(token, "documentos");
    if (!vencido) notFound();
    return <LinkVencidoPagina vencido={vencido} />;
  }

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

/**
 * O link existiu e venceu (30 dias). Antes isto era "página não
 * encontrada", e o cliente não sabia que bastava pedir outro — nem a quem.
 * O botão abre o WhatsApp do corretor com o pedido escrito.
 */
function LinkVencidoPagina({ vencido }: { vencido: LinkVencido }) {
  const primeiroCorretor = vencido.corretor.nome.trim().split(/\s+/)[0];
  const numero = normalizarTelefoneBr(vencido.corretor.whatsapp);
  const whatsapp = numero
    ? linkWhatsappPara(
        numero,
        `Oi, ${primeiroCorretor}! O link para enviar meus documentos venceu. Pode me mandar um novo?`,
      )
    : null;
  return (
    <Pagina>
      <Secao espaco="abertura">
        <CabecalhoDePagina
          rotulo={`Pedido por ${vencido.corretor.nome}`}
          titulo={vencido.primeiroNome ? `${vencido.primeiroNome}, este link venceu` : "Este link venceu"}
          lead="Por segurança, o link para enviar documentos vale 30 dias. Peça um novo ao seu corretor — os documentos que você já mandou continuam com ele."
        />
        {whatsapp ? (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="botao-vivo mt-8 inline-flex min-h-12 items-center rounded-full bg-[#25D366] px-6 font-semibold text-white"
          >
            Pedir um link novo a {primeiroCorretor}
          </a>
        ) : (
          <p className="mt-8 text-fluid-base text-corpo">Fale com {primeiroCorretor} para receber um link novo.</p>
        )}
      </Secao>
    </Pagina>
  );
}
