import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/types";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";
import { ONDA_ATUAL } from "./ferramentas";
import { comAviso } from "./historico";
import { lerCentral, type CentralDaPlataforma } from "./numeroDoCentral";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * Os avisos espontâneos pelo número central (spec 4.7; fase 2b, Frente J).
 *
 * Hoje o resumo do dia e o lembrete das anotações saem do número do PRÓPRIO
 * corretor para ele mesmo, e o celular não toca (cai na conversa "Você");
 * lead novo e visita na próxima hora são só notificação no celular. Pelo
 * central, a mensagem chega de outro número: toca, e a pessoa responde ali
 * mesmo ("marca visita com ele amanhã").
 *
 * Este é o ÚNICO ponto que decide o canal. Cada chamador pergunta
 * `avisoPeloCentral(...)`: `true` = saiu pelo central (e entrou no
 * histórico); `false` = segue o caminho de hoje, igual. Só os avisos do
 * desenho chamam isto (anti-objetivo "avisos demais", 6.2): resumo do dia,
 * lead novo, visita na próxima hora e lembrete. Lead parado vai só dentro do
 * resumo. Os alertas de conversa (lead quente, cliente sem resposta…)
 * continuam no canal de hoje: trocá-los faria o celular tocar a cada fala.
 *
 * Nenhum aviso chama IA: não conta na cota nem registra consumo (4.8).
 */

/** A onda que liga os avisos pelo central (spec 5: onda 2). */
export const ONDA_DOS_AVISOS = 2;

export type Canal = "central" | "hoje";

/**
 * A decisão, pura: só pelo central com a onda ligada, o central conectado, o
 * recurso ligado na imobiliária (`central_whatsapp_ativo`), a pessoa ativa,
 * com WhatsApp no perfil, e que JÁ ESCREVEU ao central (`jaConversou`: tem
 * linha em `central_estado`). Qualquer outra coisa é o canal de hoje.
 *
 * O `jaConversou` veio do primeiro dia no ar (30/10/2026): o central caiu
 * minutos depois de conectar, e o número novo puxar conversa com a equipe
 * inteira (resumo das 8h para todos) é o padrão que faz o WhatsApp derrubar
 * número novo. O central só fala por conta própria com quem já falou com ele.
 */
export function canalDoAviso(e: {
  onda: number;
  central: Pick<CentralDaPlataforma, "statusConexao"> | null;
  grupoLigado: boolean;
  pessoa: { ativo: boolean | null; whatsapp: string | null } | null;
  jaConversou: boolean;
}): Canal {
  if (e.onda < ONDA_DOS_AVISOS) return "hoje";
  if (e.central?.statusConexao !== "conectado") return "hoje";
  if (!e.grupoLigado) return "hoje";
  if (!e.pessoa?.ativo || !e.pessoa.whatsapp) return "hoje";
  if (!e.jaConversou) return "hoje";
  return "central";
}

export type DestinoPeloCentral = { instanceName: string; telefone: string };

/**
 * Lê o que a decisão precisa e devolve para onde mandar, ou `null` (canal de
 * hoje). Com a onda desligada não lê NADA: em produção (onda 0) os avisos
 * seguem exatamente o caminho de antes, sem consulta a mais. Nunca lança.
 */
export async function destinoPeloCentral(
  supabase: Supa,
  corretorId: string,
  onda: number = ONDA_ATUAL,
): Promise<DestinoPeloCentral | null> {
  if (onda < ONDA_DOS_AVISOS) return null;
  try {
    const central = await lerCentral();
    // Sem central conectado a decisão é "hoje" de qualquer jeito: nem lê a pessoa.
    if (central?.statusConexao !== "conectado") return null;

    const { data: pessoa } = await supabase
      .from("corretores")
      .select("whatsapp, ativo, grupo_id")
      .eq("id", corretorId)
      .maybeSingle();
    if (!pessoa?.grupo_id) return null;
    const [{ data: grupo }, { data: conversa }] = await Promise.all([
      supabase.from("grupos").select("central_whatsapp_ativo").eq("id", pessoa.grupo_id).maybeSingle(),
      supabase.from("central_estado").select("id").eq("corretor_id", corretorId).eq("grupo_id", pessoa.grupo_id).limit(1).maybeSingle(),
    ]);

    const canal = canalDoAviso({
      onda,
      central,
      grupoLigado: grupo?.central_whatsapp_ativo === true,
      pessoa,
      jaConversou: Boolean(conversa),
    });
    return canal === "central" && pessoa.whatsapp ? { instanceName: central.instanceName, telefone: pessoa.whatsapp } : null;
  } catch (err) {
    console.warn("[aviso pelo central] canal não lido; vai pelo de hoje:", err);
    return null;
  }
}

