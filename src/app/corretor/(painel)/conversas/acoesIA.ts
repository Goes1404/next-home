"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getEmpreendimentos } from "@/lib/queries";
import { PROMPT_VERSAO } from "@/lib/whatsapp/aiAgent";
import { executarTurnoDeAtendimento } from "@/lib/whatsapp/turnoDeAtendimento";
import { separarRajada } from "@/lib/whatsapp/rajada";
import { enviarMensagemWhatsapp, enviarMidiaWhatsapp } from "@/lib/whatsapp/provider";
import { registrarInteracao } from "@/lib/whatsapp/telemetria";
import {
  avancarLeadParaPrimeiroContato,
  buscarDossieAtual,
  gravarMensagem,
  historicoRecente,
  liberarConversaPorPalavraChave,
  obterOuCriarConversa,
  registrarResultadoEnvio,
  registrarTentativaDeContato,
  reservarCotaCampanha,
  vincularInteracaoNaMensagem,
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

type InstanciaParaEnvio = {
  id: string;
  corretor_id: string;
  instance_name: string;
  nome_assistente: string | null;
  tom_voz: string | null;
  conectado_em: string | null;
};

/**
 * Miolo compartilhado dos dois botões: gera com o MESMO turno do webhook
 * (`turnoDeAtendimento`) e envia.
 *
 * Se a última fala é do CLIENTE, os balões pendentes viram a "vez do
 * cliente" (mesma régua de `separarRajada` do webhook) e o envio é uma
 * RESPOSTA — sem cota, como toda resposta a quem nos escreveu. Sem
 * pendência é uma ABERTURA por iniciativa nossa: passa por
 * `reservarCotaCampanha` (cota + espaçamento anti-ban), porque todo caminho
 * que FALA com o cliente por iniciativa nossa passa por ali — a regra que
 * campanha e follow-up já seguem. A janela de horário NÃO barra aqui: o
 * corretor está logado, olhando para a conversa, e o clique dele é a mesma
 * classe de decisão de uma mensagem manual do Live Chat.
 */
async function gerarEEnviarPelaIA(params: {
  conversa: { id: string; telefoneCliente: string; leadId: string | null; eTeste: boolean };
  instancia: InstanciaParaEnvio;
  /** Instrução de cenário usada só quando é abertura (sem pendência). */
  instrucaoAbertura: string;
}): Promise<{ erro?: string; enviou: boolean }> {
  const servico = createServiceClient();
  const { conversa, instancia } = params;

  const historicoCompleto = await historicoRecente(conversa.id);
  const { historico, pendentes } = separarRajada(historicoCompleto);
  const ehAbertura = pendentes.length === 0;

  if (ehAbertura) {
    const cota = await reservarCotaCampanha(
      instancia.id,
      instancia.conectado_em ? new Date(instancia.conectado_em) : null,
    );
    if (!cota.permitido) {
      if (cota.motivo === "aguardando_intervalo") {
        const s = Math.max(1, Math.ceil((cota.esperaMs ?? 40_000) / 1000));
        return { enviou: false, erro: `Espaçamento anti-ban: aguarde ~${s}s e tente de novo.` };
      }
      return {
        enviou: false,
        erro: "A cota de envios do dia acabou — é a proteção anti-ban do seu número.",
      };
    }
  }

  const { data: corretor } = await servico
    .from("corretores")
    .select("nome, creci, whatsapp, slug")
    .eq("id", instancia.corretor_id)
    .single();
  if (!corretor) return { enviou: false, erro: "Corretor da conversa não encontrado." };

  const [catalogo, dossie] = await Promise.all([
    getEmpreendimentos().catch(() => []),
    conversa.leadId ? buscarDossieAtual(conversa.leadId) : Promise.resolve(null),
  ]);

  const turno = await executarTurnoDeAtendimento({
    identidade: {
      nomeCorretor: corretor.nome,
      slugCorretor: corretor.slug ?? undefined,
      creciCorretor: corretor.creci,
      telefoneCorretor: corretor.whatsapp,
      nomeAssistente: instancia.nome_assistente ?? "Sofia",
      tomVoz: instancia.tom_voz ?? "profissional e acolhedor",
    },
    catalogo,
    historico,
    dossie,
    vezDoCliente: pendentes,
    fewShot: { corretorId: instancia.corretor_id, conversaAtualId: conversa.id },
    instrucaoExtra: ehAbertura ? params.instrucaoAbertura : undefined,
  });

  if (turno.resposta.meta.fallback) {
    return { enviou: false, erro: "A IA está indisponível agora — tente de novo em instantes." };
  }

  // Abertura é UM balão, como o follow-up: ninguém abre conversa com três
  // mensagens seguidas. Resposta a pendência usa os balões normais.
  const baloes = ehAbertura
    ? [turno.baloes[0] ?? turno.resposta.textoResposta]
    : turno.baloes;

  let todosEnviados = true;
  let idDoPrimeiroBalao: string | undefined;
  for (let i = 0; i < baloes.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 900 + Math.floor(Math.random() * 900)));
    const envio = await enviarMensagemWhatsapp({
      instanceName: instancia.instance_name,
      telefone: conversa.telefoneCliente,
      texto: baloes[i],
    });
    if (!envio.enviado) todosEnviados = false;
    if (i === 0) idDoPrimeiroBalao = envio.messageId;
  }

  const notasDeAnexo: string[] = [];
  for (const anexo of turno.anexos) {
    await new Promise((r) => setTimeout(r, 700 + Math.floor(Math.random() * 600)));
    const envioMidia = await enviarMidiaWhatsapp({
      instanceName: instancia.instance_name,
      telefone: conversa.telefoneCliente,
      tipo: anexo.tipo,
      url: anexo.url,
    });
    if (envioMidia.enviado) notasDeAnexo.push(`📎 ${anexo.titulo || anexo.tipo}: ${anexo.url}`);
    else todosEnviados = false;
  }

  await registrarResultadoEnvio(instancia.id, todosEnviados);
  if (!idDoPrimeiroBalao) {
    return { enviou: false, erro: "Não foi possível enviar agora. Tente de novo em instantes." };
  }

  /*
   * Mesma ordem do webhook (gravacaoDeMensagem.test.ts): mensagem ANTES da
   * telemetria, vínculo DEPOIS — a FK de `interacao_id` exige a linha de
   * `ia_interacoes` já escrita, e inverter custou dois dias de respostas
   * não gravadas.
   */
  const texto = [ehAbertura ? baloes[0] : turno.resposta.textoResposta, ...notasDeAnexo].join(
    "\n\n",
  );
  const mensagemDoBot = await gravarMensagem({
    conversaId: conversa.id,
    remetente: "bot",
    conteudo: texto,
    // Os dois botões só chegam aqui com a conversa recém-liberada — o
    // conteúdo pode ser gravado inteiro (ver privacidadeDaConversa.ts).
    conversaLiberada: true,
    providerMessageId: idDoPrimeiroBalao,
    statusEntrega: "enviada",
  });

  const interacaoId = crypto.randomUUID();
  await registrarInteracao({
    id: interacaoId,
    conversaId: conversa.id,
    corretorId: instancia.corretor_id,
    origem: "painel",
    eTeste: conversa.eTeste,
    promptVersao: PROMPT_VERSAO,
    latenciaMs: turno.resposta.meta.latenciaMs,
    modelo: turno.resposta.meta.modelo,
    acao: "respondida",
    anexosEnviados: notasDeAnexo.length,
    anexosBloqueados: turno.bloqueios,
  });
  if (mensagemDoBot.id) await vincularInteracaoNaMensagem(mensagemDoBot.id, interacaoId);

  // Quem fala com o cliente mexe no funil (etapaAutomatica.test.ts) — e a
  // abertura é iniciativa nossa, então também conta como tentativa (0060).
  if (conversa.leadId) {
    if (ehAbertura) await registrarTentativaDeContato(conversa.leadId);
    await avancarLeadParaPrimeiroContato(conversa.leadId);
  }

  return { enviou: true };
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
    .select("id, nome, telefone_e164, corretor_id, regiao_interesse")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { erro: "Lead não encontrado na sua carteira." };
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

  const primeiroNome = (lead.nome ?? "").trim().split(/\s+/)[0] || "";
  const resultado = await gerarEEnviarPelaIA({
    conversa: {
      id: conversa.id,
      telefoneCliente: conversa.telefoneCliente,
      leadId: lead.id,
      eTeste: conversa.eTeste,
    },
    instancia,
    instrucaoAbertura: [
      "PRIMEIRO CONTATO POR INICIATIVA NOSSA: o corretor pediu que você inicie a conversa com este cliente do CRM.",
      primeiroNome && !primeiroNome.startsWith("WhatsApp")
        ? `O cliente se chama ${primeiroNome} — cumprimente pelo nome.`
        : "Não sabemos o nome do cliente — cumprimente sem inventar nome.",
      lead.regiao_interesse ? `Ele demonstrou interesse na região: ${lead.regiao_interesse}.` : "",
      "Apresente-se em UMA mensagem curta (até 2 frases): diga quem você é e de onde fala, e termine com UMA pergunta leve que puxe conversa. Não liste imóveis nem mande links nesta primeira mensagem.",
    ]
      .filter(Boolean)
      .join(" "),
  });

  revalidatePath("/corretor/conversas");
  revalidatePath(`/corretor/leads/${leadId}`);
  if (resultado.erro) return { erro: resultado.erro, conversaId: conversa.id };
  return { ok: "A IA iniciou a conversa com este lead.", conversaId: conversa.id };
}
