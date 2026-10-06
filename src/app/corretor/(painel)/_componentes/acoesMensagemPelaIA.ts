"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { normalizarTelefoneBr } from "@/lib/whatsapp/telefone";
import { obterOuCriarConversa } from "@/lib/whatsapp/repositorio";
import { enviarRascunhoDaIA, rascunharPelaIA } from "@/lib/whatsapp/aberturaPelaIA";

/**
 * "A IA escreve e eu mando" (06/10/2026), no cartão do funil e na lista.
 *
 * Dois passos, de propósito: `rascunharMensagemPelaIA` só devolve o texto,
 * `enviarMensagemPelaIA` manda o que o corretor revisou. A IA continua sem
 * iniciar conversa sozinha (regra N1): quem decide falar é o toque de enviar.
 */

type Rascunho = { erro?: string; texto?: string };
type Envio = { erro?: string; ok?: string };

async function alvoDoLead(leadId: string) {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sua sessão expirou. Entre de novo." } as const;

  // Leitura pela SESSÃO: a RLS recorta a carteira.
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, nome, telefone, telefone_e164, corretor_id, nao_contatar_em, imovel_interesse_id, empreendimento_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { erro: "Lead não encontrado na sua carteira." } as const;
  // O ADM enxerga a equipe, mas a mensagem sairia do número dele.
  if (lead.corretor_id !== corretor.id) {
    return { erro: "Só o corretor dono do lead manda mensagem por aqui." } as const;
  }
  if (lead.nao_contatar_em) return { erro: "Este lead pediu para não receber mensagens." } as const;

  const telefone = normalizarTelefoneBr(lead.telefone_e164 ?? lead.telefone);
  if (!telefone) return { erro: "Este lead não tem um telefone válido." } as const;

  const servico = createServiceClient();
  const { data: instancia } = await servico
    .from("corretor_whatsapp_instancias")
    .select("id, corretor_id, instance_name, status_conexao, nome_assistente, tom_voz, conectado_em")
    .eq("corretor_id", corretor.id)
    .maybeSingle();
  if (!instancia || instancia.status_conexao !== "conectado") {
    return { erro: "Conecte o seu WhatsApp para mandar mensagem por aqui." } as const;
  }

  const conversa = await obterOuCriarConversa({
    corretorId: corretor.id,
    telefoneCliente: telefone,
    nomeCliente: lead.nome,
  });
  if (!conversa || conversa.leadId !== lead.id) {
    return { erro: "Não consegui abrir a conversa com este lead." } as const;
  }

  const imovelId = lead.imovel_interesse_id ?? lead.empreendimento_id;
  let imovel: string | null = null;
  if (imovelId) {
    const { data } = await servico.from("empreendimentos").select("nome").eq("id", imovelId).maybeSingle();
    imovel = data?.nome ?? null;
  }

  return { lead, instancia, conversa, imovel } as const;
}

/** O que a IA recebe como cenário da abertura. */
function instrucaoDaAbertura(nome: string, imovel: string | null): string {
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? "";
  const ehNomeDeVerdade = primeiroNome && !/^whatsapp$/i.test(primeiroNome);
  return [
    `O corretor pediu que você escreva AGORA a mensagem para ${ehNomeDeVerdade ? primeiroNome : "este contato"}, da carteira dele.`,
    imovel ? `O interesse registrado é no ${imovel}.` : "Não há imóvel de interesse registrado.",
    "Escreva UMA mensagem curta (até 300 caracteres), em tom de pessoa, terminando com UMA pergunta simples.",
    "Se ainda não houve conversa, apresente-se em uma frase como assistente do corretor.",
    "Se já houve conversa, retome do ponto em que parou, sem se apresentar de novo e sem dizer que está retomando.",
    "Não fale valores nem prazos de entrega.",
  ].join(" ");
}

export async function rascunharMensagemPelaIA(leadId: string): Promise<Rascunho> {
  const alvo = await alvoDoLead(leadId);
  if ("erro" in alvo) return { erro: alvo.erro };
  return rascunharPelaIA({
    conversa: { id: alvo.conversa.id, leadId: alvo.lead.id },
    instancia: alvo.instancia,
    instrucaoAbertura: instrucaoDaAbertura(alvo.lead.nome ?? "", alvo.imovel),
  });
}

export async function enviarMensagemPelaIA(leadId: string, texto: string): Promise<Envio> {
  const alvo = await alvoDoLead(leadId);
  if ("erro" in alvo) return { erro: alvo.erro };
  const r = await enviarRascunhoDaIA({
    conversa: {
      id: alvo.conversa.id,
      telefoneCliente: alvo.conversa.telefoneCliente,
      leadId: alvo.lead.id,
    },
    instancia: alvo.instancia,
    texto,
  });
  if (!r.enviou) return { erro: r.erro ?? "Não foi possível enviar agora." };
  revalidatePath("/corretor/leads");
  revalidatePath("/corretor/funil");
  revalidatePath("/corretor/pessoas");
  return { ok: "Mensagem enviada. Quando o lead responder, a IA assume." };
}
