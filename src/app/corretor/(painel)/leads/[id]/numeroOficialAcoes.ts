"use server";

import { revalidatePath } from "next/cache";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { primeiroNomeUtil } from "@/lib/leads/nomeExibido";
import { createServiceClient } from "@/lib/supabase/service";
import { registrarConsentimento } from "@/lib/whatsapp/oficial/consentimento";
import { enviarTextoOficial } from "@/lib/whatsapp/oficial/envio";
import { numeroDoGrupo, tokenDoNumero } from "@/lib/whatsapp/oficial/numeros";
import { janelaAberta } from "@/lib/whatsapp/oficial/painelDoLead";

/**
 * O que o corretor DONO do lead faz com a conversa do número oficial (F3).
 *
 * Toda ação confere o dono pela sessão antes de tocar em qualquer coisa: as
 * tabelas do número oficial são só do servidor (0256), então quem recorta é
 * este arquivo, não a RLS. O gestor não entra aqui pelo lead de outro
 * corretor — ele não lê conversa (0134).
 *
 * Desvio consciente do roadmap (03/11/2026): quem respondeu ao número oficial
 * NÃO sai da régua de primeiro contato do número do corretor. A passagem é
 * manual — "Assumir pelo meu WhatsApp" abre o WhatsApp do corretor no
 * telefone do cliente, e a primeira mensagem por lá é dele, digitada por ele.
 */

type Resultado = { ok: string; link?: string } | { erro: string };

const LIMITE_DO_TEXTO = 4096;

type Dono = {
  corretor: NonNullable<Awaited<ReturnType<typeof getCorretorLogado>>>;
  supabase: ReturnType<typeof createServiceClient>;
  lead: { id: string; nome: string; corretor_id: string | null };
};

// Tipo de retorno explícito: inferido, o TypeScript normaliza a união com
// `erro?: undefined` no ramo de sucesso, e o `"erro" in` deixa de estreitar.
async function donoDoLead(leadId: string): Promise<Dono | { erro: string }> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("leads")
    .select("id, nome, corretor_id")
    .eq("id", leadId)
    .eq("grupo_id", corretor.grupoId)
    .maybeSingle();
  const lead = data as { id: string; nome: string; corretor_id: string | null } | null;
  if (!lead || lead.corretor_id !== corretor.id) {
    return { erro: "Só o corretor dono do lead fala com ele pelo número oficial." };
  }
  return { corretor, supabase, lead };
}

async function conversaDoLead(
  supabase: ReturnType<typeof createServiceClient>,
  grupoId: string,
  leadId: string,
  conversaId: string,
) {
  const { data } = await supabase
    .from("whatsapp_oficial_conversas")
    .select("id, numero_oficial_id, telefone, janela_ate, assumida_em")
    .eq("id", conversaId)
    .eq("grupo_id", grupoId)
    .eq("lead_id", leadId)
    .maybeSingle();
  return data as {
    id: string;
    numero_oficial_id: string;
    telefone: string;
    janela_ate: string | null;
    assumida_em: string | null;
  } | null;
}

/**
 * Manda um texto pelo número oficial, dentro das 24 h que a resposta do
 * cliente abriu. Fora delas a Meta só aceita modelo aprovado (erro 131047), e
 * a tela já manda o corretor para o WhatsApp dele.
 */
async function mandarTexto(
  supabase: ReturnType<typeof createServiceClient>,
  grupoId: string,
  conversa: { id: string; numero_oficial_id: string; telefone: string; janela_ate: string | null },
  texto: string,
): Promise<{ ok: true } | { erro: string }> {
  if (!janelaAberta(conversa.janela_ate)) {
    return { erro: "Passaram as 24 h desde a última mensagem do cliente: pelo número oficial agora só sai modelo aprovado. Chame pelo seu WhatsApp." };
  }
  const numero = await numeroDoGrupo(supabase, grupoId);
  if (!numero || numero.id !== conversa.numero_oficial_id) return { erro: "Esta conversa é de um número oficial que não está mais ligado." };
  if (numero.estado !== "ativo") return { erro: "O número oficial está pausado. O gestor vê o motivo em Administração → WhatsApp oficial." };
  const credencial = tokenDoNumero(numero);
  if ("erro" in credencial) return { erro: credencial.erro };

  const r = await enviarTextoOficial({
    remetente: { phoneNumberId: numero.phone_number_id, token: credencial.token },
    telefone: conversa.telefone,
    texto,
  });
  if (!r.enviado) {
    return {
      erro: r.erro.incerto
        ? "Não deu para confirmar o envio com a Meta. Confira a conversa daqui a pouco antes de mandar de novo."
        : `A Meta recusou a mensagem: ${r.erro.mensagem}`,
    };
  }
  const agora = new Date().toISOString();
  const { error } = await supabase.from("whatsapp_oficial_mensagens").insert({
    conversa_id: conversa.id,
    remetente: "corretor",
    tipo: "texto",
    conteudo: texto,
    wamid: r.wamid,
    status_entrega: "enviada",
  });
  if (error) console.error("[oficial] mensagem do corretor não registrada:", error.message);
  await supabase
    .from("whatsapp_oficial_conversas")
    .update({ ultima_mensagem: texto.slice(0, 500), ultima_interacao_em: agora })
    .eq("id", conversa.id);
  return { ok: true };
}

/**
 * "Assumir pelo meu WhatsApp": a IA para nesta conversa e a tela abre o
 * WhatsApp do corretor no telefone do cliente. Com `avisar`, sai antes pelo
 * número oficial um recado curto (só dentro das 24 h), para o cliente não
 * estranhar a mensagem de um número novo.
 */