/**
 * Manda o aviso pelo central, se for o canal desta pessoa. `true` só quando
 * saiu: envio que falhou devolve `false`, e o chamador segue o caminho de
 * hoje (o aviso não se perde por o central estar fora no minuto). Nunca
 * lança — quem chama está no meio do tique.
 */
export async function avisoPeloCentral(
  supabase: Supa,
  corretorId: string,
  texto: string,
  agora: Date = new Date(),
): Promise<boolean> {
  const destino = await destinoPeloCentral(supabase, corretorId);
  if (!destino) return false;
  try {
    const envio = await enviarMensagemWhatsapp({ instanceName: destino.instanceName, telefone: destino.telefone, texto });
    if (!envio.enviado) {
      console.warn("[aviso pelo central] não saiu; vai pelo canal de hoje:", envio.motivo);
      return false;
    }
  } catch (err) {
    console.warn("[aviso pelo central] falhou; vai pelo canal de hoje:", err);
    return false;
  }
  await registrarAvisoNoHistorico(supabase, corretorId, texto, agora);
  return true;
}

/**
 * Acrescenta o aviso ao histórico da conversa com o central, como fala do
 * central, para a resposta da pessoa ter contexto.
 *
 * A conversa grava o estado inteiro de uma vez (`salvarEstado`); para não
 * apagar uma fala gravada no meio, a escrita aqui só vale se `atualizado_em`
 * ainda é o lido (troca condicional) e tenta duas vezes. Se a pessoa estiver
 * falando com o central no MESMO segundo, o aviso pode ficar fora do
 * histórico — a mensagem já saiu; só o contexto da resposta se perde.
 * Nunca lança: falhar aqui não pode fazer o tique reenviar o aviso.
 */
export async function registrarAvisoNoHistorico(supabase: Supa, corretorId: string, texto: string, agora: Date): Promise<void> {
  try {
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      const { data: atual, error } = await supabase
        .from("central_estado")
        .select("historico, atualizado_em")
        .eq("corretor_id", corretorId)
        .maybeSingle();
      if (error) {
        console.warn("[aviso pelo central] histórico não lido:", error.message);
        return;
      }
      const historico = JSON.parse(JSON.stringify(comAviso(atual?.historico, texto, agora))) as Json;

      if (!atual) {
        // Primeira conversa: a linha nasce com o aviso. O grupo é carimbado
        // pelo gatilho da 0249 a partir do corretor. Conflito = a pessoa
        // escreveu agora e a conversa criou a linha; relê e tenta de novo.
        const { error: erroAoCriar } = await supabase
          .from("central_estado")
          .insert({ corretor_id: corretorId, historico, atualizado_em: agora.toISOString() });
        if (!erroAoCriar) return;
        continue;
      }

      const { data: gravou } = await supabase
        .from("central_estado")
        .update({ historico, atualizado_em: new Date().toISOString() })
        .eq("corretor_id", corretorId)
        .eq("atualizado_em", atual.atualizado_em)
        .select("corretor_id");
      if (gravou && gravou.length > 0) return;
    }
    console.warn("[aviso pelo central] histórico mudou duas vezes; aviso fora do contexto:", corretorId);
  } catch (err) {
    console.warn("[aviso pelo central] histórico não gravado:", err);
  }
}

/**
 * Quem recebe o resumo do dia pelo central mesmo sem o próprio número
 * conectado: com o central, o número do corretor deixa de ser o canal, e o
 * corretor cujo WhatsApp caiu é justamente quem mais precisa do aviso.
 * Pessoas ativas, com WhatsApp no perfil, das imobiliárias com o recurso
 * ligado, que já escreveram ao central (`canalDoAviso`). Onda desligada ou
 * central fora: lista vazia, sem consulta.
 */
export async function corretoresComAvisoPeloCentral(supabase: Supa, onda: number = ONDA_ATUAL): Promise<string[]> {
  if (onda < ONDA_DOS_AVISOS) return [];
  try {
    const central = await lerCentral();
    if (central?.statusConexao !== "conectado") return [];
    const { data: grupos } = await supabase.from("grupos").select("id").eq("central_whatsapp_ativo", true);
    const ids = (grupos ?? []).map((g) => g.id);
    if (ids.length === 0) return [];
    const { data: pessoas } = await supabase
      .from("corretores")
      .select("id, grupo_id")
      .in("grupo_id", ids)
      .eq("ativo", true)
      .not("whatsapp", "is", null);
    const candidatos = (pessoas ?? []).map((p) => p.id);
    if (candidatos.length === 0) return [];
    const { data: conversas } = await supabase
      .from("central_estado")
      .select("corretor_id")
      .in("grupo_id", ids)
      .in("corretor_id", candidatos);
    const jaConversaram = new Set((conversas ?? []).map((c) => c.corretor_id));
    return candidatos.filter((id) => jaConversaram.has(id));
  } catch (err) {
    console.warn("[aviso pelo central] lista do resumo não lida:", err);
    return [];
  }
}
