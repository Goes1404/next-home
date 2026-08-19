"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCorretorLogado, souGestor } from "@/lib/corretorSessao";
import {
  LIMITE_POR_IMPORTACAO,
  extrairDePdf,
  extrairDeTexto,
  type CandidatoLead,
} from "@/lib/leads/importacao";
import { normalizarTelefoneBrasileiro } from "@/lib/inbound/phoneUtils";
import { createClient } from "@/lib/supabase/server";

import { extrairVariosLeadsComIA } from "@/lib/inbound/aiParser";
import type { PortalOrigem } from "@/lib/inbound/types";

export type CandidatoRevisado = CandidatoLead & {
  /** Já existe um lead com este telefone no que o corretor enxerga. */
  jaExiste: boolean;
};

export type LeadEmailRevisado = {
  idTemp: string;
  nome: string;
  telefone: string;
  telefoneE164: string | null;
  email: string | null;
  imovelInteresse: string | null;
  codigoReferencia: string | null;
  portalOrigem: PortalOrigem;
  mensagemOriginal: string | null;
  valorMencionado?: number | null;
  jaExiste: boolean;
  empreendimentoSugeridoId: string | null;
};

export type InboundLogItem = {
  id: string;
  de: string | null;
  para: string | null;
  assunto: string | null;
  status: "sucesso" | "erro" | "ignorado";
  erroMensagem: string | null;
  leadId: string | null;
  criadoEm: string;
};

export type ResultadoAnaliseEmail = {
  leads?: LeadEmailRevisado[];
  erro?: string;
  aviso?: string;
};

export type ResultadoAnalise = {
  candidatos?: CandidatoRevisado[];
  metodo?: "tabela" | "texto" | "ia";
  erro?: string;
  aviso?: string;
};

export type ResumoImportacao = {
  inseridos?: number;
  ignorados?: number;
  falhas?: number;
  erro?: string;
};

export type EstadoLeadUnico = { erro?: string; ok?: string } | undefined;

/** 10 MB — acima disso é catálogo, não lista de contatos. */
const LIMITE_ARQUIVO = 10 * 1024 * 1024;

const TIPOS_TEXTO = ["text/csv", "text/plain", "text/tab-separated-values", "application/csv"];

/**
 * Server Action é POST na rota, não navegação: o `proxy.ts` não cobre isto.
 * Toda ação começa reconfirmando a sessão, como o resto do painel.
 */
async function exigirCorretor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/corretor/entrar");

  const corretor = await getCorretorLogado();
  if (!corretor) redirect("/corretor");

  return { supabase, corretor };
}

/**
 * Marca quais candidatos já existem na carteira.
 *
 * A consulta corre sob RLS, e é isso que dá o recorte certo de graça: o
 * corretor comum compara com os leads dele, o gestor compara com os da
 * imobiliária inteira. Ninguém descobre o contato do colega por um aviso de
 * duplicado.
 */
async function marcarExistentes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  candidatos: CandidatoLead[],
): Promise<CandidatoRevisado[]> {
  const chaves = candidatos
    .map((c) => c.telefoneE164)
    .filter((t): t is string => Boolean(t));

  if (chaves.length === 0) return candidatos.map((c) => ({ ...c, jaExiste: false }));

  const { data, error } = await supabase
    .from("leads")
    .select("telefone_e164")
    .in("telefone_e164", chaves);

  if (error) {
    console.error("[importar] falha ao consultar duplicados:", error.message);
    // Sem a consulta, todo mundo entra como novo — melhor um duplicado
    // visível na lista do que esconder a importação inteira por causa disso.
    return candidatos.map((c) => ({ ...c, jaExiste: false }));
  }

  const existentes = new Set((data ?? []).map((l) => l.telefone_e164).filter(Boolean));
  return candidatos.map((c) => ({
    ...c,
    jaExiste: Boolean(c.telefoneE164 && existentes.has(c.telefoneE164)),
  }));
}

export async function analisarTexto(conteudo: string): Promise<ResultadoAnalise> {
  const { supabase } = await exigirCorretor();

  if (!conteudo?.trim()) return { erro: "Cole a lista de contatos antes de continuar." };
  if (conteudo.length > 200_000) {
    return { erro: "Texto grande demais. Divida em partes menores ou envie um arquivo." };
  }

  const resultado = await extrairDeTexto(conteudo);
  if (resultado.candidatos.length === 0) {
    return { erro: resultado.aviso ?? "Nenhum contato com telefone foi encontrado." };
  }

  return {
    candidatos: await marcarExistentes(supabase, resultado.candidatos),
    metodo: resultado.metodo === "nenhum" ? "tabela" : resultado.metodo,
    aviso: resultado.aviso,
  };
}

