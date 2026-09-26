"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { gerarEEnviarPelaIA, instrucaoDePrimeiroContato } from "@/lib/whatsapp/aberturaPelaIA";
import { separarRajada } from "@/lib/whatsapp/rajada";
import {
  historicoRecente,
  liberarConversaPorPalavraChave,
  obterOuCriarConversa,
} from "@/lib/whatsapp/repositorio";

/**
 * Os dois botões de IA do painel (05/09/2026):
 *
 *   - "IA assume agora" (conversa)  → `assumirConversaComIA`
 *   - "Iniciar conversa com IA" (ficha do lead) → `iniciarConversaPelaIA`
 *
 * Nasceram junto com a inversão da trava (`exigeLiberacaoExplicita`):
 * número desconhecido agora fica travado SEMPRE, e estes botões são o
 * caminho de liberação que não depende de o corretor lembrar a
 * palavra-chave no meio do atendimento — a queixa real que os motivou.
 */

export type ResultadoIA = { erro?: string; ok?: string; respondeu?: boolean; conversaId?: string };

async function exigirSessao() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/corretor/entrar");
  return supabase;
}

/**
 * O botão "IA assume agora" da conversa.
 *
 * Liga as TRÊS condições de `botDeveResponder` de uma vez e, se a última
 * fala é do cliente (pendência sem resposta), a IA responde NA HORA —
 * assumir e ficar em silêncio até a próxima mensagem parecia botão
 * quebrado.
 */
export async function assumirConversaComIA(conversaId: string): Promise<ResultadoIA> {
  const supabase = await exigirSessao();

  // A escrita via cliente de SESSÃO é a autorização: a RLS da 0018 recorta
  // a carteira — conversa de outro corretor não atualiza linha nenhuma.
  const { data: liberada, error } = await supabase
    .from("whatsapp_conversas")
    .update({ bot_ativo: true, pausado_humano_ate: null, liberado_por_palavra_chave: true })
    .eq("id", conversaId)
    .select("id, telefone_cliente, lead_id, e_teste, corretor_id");
  if (error || !liberada || liberada.length === 0) {
    return { erro: "Conversa não encontrada na sua carteira." };
  }
  const conversa = liberada[0];

  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("id, corretor_id, instance_name, status_conexao, nome_assistente, tom_voz, conectado_em")
    .eq("corretor_id", conversa.corretor_id)
    .maybeSingle();

  if (!instancia || instancia.status_conexao !== "conectado") {
    // Sem número no ar dá para assumir (as flags já estão gravadas), só não
    // dá para responder já — dizer isso é melhor que fingir que respondeu.
    revalidatePath("/corretor/conversas");
    return { ok: "IA assumiu a conversa. Conecte o número para ela responder." };
  }

  const pendencia = separarRajada(await historicoRecente(conversaId)).pendentes.length > 0;
  if (!pendencia) {
    revalidatePath("/corretor/conversas");
    return { ok: "IA assumiu — responde na próxima mensagem do cliente." };
  }

  const resultado = await gerarEEnviarPelaIA({
    conversa: {
      id: conversa.id,
      telefoneCliente: conversa.telefone_cliente,
      leadId: conversa.lead_id,
      eTeste: conversa.e_teste ?? false,
    },
    instancia,
    instrucaoAbertura: "",
  });

  revalidatePath("/corretor/conversas");
  if (resultado.erro) return { ok: "IA assumiu a conversa.", erro: resultado.erro };
  return { ok: "IA assumiu e já respondeu o cliente.", respondeu: true };
}

/**
 * O botão "Iniciar conversa com IA" da ficha do lead.
 *
 * Cria (ou reaproveita) a conversa do telefone do lead, ativa a IA e manda
 * a primeira mensagem — apresentação curta, gerada pelo mesmo agente do
 * atendimento.
 */
export async function iniciarConversaPelaIA(leadId: string): Promise<ResultadoIA> {
  const supabase = await exigirSessao();

  // RLS recorta: lead de outro corretor simplesmente não vem.
  const { data: lead } = await supabase
    .from("leads")
    .select("id, nome, telefone_e164, corretor_id, regiao_interesse, nao_contatar_em")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { erro: "Lead não encontrado na sua carteira." };
  /*
   * Ele pediu para não ser procurado (0110). Este é o terceiro caminho que
   * fala por iniciativa nossa — os outros dois são a campanha (`elegivel`)
   * e o runner de follow-up.
   *
   * Barra a IA, não o corretor: mandar mensagem à mão pelo Live Chat
   * continua liberado, porque ali é uma pessoa decidindo, com o histórico
   * na frente. O que não pode é a máquina reabrir sozinha.
   */
  if (lead.nao_contatar_em) {
    return {
      erro: "Este cliente pediu para não receber mais mensagens. Se quiser retomar, fale com ele pelo Live Chat.",
    };
  }
  if (!lead.telefone_e164) return { erro: "Este lead está sem telefone válido no cadastro." };
  if (!lead.corretor_id) return { erro: "Este lead está sem corretor responsável." };

  const { data: instancia } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("id, corretor_id, instance_name, status_conexao, nome_assistente, tom_voz, conectado_em")
    .eq("corretor_id", lead.corretor_id)
    .maybeSingle();
  if (!instancia || instancia.status_conexao !== "conectado") {
    return { erro: "O número não está conectado — conecte o WhatsApp antes." };
  }

  const conversa = await obterOuCriarConversa({
    corretorId: lead.corretor_id,
    telefoneCliente: lead.telefone_e164,
    nomeCliente: lead.nome,
  });
  if (!conversa) return { erro: "Não foi possível abrir a conversa deste lead." };

  // Iniciar pela ficha é autorização explícita — mesmo peso do botão de
  // assumir e da palavra-chave: abre as três condições de uma vez.
  await liberarConversaPorPalavraChave(conversa.id);

  const resultado = await gerarEEnviarPelaIA({
    conversa: {
      id: conversa.id,
      telefoneCliente: conversa.telefoneCliente,
      leadId: lead.id,
      eTeste: conversa.eTeste,
    },
    instancia,
    instrucaoAbertura: instrucaoDePrimeiroContato({
      nome: lead.nome,
      regiaoInteresse: lead.regiao_interesse,
    }),
  });

  revalidatePath("/corretor/conversas");
  revalidatePath(`/corretor/leads/${leadId}`);
  if (resultado.erro) return { erro: resultado.erro, conversaId: conversa.id };
  return { ok: "A IA iniciou a conversa com este lead.", conversaId: conversa.id };
}