export async function assumirConversaOficial(leadId: string, conversaId: string, avisar: boolean): Promise<Resultado> {
  const dono = await donoDoLead(leadId);
  if ("erro" in dono) return { erro: dono.erro };
  const { corretor, supabase, lead } = dono;
  const conversa = await conversaDoLead(supabase, corretor.grupoId, leadId, conversaId);
  if (!conversa) return { erro: "Conversa não encontrada." };

  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("whatsapp_oficial_conversas")
    .update({
      ia_ativa: false,
      assumida_em: conversa.assumida_em ?? agora,
      assumida_por: corretor.id,
      atualizado_em: agora,
    })
    .eq("id", conversa.id);
  if (error) return { erro: "Não consegui marcar a conversa como sua agora. Tente de novo." };

  let recado = "";
  if (avisar) {
    const texto = `Oi, ${primeiroNomeUtil(lead.nome) || "tudo bem"}! Aqui é ${primeiroNomeUtil(corretor.nome) || "o seu corretor"}. Vou continuar o nosso papo pelo meu WhatsApp, tá bem?`;
    const r = await mandarTexto(supabase, corretor.grupoId, conversa, texto);
    recado = "erro" in r ? ` O recado pelo número oficial não saiu: ${r.erro}` : " O cliente recebeu o recado pelo número oficial.";
  }

  await supabase.from("lead_interacoes").insert({
    lead_id: leadId,
    corretor_id: corretor.id,
    tipo: "sistema",
    conteudo: "Assumiu a conversa do número oficial; o atendimento segue pelo WhatsApp do corretor.",
    detalhes: { canal: "oficial", conversa_oficial_id: conversa.id, avisou: avisar },
  });

  revalidatePath(`/corretor/leads/${leadId}`);
  return { ok: `A conversa é sua: a IA parou de responder por lá.${recado}`, link: `https://wa.me/${conversa.telefone}` };
}

/** O corretor responde pelo próprio número oficial (dentro das 24 h). A IA para. */
export async function responderPeloNumeroOficial(leadId: string, conversaId: string, texto: string): Promise<Resultado> {
  const limpo = texto.trim();
  if (!limpo) return { erro: "Escreva a mensagem." };
  if (limpo.length > LIMITE_DO_TEXTO) return { erro: `A mensagem passa de ${LIMITE_DO_TEXTO} caracteres.` };

  const dono = await donoDoLead(leadId);
  if ("erro" in dono) return { erro: dono.erro };
  const { corretor, supabase } = dono;
  const conversa = await conversaDoLead(supabase, corretor.grupoId, leadId, conversaId);
  if (!conversa) return { erro: "Conversa não encontrada." };

  const r = await mandarTexto(supabase, corretor.grupoId, conversa, limpo);
  if ("erro" in r) return r;

  // Gente falando: a IA sai da frente, como na guarda humana da Evolution.
  const agora = new Date().toISOString();
  await supabase
    .from("whatsapp_oficial_conversas")
    .update({ ia_ativa: false, assumida_em: conversa.assumida_em ?? agora, assumida_por: corretor.id, atualizado_em: agora })
    .eq("id", conversa.id);

  revalidatePath(`/corretor/leads/${leadId}`);
  return { ok: "Enviada pelo número oficial. A IA parou nesta conversa." };
}

/** Devolve a conversa à IA (se o gestor deixou a IA responder no número). */
export async function devolverConversaParaIA(leadId: string, conversaId: string): Promise<Resultado> {
  const dono = await donoDoLead(leadId);
  if ("erro" in dono) return { erro: dono.erro };
  const { corretor, supabase } = dono;
  const conversa = await conversaDoLead(supabase, corretor.grupoId, leadId, conversaId);
  if (!conversa) return { erro: "Conversa não encontrada." };
  const numero = await numeroDoGrupo(supabase, corretor.grupoId);
  if (!numero || numero.resposta !== "ia") return { erro: "A IA não responde neste número: o gestor escolheu outra resposta." };

  const { error } = await supabase
    .from("whatsapp_oficial_conversas")
    .update({ ia_ativa: true, assumida_em: null, assumida_por: null, atualizado_em: new Date().toISOString() })
    .eq("id", conversa.id);
  if (error) return { erro: "Não consegui devolver agora. Tente de novo." };
  revalidatePath(`/corretor/leads/${leadId}`);
  return { ok: "A IA volta a responder na próxima mensagem do cliente." };
}

/**
 * O consentimento de ofertas pelo WhatsApp (finalidade marketing), dito pelo
 * cliente ao corretor. É ele que deixa o lead entrar na lista oficial.
 */
export async function registrarConsentimentoDeOfertas(leadId: string, concedido: boolean): Promise<Resultado> {
  const dono = await donoDoLead(leadId);
  if ("erro" in dono) return { erro: dono.erro };
  const ok = await registrarConsentimento(dono.supabase, { leadId, concedido, origem: "painel_corretor" });
  if (!ok) return { erro: "Não consegui registrar agora. Tente de novo." };
  revalidatePath(`/corretor/leads/${leadId}`);
  return {
    ok: concedido
      ? "Registrado: o cliente autorizou ofertas pelo WhatsApp. Ele pode entrar nas listas pelo número oficial."
      : "Registrado: o cliente não quer ofertas pelo WhatsApp. Ele fica fora das listas pelo número oficial.",
  };
}
