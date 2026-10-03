import { site } from "@/lib/site";
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
  registrarResultadoEnvio,
  registrarTentativaDeContato,
  reservarCotaCampanha,
  vincularInteracaoNaMensagem,
  lerConversaPersistida,
  situacaoDaConversa,
  travarDisparo,
  destravarDisparo,
} from "@/lib/whatsapp/repositorio";
import { fraseDaDecisao, silencioDaConversa } from "./quandoAIaResponde";

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
  /**
   * A conversa acabou de ser entregue à IA pela palavra-chave (plano de
   * ativação, 2.3). A mensagem com a palavra é do corretor e fecharia a
   * rajada: sem tirá-la, o cliente que esperava nunca contaria como pendente.
   */
  desconsiderarUltimaFalaDoCorretor?: boolean;
  /** Só responde: sem pendência do cliente, não abre conversa (regra N1). */
  somenteResposta?: boolean;
}): Promise<{ erro?: string; enviou: boolean }> {
  const servico = createServiceClient();
  const { conversa, instancia } = params;

  /*
   * O clique do corretor (ou a palavra-chave) liga a IA e tira a pausa, mas
   * não passa por cima do que é do CLIENTE: lead que pediu para sair ou que
   * foi transferido para outro corretor não recebe nada daqui. É a camada da
   * conversa de `quandoAIaResponde.ts` — a mesma do webhook. O modo do
   * número não entra: o gesto do corretor é a decisão.
   */
  const persistida = await lerConversaPersistida(conversa.id);
  const silencio = persistida ? silencioDaConversa(situacaoDaConversa(persistida)) : null;
  if (silencio) {
    return {
      enviou: false,
      erro: fraseDaDecisao({ responde: false, ...silencio }, null),
    };
  }

  /*
   * A MESMA trava de resposta do webhook (`resposta:<conversa>`). Sem ela, a
   * palavra-chave e a mensagem do cliente chegando juntas faziam o cliente
   * receber duas respostas (03/10/2026). Quem não pega a trava não fala:
   * outro caminho já está respondendo esta conversa.
   */
  const escopoResposta = `resposta:${conversa.id}`;
  const donoResposta = `ia-${conversa.id}-${Date.now()}`;
  if (!(await travarDisparo(escopoResposta, donoResposta, 55))) {
    return { enviou: false };
  }
  try {
    let historicoCompleto = await historicoRecente(conversa.id);
    if (
      params.desconsiderarUltimaFalaDoCorretor &&
      historicoCompleto[historicoCompleto.length - 1]?.remetente === "corretor"
    ) {
      historicoCompleto = historicoCompleto.slice(0, -1);
    }
    const { historico, pendentes } = separarRajada(historicoCompleto);
    const ehAbertura = pendentes.length === 0;
    if (ehAbertura && params.somenteResposta) return { enviou: false };

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
        nomeAssistente: instancia.nome_assistente ?? site.assistente,
        tomVoz: instancia.tom_voz ?? "profissional e acolhedor",
        regrasDaIa: await regrasDaIaDaInstancia(instancia.id),
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
  } finally {
    await destravarDisparo(escopoResposta, donoResposta);
  }
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

/**
 * As regras do corretor (0154), lidas aqui e não passadas por quem chama:
 * são três caminhos (palavra-chave, "IA assume agora", varredura) e um
 * esquecido faria a IA responder sem elas.
 */
async function regrasDaIaDaInstancia(instanciaId: string): Promise<string | null> {
  const { data } = await createServiceClient()
    .from("corretor_whatsapp_instancias")
    .select("regras_da_ia")
    .eq("id", instanciaId)
    .maybeSingle();
  return data?.regras_da_ia ?? null;
}
