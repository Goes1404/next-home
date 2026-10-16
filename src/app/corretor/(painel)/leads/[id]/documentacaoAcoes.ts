"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { site } from "@/lib/site";
import { medirImagem } from "@/lib/imoveis/imagemDerivada";
import {
  alertaDeResolucao,
  caminhoDoLink,
  mensagemParaCliente,
  nomeSeguro,
  problemaDoArquivo,
} from "@/lib/crm/linksDoCliente";
import {
  ehFase,
  itensIniciais,
  mesmoItem,
  nomeDoZip,
  nomesNoZip,
  normalizarItem,
  normalizarMotivo,
  TETO_ITENS_NA_LISTA,
  type FaseDocumento,
} from "@/lib/crm/documentacao";
import { lerDocumentacaoDoLead } from "@/lib/crm/documentacaoDados";

/**
 * As ações da documentação do lead (0179).
 *
 * A regra de quem pode é uma só, conferida na SESSÃO antes de qualquer
 * escrita: o lead é do corretor logado. O gestor lê (RLS) e não mexe — o
 * documento é do atendimento de quem cuida do cliente, como os links.
 * Depois da conferência, quem escreve é a chave de serviço: a tabela não dá
 * INSERT nem UPDATE à sessão, de propósito (a situação "conferido" não pode
 * ser escrita pela API por quem não passou por aqui).
 */

type Resultado = { ok?: true; erro?: string };

async function leadDoCorretor(leadId: string) {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." } as const;
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, nome, corretor_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { erro: "Lead não encontrado na sua carteira." } as const;
  if (lead.corretor_id !== corretor.id) {
    return { erro: "Só o corretor responsável pelo lead mexe nos documentos dele." } as const;
  }
  return { lead, corretor, supabase } as const;
}

/** O documento, pela sessão (RLS), e o lead dele conferido como do corretor. */
async function documentoDoCorretor(documentoId: string) {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." } as const;
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("lead_documentos")
    .select("id, lead_id")
    .eq("id", documentoId)
    .maybeSingle();
  if (!doc) return { erro: "Documento não encontrado." } as const;
  const r = await leadDoCorretor(doc.lead_id);
  if ("erro" in r) return { erro: r.erro } as const;
  return { doc, corretor } as const;
}

function revalidar(leadId: string) {
  revalidatePath(`/corretor/leads/${leadId}`);
}

/** Os itens da fase como estão agora (gravados ou herdados do link antigo). */
async function itensAtuais(leadId: string, fase: FaseDocumento): Promise<{ itens: string[]; perfil: string | null }> {
  const doc = await lerDocumentacaoDoLead(createServiceClient(), leadId);
  return { itens: doc.fases[fase].itens, perfil: doc.fases[fase].perfil };
}

async function gravarLista(
  leadId: string,
  corretorId: string,
  fase: FaseDocumento,
  itens: string[],
  perfil: string | null,
): Promise<Resultado> {
  const { error } = await createServiceClient()
    .from("lead_documentos_lista")
    .upsert(
      { lead_id: leadId, fase, corretor_id: corretorId, itens, perfil, atualizado_em: new Date().toISOString() },
      { onConflict: "lead_id,fase" },
    );
  if (error) {
    console.error("[documentação] lista não gravada:", error.message);
    return { erro: "Não foi possível salvar a lista agora." };
  }
  return { ok: true };
}

/** Começa (ou recomeça) a lista da fase pelo perfil. Arquivos já recebidos ficam. */
export async function comecarLista(leadId: string, fase: string, perfil: string | null): Promise<Resultado> {
  if (!ehFase(fase)) return { erro: "Fase desconhecida." };
  const r = await leadDoCorretor(leadId);
  if ("erro" in r) return { erro: r.erro };
  const res = await gravarLista(leadId, r.corretor.id, fase, itensIniciais(fase, perfil), fase === "financiamento" ? perfil : null);
  revalidar(leadId);
  return res;
}

export async function adicionarItem(leadId: string, fase: string, texto: string): Promise<Resultado> {
  if (!ehFase(fase)) return { erro: "Fase desconhecida." };
  const item = normalizarItem(String(texto ?? ""));
  if (!item) return { erro: "Escreva o nome do documento." };
  const r = await leadDoCorretor(leadId);
  if ("erro" in r) return { erro: r.erro };
  const atual = await itensAtuais(leadId, fase);
  if (atual.itens.some((i) => mesmoItem(i, item))) return { erro: "Esse documento já está na lista." };
  if (atual.itens.length >= TETO_ITENS_NA_LISTA) return { erro: `A lista chegou ao teto de ${TETO_ITENS_NA_LISTA} documentos.` };
  const res = await gravarLista(leadId, r.corretor.id, fase, [...atual.itens, item], atual.perfil);
  revalidar(leadId);
  return res;
}