export async function analisarArquivo(formData: FormData): Promise<ResultadoAnalise> {
  const { supabase } = await exigirCorretor();

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha um arquivo para enviar." };
  }
  if (arquivo.size > LIMITE_ARQUIVO) {
    return { erro: "Arquivo acima de 10 MB. Exporte um trecho menor." };
  }

  const nome = arquivo.name.toLowerCase();
  const ehPdf = arquivo.type === "application/pdf" || nome.endsWith(".pdf");
  const ehTexto =
    TIPOS_TEXTO.includes(arquivo.type) ||
    [".csv", ".tsv", ".txt"].some((ext) => nome.endsWith(ext));

  if (nome.endsWith(".xlsx") || nome.endsWith(".xls")) {
    return {
      erro:
        "Planilha do Excel ainda não é lida direto. No Excel, use Salvar como → CSV e envie o arquivo gerado.",
    };
  }

  if (!ehPdf && !ehTexto) {
    return { erro: "Formato não suportado. Envie PDF, CSV, TSV ou TXT." };
  }

  const resultado = ehPdf
    ? await extrairDePdf(Buffer.from(await arquivo.arrayBuffer()))
    : await extrairDeTexto(await arquivo.text());

  if (resultado.candidatos.length === 0) {
    return { erro: resultado.aviso ?? "Nenhum contato com telefone foi encontrado no arquivo." };
  }

  return {
    candidatos: await marcarExistentes(supabase, resultado.candidatos),
    metodo: resultado.metodo === "nenhum" ? "tabela" : resultado.metodo,
    aviso: resultado.aviso,
  };
}

type ItemImportacao = {
  nome: string;
  telefone: string;
  email: string | null;
  mensagem: string | null;
  imovelInteresse: string | null;
};

