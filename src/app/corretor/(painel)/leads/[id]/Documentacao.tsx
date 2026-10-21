import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { lerEnderecoDoCliente } from "@/lib/marcaDoCrm/ler";
import { caminhoDoLink } from "@/lib/crm/linksDoCliente";
import { FASES_DOCUMENTO, sugereDocumentacao } from "@/lib/crm/documentacao";
import { lerDocumentacaoDoLead } from "@/lib/crm/documentacaoDados";
import type { EtapaFunil } from "@/lib/types";
import { DocumentacaoClient, type FaseNaTela } from "./DocumentacaoClient";

/** Link assinado de um documento dura isto: o bastante para abrir, não para vazar. */
const VALIDADE_DO_LINK_S = 60 * 30;

/**
 * A documentação do lead (0179, 16/10/2026): a lista por fase, o que chegou,
 * o que foi conferido e o que voltou para o cliente refazer.
 *
 * Os arquivos ficam no bucket PRIVADO `documentos-clientes`; a leitura é pela
 * RLS (dono ou gestor) e cada arquivo abre por URL assinada de 30 minutos. Só
 * o corretor do lead mexe — o gestor vê e baixa, como os links do cliente.
 */
export async function Documentacao({
  leadId,
  nome,
  telefone,
  etapa,
  corretorDoLead,
}: {
  leadId: string;
  nome: string;
  telefone: string | null;
  etapa: EtapaFunil;
  corretorDoLead: string | null;
}) {
  const supabase = await createClient();
  const [doc, corretor] = await Promise.all([
    lerDocumentacaoDoLead(supabase, leadId),
    getCorretorLogado(),
  ]);
  const podeEditar = Boolean(corretor && corretor.id === corretorDoLead);
  // O link que o cliente recebe abre no endereço do grupo dele (`marcaDoCrm`).
  const enderecoDoCliente = corretor ? await lerEnderecoDoCliente(corretor.grupoId) : null;

  const assinados = new Map<string, string>();
  if (doc.documentos.length > 0) {
    const { data } = await createServiceClient()
      .storage.from("documentos-clientes")
      .createSignedUrls(
        doc.documentos.map((d) => d.caminho),
        VALIDADE_DO_LINK_S,
      );
    for (const s of data ?? [])
      if (s.path && s.signedUrl) assinados.set(s.path, s.signedUrl);
  }
  const porId = new Map(doc.documentos.map((d) => [d.id, d]));
  const arquivo = (id: string) => {
    const d = porId.get(id)!;
    return {
      id: d.id,
      situacao: d.situacao,
      motivoRecusa: d.motivoRecusa,
      criadoEm: d.criadoEm,
      nomeArquivo: d.nomeArquivo,
      alerta: d.alerta,
      origem: d.origem,
      url: assinados.get(d.caminho) ?? null,
    };
  };

  const fases = FASES_DOCUMENTO.map((fase): FaseNaTela => {
    const f = doc.fases[fase];
    return {
      fase,
      gravada: f.gravada,
      perfil: f.perfil,
      itens: f.resumo.itens.map((i) => ({
        item: i.item,
        situacao: i.situacao,
        motivo: i.motivo,
        arquivos: i.arquivos.map((a) => arquivo(a.id)),
      })),
      avulsos: f.resumo.avulsos.map((a) => arquivo(a.id)),
      conferidos: f.resumo.conferidos,
      aConferir: f.resumo.aConferir,
      pendentes: f.resumo.pendentesDoCliente.length,
      urlDoLink: f.link?.valido
        ? `${enderecoDoCliente}${caminhoDoLink("documentos", f.link.token)}`
        : null,
    };
  });

  return (
    <DocumentacaoClient
      leadId={leadId}
      primeiroNome={nome.trim().split(/\s+/)[0] || null}
      telefone={telefone}
      podeEditar={podeEditar}
      migrado={doc.migrado}
      fases={fases}
      sugerirEtapa={
        podeEditar && sugereDocumentacao(etapa, doc.fases.financiamento.resumo.pronta)
      }
    />
  );
}