/** Tira o item da lista. Os arquivos dele continuam na ficha, como avulsos. */
export async function removerItem(leadId: string, fase: string, item: string): Promise<Resultado> {
  if (!ehFase(fase)) return { erro: "Fase desconhecida." };
  const r = await leadDoCorretor(leadId);
  if ("erro" in r) return { erro: r.erro };
  const atual = await itensAtuais(leadId, fase);
  const res = await gravarLista(
    leadId,
    r.corretor.id,
    fase,
    atual.itens.filter((i) => !mesmoItem(i, String(item ?? ""))),
    atual.perfil,
  );
  revalidar(leadId);
  return res;
}

/**
 * O corretor anexa pela ficha (item 2): o cliente entregou em mãos, mandou
 * por e-mail, ou o corretor já tinha o arquivo. Entra CONFERIDO — quem anexa
 * é quem confere, e pedir um segundo toque para cada arquivo que ele mesmo
 * escolheu seria cerimônia.
 */
export async function anexarDocumento(formData: FormData): Promise<Resultado> {
  const leadId = String(formData.get("leadId") ?? "");
  const fase = String(formData.get("fase") ?? "");
  const item = normalizarItem(String(formData.get("item") ?? ""));
  const arquivo = formData.get("arquivo");
  if (!ehFase(fase)) return { erro: "Fase desconhecida." };
  if (!item) return { erro: "Documento não reconhecido." };
  if (!(arquivo instanceof File)) return { erro: "Escolha um arquivo." };
  const problema = problemaDoArquivo(arquivo);
  if (problema) return { erro: problema };

  const r = await leadDoCorretor(leadId);
  if ("erro" in r) return { erro: r.erro };
  const { itens } = await itensAtuais(leadId, fase);
  if (!itens.some((i) => mesmoItem(i, item))) return { erro: "Esse documento não está na lista." };

  const bytes = Buffer.from(await arquivo.arrayBuffer());
  const alerta = arquivo.type.startsWith("image/")
    ? await medirImagem(bytes).then((m) => (m ? alertaDeResolucao(m.largura, m.altura) : null))
    : null;

  const servico = createServiceClient();
  const caminho = `${leadId}/${crypto.randomUUID()}-${nomeSeguro(arquivo.name)}`;
  const { error: erroUpload } = await servico.storage
    .from("documentos-clientes")
    .upload(caminho, bytes, { contentType: arquivo.type, upsert: false });
  if (erroUpload) {
    console.error("[documentação] upload recusado:", erroUpload.message);
    return { erro: "Não foi possível enviar o arquivo agora. Tente de novo." };
  }
  const { error } = await servico.from("lead_documentos").insert({
    lead_id: leadId,
    corretor_id: r.corretor.id,
    item,
    fase,
    caminho,
    nome_arquivo: arquivo.name.slice(0, 120),
    tamanho: arquivo.size,
    mime: arquivo.type,
    alerta,
    origem: "corretor",
    situacao: "conferido",
    conferido_em: new Date().toISOString(),
  });
  if (error) {
    // Sem a linha, o arquivo ficaria órfão no bucket e invisível na ficha.
    await servico.storage.from("documentos-clientes").remove([caminho]);
    console.error("[documentação] documento não registrado:", error.message);
    return { erro: "Não foi possível registrar o documento. Tente de novo." };
  }
  revalidar(leadId);
  return { ok: true };
}

/** Conferi: o arquivo serve para levar ao banco (item 3). */
export async function conferirDocumento(documentoId: string): Promise<Resultado> {
  const r = await documentoDoCorretor(documentoId);
  if ("erro" in r) return { erro: r.erro };
  const { error } = await createServiceClient()
    .from("lead_documentos")
    .update({ situacao: "conferido", conferido_em: new Date().toISOString(), motivo_recusa: null })
    .eq("id", documentoId);
  if (error) return { erro: "Não foi possível marcar agora." };
  revalidar(r.doc.lead_id);
  return { ok: true };
}

/**
 * Recusei, com o motivo (item 3). O motivo aparece para o cliente na página
 * do link, junto do botão para mandar de novo — recusa sem motivo faz o
 * cliente mandar a mesma foto torta outra vez.
 */
export async function recusarDocumento(documentoId: string, motivo: string): Promise<Resultado> {
  const texto = normalizarMotivo(String(motivo ?? ""));
  if (!texto) return { erro: "Diga o motivo: é o que o cliente vai ler." };
  const r = await documentoDoCorretor(documentoId);
  if ("erro" in r) return { erro: r.erro };
  const { error } = await createServiceClient()
    .from("lead_documentos")
    .update({ situacao: "recusado", motivo_recusa: texto, conferido_em: null })
    .eq("id", documentoId);
  if (error) return { erro: "Não foi possível marcar agora." };
  revalidar(r.doc.lead_id);
  return { ok: true };
}