export async function importarLeads(
  itens: ItemImportacao[],
  opcoes: { distribuirNaEquipe: boolean; empreendimentoId: string | null; consentimento: boolean },
): Promise<ResumoImportacao> {
  const { supabase, corretor } = await exigirCorretor();

  if (!Array.isArray(itens) || itens.length === 0) {
    return { erro: "Nenhum contato selecionado." };
  }
  if (itens.length > LIMITE_POR_IMPORTACAO) {
    return { erro: `Máximo de ${LIMITE_POR_IMPORTACAO} contatos por importação.` };
  }
  if (!opcoes.consentimento) {
    return { erro: "Confirme que você tem autorização para tratar estes dados." };
  }

  /*
   * Distribuir na equipe é enviar `corretor_id` nulo e deixar o trigger
   * `distribuir_lead` (0012) escolher — a mesma roleta que o formulário do
   * site usa. Só o gestor pode: um corretor comum distribuindo a própria
   * lista estaria doando os contatos dele sem querer.
   */
  const gestor = await souGestor();
  const distribuir = opcoes.distribuirNaEquipe && gestor;

  const linhas = itens
    .map((item) => {
      const telefone = item.telefone?.trim();
      if (!telefone || !normalizarTelefoneBrasileiro(telefone)) return null;
      const nome = item.nome?.trim();

      return {
        nome: nome && nome.length >= 2 ? nome.slice(0, 120) : "Contato sem nome",
        telefone: telefone.slice(0, 40),
        email: item.email?.trim().slice(0, 160) || null,
        mensagem: item.mensagem?.trim().slice(0, 2000) || null,
        anuncio_origem: item.imovelInteresse?.trim().slice(0, 160) || null,
        empreendimento_id: opcoes.empreendimentoId,
        // Nunca do cliente: o corretor dono é o da sessão, sempre.
        corretor_id: distribuir ? null : corretor.id,
        origem_atribuicao: distribuir ? null : "manual",
        tipo: "comprador",
        origem: "painel/importacao",
        consentimento_lgpd: true,
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  const ignorados = itens.length - linhas.length;
  if (linhas.length === 0) {
    return { erro: "Nenhum dos contatos tem telefone válido.", ignorados };
  }

  // Em lotes: um insert de 300 linhas que falha na última perde as 299.
  let inseridos = 0;
  let falhas = 0;
  const TAMANHO_LOTE = 50;

  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE) {
    const lote = linhas.slice(i, i + TAMANHO_LOTE);
    const { data, error } = await supabase.from("leads").insert(lote).select("id");

    if (error) {
      console.error("[importar] lote recusado:", error.message);
      falhas += lote.length;
      continue;
    }
    inseridos += data?.length ?? 0;
  }

  revalidatePath("/corretor/leads");
  revalidatePath("/corretor/funil");
  revalidatePath("/corretor");

  return { inseridos, ignorados, falhas };
}

export async function criarLeadUnico(
  _estado: EstadoLeadUnico,
  formData: FormData,
): Promise<EstadoLeadUnico> {
  const { supabase, corretor } = await exigirCorretor();

  const nome = String(formData.get("nome") ?? "").trim();
  const telefone = String(formData.get("telefone") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const mensagem = String(formData.get("mensagem") ?? "").trim();
  const empreendimentoId = String(formData.get("empreendimentoId") ?? "").trim();
  const tipo = formData.get("tipo") === "proprietario" ? "proprietario" : "comprador";
  const consentimento = formData.get("consentimento") === "on";

  if (nome.length < 2) return { erro: "Informe o nome do contato." };
  if (!telefone && !email) return { erro: "Informe telefone ou e-mail." };
  if (telefone && !normalizarTelefoneBrasileiro(telefone)) {
    return { erro: "Telefone não parece válido. Use DDD + número." };
  }
  if (!consentimento) {
    return { erro: "Confirme que você tem autorização para tratar estes dados." };
  }

  const { error } = await supabase.from("leads").insert({
    nome: nome.slice(0, 120),
    telefone: telefone.slice(0, 40) || null,
    email: email.slice(0, 160) || null,
    mensagem: mensagem.slice(0, 2000) || null,
    empreendimento_id: empreendimentoId || null,
    corretor_id: corretor.id,
    origem_atribuicao: "manual",
    tipo,
    origem: "painel/manual",
    consentimento_lgpd: true,
  });

  if (error) {
    console.error("[importar] falha ao criar lead avulso:", error.message);
    return { erro: "Não foi possível salvar o contato. Tente de novo." };
  }

  revalidatePath("/corretor/leads");
  revalidatePath("/corretor/funil");
  revalidatePath("/corretor");

  return { ok: `${nome.split(" ")[0]} entrou no seu funil, na etapa “Novo lead”.` };
}

/**
 * Analisa o conteúdo de um e-mail do Gmail/Portais (texto ou HTML) com IA e Regex,
 * sugerindo matching com empreendimentos do catálogo e verificando duplicidade.
 */
export async function analisarEmailGmail(dados: {
  texto: string;
  assunto?: string;
  remetente?: string;
  html?: string;
}): Promise<ResultadoAnaliseEmail> {
  const { supabase } = await exigirCorretor();

  const conteudo = dados.texto || dados.html || "";
  if (!conteudo.trim()) {
    return { erro: "Cole o conteúdo do e-mail ou envie um arquivo antes de continuar." };
  }

  const extraidos = await extrairVariosLeadsComIA({
    text: dados.texto,
    html: dados.html,
    subject: dados.assunto,
    from: dados.remetente,
  });

  if (extraidos.length === 0) {
    return {
      erro: "Nenhum lead com telefone válido foi identificado neste e-mail. Verifique o conteúdo colado.",
    };
  }

  // Buscar empreendimentos para sugerir match inteligente com o catálogo
  const { data: empreendimentos } = await supabase
    .from("empreendimentos")
    .select("id, nome, slug")
    .limit(100);

  // Marcar existentes no banco
  const telefonesE164 = extraidos
    .map((l) => normalizarTelefoneBrasileiro(l.telefone))
    .filter((t): t is string => Boolean(t));

  const existentes = new Set<string>();
  if (telefonesE164.length > 0) {
    const { data: existentesDb } = await supabase
      .from("leads")
      .select("telefone_e164")
      .in("telefone_e164", telefonesE164);

    (existentesDb ?? []).forEach((l) => {
      if (l.telefone_e164) existentes.add(l.telefone_e164);
    });
  }

  const leads: LeadEmailRevisado[] = extraidos.map((item, idx) => {
    const e164 = normalizarTelefoneBrasileiro(item.telefone);
    let empreendimentoSugeridoId: string | null = null;

    if (empreendimentos && (item.imovelInteresse || item.codigoReferencia)) {
      const termo = (item.imovelInteresse || item.codigoReferencia || "").toLowerCase();
      const match = empreendimentos.find(
        (e) => termo.includes(e.nome.toLowerCase()) || e.nome.toLowerCase().includes(termo),
      );
      if (match) empreendimentoSugeridoId = match.id;
    }

    return {
      idTemp: `lead-email-${Date.now()}-${idx}`,
      nome: item.nome || "Lead Interessado",
      telefone: item.telefone,
      telefoneE164: e164,
      email: item.email || null,
      imovelInteresse: item.imovelInteresse || null,
      codigoReferencia: item.codigoReferencia || null,
      portalOrigem: item.portalOrigem,
      mensagemOriginal: item.mensagemOriginal || null,
      valorMencionado: item.valorMencionado || null,
      jaExiste: Boolean(e164 && existentes.has(e164)),
      empreendimentoSugeridoId,
    };
  });

  return { leads };
}

/**
 * Salva os leads extraídos do Gmail no funil de vendas com proteção e fallback seguro.
 */
export async function salvarLeadsDoGmail(
  leads: LeadEmailRevisado[],
  opcoes: { distribuirNaEquipe: boolean; consentimento: boolean },
): Promise<ResumoImportacao> {
  const { supabase, corretor } = await exigirCorretor();

  if (!Array.isArray(leads) || leads.length === 0) {
    return { erro: "Nenhum lead selecionado para importar." };
  }
  if (!opcoes.consentimento) {
    return { erro: "Confirme que você tem autorização para tratar estes dados (LGPD)." };
  }

  const gestor = await souGestor();
  const distribuir = opcoes.distribuirNaEquipe && gestor;

  let inseridos = 0;
  let falhas = 0;
  let ignorados = 0;

  for (const lead of leads) {
    const telefoneNormalizado = normalizarTelefoneBrasileiro(lead.telefone);
    if (!telefoneNormalizado) {
      ignorados++;
      continue;
    }

    const payloadCompleto = {
      nome: (lead.nome || "Lead Interessado").slice(0, 120),
      telefone: lead.telefone.slice(0, 40),
      email: lead.email?.slice(0, 160) || null,
      mensagem:
        lead.mensagemOriginal?.slice(0, 2000) ||
        `Lead importado via Gmail (${lead.portalOrigem})`,
      anuncio_origem: (lead.imovelInteresse || lead.codigoReferencia)?.slice(0, 160) || null,
      portal_origem: lead.portalOrigem,
      empreendimento_id: lead.empreendimentoSugeridoId || null,
      corretor_id: distribuir ? null : corretor.id,
      origem_atribuicao: distribuir ? null : "manual",
      tipo: "comprador",
      origem: `inbound/${lead.portalOrigem}`,
      consentimento_lgpd: true,
    };

    // Safe insert (fallback caso a coluna portal_origem não exista)
    let { data, error } = await supabase.from("leads").insert(payloadCompleto).select("id");
    if (error && error.message.includes("portal_origem")) {
      const { portal_origem: _p, ...payloadBase } = payloadCompleto;
      const resFallback = await supabase.from("leads").insert(payloadBase).select("id");
      error = resFallback.error;
      data = resFallback.data;
    }

    if (error) {
      console.error("[inbound/gmail] Falha ao salvar lead:", error.message);
      falhas++;
    } else {
      inseridos += data?.length ?? 1;
    }
  }

  revalidatePath("/corretor/leads");
  revalidatePath("/corretor/funil");
  revalidatePath("/corretor/importar");
  revalidatePath("/corretor");

  return { inseridos, ignorados, falhas };
}

/**
 * Busca o histórico de auditoria de e-mails recebidos do inbound/Gmail.
 */
export async function buscarHistoricoInbound(): Promise<InboundLogItem[]> {
  try {
    const { supabase } = await exigirCorretor();
    const { data, error } = await supabase
      .from("inbound_logs")
      .select("id, de, para, assunto, status, erro_mensagem, lead_id, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) return [];

    return (data ?? []).map((row) => ({
      id: row.id,
      de: row.de,
      para: row.para,
      assunto: row.assunto,
      status: row.status as "sucesso" | "erro" | "ignorado",
      erroMensagem: row.erro_mensagem,
      leadId: row.lead_id,
      criadoEm: row.created_at,
    }));
  } catch {
    return [];
  }
}

