import "server-only";
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
 * A abertura de conversa pela IA — o miolo dos botões do painel e do
 * primeiro contato automático com lead de portal (26/09/2026).
 *
 * Mora fora de `acoesIA.ts` porque aquele arquivo é "use server": toda
 * função exportada de lá vira endpoint HTTP, e uma que envia mensagem SEM
 * conferir sessão seria uma porta aberta. Aqui é `server-only`, chamado só
 * por quem já decidiu que pode.
 */

export type InstanciaParaEnvio = {
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
export async function gerarEEnviarPelaIA(params: {
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
 * A instrução da primeira mensagem — a mesma para o botão da ficha e para
 * o lead de portal, mudando só o que se sabe de onde ele veio.
 */
export function instrucaoDePrimeiroContato(p: {
  nome: string | null;
  regiaoInteresse?: string | null;
  /** De onde o pedido de contato veio, quando veio de fora ("ZAP Imóveis"). */
  origem?: string | null;
  imovel?: string | null;
}): string {
  const primeiroNome = (p.nome ?? "").trim().split(/\s+/)[0] || "";
  return [
    p.origem
      ? `PRIMEIRO CONTATO: este cliente pediu contato pelo ${p.origem}${p.imovel ? `, sobre o ${p.imovel}` : ""}. Ele ESTÁ esperando ser procurado — diga que viu o interesse dele.`
      : "PRIMEIRO CONTATO POR INICIATIVA NOSSA: o corretor pediu que você inicie a conversa com este cliente do CRM.",
    primeiroNome && !primeiroNome.startsWith("WhatsApp")
      ? `O cliente se chama ${primeiroNome} — cumprimente pelo nome.`
      : "Não sabemos o nome do cliente — cumprimente sem inventar nome.",
    p.regiaoInteresse ? `Ele demonstrou interesse na região: ${p.regiaoInteresse}.` : "",
    "Apresente-se em UMA mensagem curta (até 2 frases): diga quem você é e de onde fala, e termine com UMA pergunta leve que puxe conversa. Não liste imóveis nem mande links nesta primeira mensagem.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Nome legível do portal gravado em `leads.portal_origem`. */
export const NOME_DO_PORTAL: Record<string, string> = {
  zap_imoveis: "ZAP Imóveis",
  vivareal: "VivaReal",
  olx: "OLX",
  imovelweb: "Imovelweb",
  meta_ads: "anúncio do Facebook/Instagram",
  site_direto: "site",
  email_outro: "anúncio",
};

/** Só lead que chegou há menos disso ganha abertura automática. */
export const JANELA_DO_PRIMEIRO_CONTATO_H = 24;

/**
 * Primeiro contato automático com quem PEDIU contato por um portal ou por
 * formulário de anúncio (26/09/2026).
 *
 * Roda no tique dos follow-ups, DEPOIS da janela comercial (quem chega às
 * 3h recebe às 9h: propaganda de madrugada é o que faz alguém denunciar o
 * número) e com teto por tique (cada abertura custa ~20s de IA; a função
 * tem 60s). Passa pelas mesmas travas de todo caminho que fala por
 * iniciativa nossa: não-perturbe, cota e espaçamento (em
 * `gerarEEnviarPelaIA`), e avança o funil.
 *
 * O claim (`primeiro_contato_auto_em`) é gravado ANTES do envio: se o envio
 * falhar, a abertura não é repetida a cada 5 min — o lead aparece no resumo
 * do dia e o corretor decide. Conversa que já tem mensagem (o corretor foi
 * mais rápido) é marcada e pulada.
 */
export async function abrirConversasDePortal(limite = 2): Promise<number> {
  const supabase = createServiceClient();
  const desde = new Date(Date.now() - JANELA_DO_PRIMEIRO_CONTATO_H * 3600_000).toISOString();
  const { data: candidatos } = await supabase
    .from("leads")
    .select(
      "id, nome, telefone_e164, corretor_id, regiao_interesse, portal_origem, meta_lead_id, nao_contatar_em, empreendimento:empreendimentos!leads_empreendimento_id_fkey(nome)",
    )
    .is("primeiro_contato_auto_em", null)
    .is("nao_contatar_em", null)
    .is("arquivado_em", null)
    .not("corretor_id", "is", null)
    .not("telefone_e164", "is", null)
    .or("portal_origem.not.is.null,meta_lead_id.not.is.null")
    .gte("created_at", desde)
    .order("created_at", { ascending: true })
    .limit(limite * 3);

  let enviados = 0;
  for (const lead of candidatos ?? []) {
    if (enviados >= limite) break;

    const { data: claim } = await supabase
      .from("leads")
      .update({ primeiro_contato_auto_em: new Date().toISOString() })
      .eq("id", lead.id)
      .is("primeiro_contato_auto_em", null)
      .select("id");
    if (!claim || claim.length === 0) continue;

    const { data: instancia } = await supabase
      .from("corretor_whatsapp_instancias")
      .select("id, corretor_id, instance_name, status_conexao, nome_assistente, tom_voz, conectado_em")
      .eq("corretor_id", lead.corretor_id!)
      .maybeSingle();
    if (!instancia || instancia.status_conexao !== "conectado") continue;

    const conversa = await obterOuCriarConversa({
      corretorId: lead.corretor_id!,
      telefoneCliente: lead.telefone_e164!,
      nomeCliente: lead.nome,
    });
    if (!conversa) continue;

    // O corretor (ou o próprio cliente) já falou: não é mais primeiro contato.
    const { count } = await supabase
      .from("whatsapp_mensagens")
      .select("id", { count: "exact", head: true })
      .eq("conversa_id", conversa.id);
    if ((count ?? 0) > 0) continue;

    // Pedir contato no portal é a autorização: abre as três condições.
    await liberarConversaPorPalavraChave(conversa.id);

    const imovel = Array.isArray(lead.empreendimento) ? lead.empreendimento[0] : lead.empreendimento;
    const origem = lead.portal_origem
      ? (NOME_DO_PORTAL[lead.portal_origem] ?? "anúncio")
      : "anúncio do Facebook/Instagram";
    const r = await gerarEEnviarPelaIA({
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
        origem,
        imovel: imovel?.nome ?? null,
      }),
    });
    if (r.enviou) enviados++;
    else console.warn("[primeiro contato] não saiu:", lead.id, r.erro);
  }
  return enviados;
}