/** Desfaz conferido ou recusado: volta a esperar conferência. */
export async function reabrirDocumento(documentoId: string): Promise<Resultado> {
  const r = await documentoDoCorretor(documentoId);
  if ("erro" in r) return { erro: r.erro };
  const { error } = await createServiceClient()
    .from("lead_documentos")
    .update({ situacao: "recebido", motivo_recusa: null, conferido_em: null })
    .eq("id", documentoId);
  if (error) return { erro: "Não foi possível desfazer agora." };
  revalidar(r.doc.lead_id);
  return { ok: true };
}

export type LinkDosDocumentos = { url: string; mensagem: string } | { erro: string };

/**
 * O link para o cliente mandar os documentos da fase. Um link VÁLIDO da fase
 * é devolvido em vez de criar outro: o cliente guarda o endereço, e o que
 * ele abre mostra sempre a lista do lead como está agora (com os recusados).
 * Sem lista gravada, ela nasce aqui pelo perfil — pedir documento sem lista
 * seria pedir nada.
 */
export async function linkDosDocumentos(leadId: string, fase: string, perfil: string | null): Promise<LinkDosDocumentos> {
  if (!ehFase(fase)) return { erro: "Fase desconhecida." };
  const r = await leadDoCorretor(leadId);
  if ("erro" in r) return { erro: r.erro ?? "Lead não encontrado." };
  const doc = await lerDocumentacaoDoLead(createServiceClient(), leadId);
  const daFase = doc.fases[fase];
  if (!daFase.gravada) {
    const itens = daFase.itens.length > 0 ? daFase.itens : itensIniciais(fase, perfil);
    const res = await gravarLista(leadId, r.corretor.id, fase, itens, fase === "financiamento" ? perfil : null);
    if (res.erro) return { erro: res.erro };
  }
  const primeiroNome = r.lead.nome.trim().split(/\s+/)[0] || null;
  if (daFase.link?.valido) {
    const url = `${site.url}${caminhoDoLink("documentos", daFase.link.token)}`;
    return { url, mensagem: mensagemParaCliente({ tipo: "documentos", primeiroNome, url }) };
  }
  const { data, error } = await r.supabase
    .from("links_do_cliente")
    .insert({ tipo: "documentos", lead_id: leadId, corretor_id: r.corretor.id, dados: { fase } })
    .select("token")
    .single();
  if (error || !data) return { erro: "Não foi possível criar o link agora." };
  revalidar(leadId);
  const url = `${site.url}${caminhoDoLink("documentos", data.token)}`;
  return { url, mensagem: mensagemParaCliente({ tipo: "documentos", primeiroNome, url }) };
}

export type ArquivoParaZip = { url: string; nome: string };

/**
 * Os arquivos CONFERIDOS da fase, com link assinado de 10 minutos, para o
 * navegador montar o .zip (item 6). O gestor também baixa: ele lê os
 * documentos pela RLS, e baixar não muda nada.
 */
export async function arquivosParaZip(
  leadId: string,
  fase: string,
): Promise<{ arquivos: ArquivoParaZip[]; nomeDoZip: string } | { erro: string }> {
  if (!ehFase(fase)) return { erro: "Fase desconhecida." };
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };
  const supabase = await createClient();
  // Pela sessão: se a RLS não deixa ler o lead, não há o que baixar.
  const { data: lead } = await supabase.from("leads").select("id, nome").eq("id", leadId).maybeSingle();
  if (!lead) return { erro: "Lead não encontrado." };
  const doc = await lerDocumentacaoDoLead(supabase, leadId);
  const daFase = doc.fases[fase];
  const conferidos = daFase.resumo.itens.flatMap((i, indice) =>
    i.arquivos
      .filter((a) => a.situacao === "conferido")
      .map((a) => {
        const completo = doc.documentos.find((d) => d.id === a.id)!;
        return { ...completo, posicao: indice + 1, itemDaLista: i.item };
      }),
  );
  if (conferidos.length === 0) return { erro: "Nenhum documento conferido nesta lista ainda." };
  const { data: assinados } = await createServiceClient()
    .storage.from("documentos-clientes")
    .createSignedUrls(
      conferidos.map((c) => c.caminho),
      60 * 10,
    );
  const porCaminho = new Map((assinados ?? []).filter((s) => s.path && s.signedUrl).map((s) => [s.path!, s.signedUrl]));
  const prontos = conferidos.filter((c) => porCaminho.has(c.caminho));
  if (prontos.length === 0) return { erro: "Não consegui preparar os arquivos agora." };
  const nomes = nomesNoZip(
    prontos.map((c) => ({ item: c.itemDaLista, posicao: c.posicao, mime: c.mime, nomeArquivo: c.nomeArquivo })),
  );
  return {
    arquivos: prontos.map((c, k) => ({ url: porCaminho.get(c.caminho)!, nome: nomes[k] })),
    nomeDoZip: nomeDoZip(lead.nome, fase),
  };
}
