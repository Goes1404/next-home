import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";
import type { AvisoDaConexao } from "@/lib/whatsapp/saudeDaConexao";
import { lerCentral } from "./numeroDoCentral";

/**
 * O aviso de queda do número do corretor, pelo número central (pedido do
 * dono em 30/10/2026; plano da onda 0, Task 10).
 *
 * O número desconecta DO SISTEMA (Evolution), mas o WhatsApp continua no
 * celular do corretor: a mensagem do central chega. Antes, o aviso era só
 * por e-mail, e quem não tinha e-mail cadastrado ficava sem aviso nenhum.
 *
 * Nunca sai pela instância do próprio corretor (que está caída) e nunca
 * lança: quem chama está no meio do ciclo do disparador.
 */

/** O texto do WhatsApp: o mesmo título e explicação do e-mail, e o caminho para reconectar. */
export function montarWhatsappDeQueda(aviso: AvisoDaConexao, p: { nome: string; urlPainel: string }): string {
  const primeiro = p.nome.trim().split(/\s+/)[0] || p.nome;
  return [
    `${primeiro}, *${aviso.titulo}*`,
    aviso.detalhe,
    "",
    `Para reconectar: ${p.urlPainel.replace(/\/$/, "")}/corretor/whatsapp`,
  ].join("\n");
}

/**
 * Só queda recente vai pelo central (30/10/2026, o primeiro dia no ar). O
 * aviso por e-mail nunca saiu sem a chave do provedor, então quedas de
 * semanas atrás seguiam "sem aviso": ao conectar, o central mandaria na hora,
 * de um número novo, avisos velhos a quem nunca falou com ele — o padrão que
 * faz o WhatsApp derrubar número novo. Queda antiga fica para o painel e o
 * e-mail.
 */
export const QUEDA_RECENTE_PELO_CENTRAL_MS = 24 * 60 * 60 * 1000;

export function quedaRecenteParaOCentral(caiuEm: string | null, agora: Date): boolean {
  if (!caiuEm) return false;
  const quando = Date.parse(caiuEm);
  return Number.isFinite(quando) && agora.getTime() - quando <= QUEDA_RECENTE_PELO_CENTRAL_MS;
}

export function montarWhatsappDeVolta(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] || nome;
  return `${primeiro}, seu WhatsApp voltou a conectar. Está tudo funcionando de novo.`;
}

/**
 * Manda pelo central para o WhatsApp do perfil do corretor. Só manda com o
 * central conectado, o recurso ligado na imobiliária e o corretor ativo.
 */
export async function avisarPeloCentral(corretorId: string, texto: string | ((nome: string) => string)): Promise<{ enviado: boolean }> {
  try {
    const central = await lerCentral();
    if (!central || central.statusConexao !== "conectado") return { enviado: false };

    const supabase = createServiceClient();
    const { data: corretor } = await supabase
      .from("corretores")
      .select("nome, whatsapp, ativo, grupo_id")
      .eq("id", corretorId)
      .maybeSingle();
    if (!corretor?.ativo || !corretor.whatsapp) return { enviado: false };

    const { data: grupo } = await supabase
      .from("grupos")
      .select("central_whatsapp_ativo")
      .eq("id", corretor.grupo_id)
      .maybeSingle();
    if (grupo?.central_whatsapp_ativo !== true) return { enviado: false };

    const r = await enviarMensagemWhatsapp({
      instanceName: central.instanceName,
      telefone: corretor.whatsapp,
      texto: typeof texto === "function" ? texto(corretor.nome) : texto,
    });
    return { enviado: r.enviado };
  } catch (e) {
    console.error("[central] aviso pelo central falhou sem derrubar o ciclo:", e);
    return { enviado: false };
  }
}

/**
 * Antes de zerar a marca do aviso na reconexão: de quem é a instância, se
 * houve aviso de queda. Depois da reconexão gravada, quem chamou manda o
 * "voltou a conectar" (`avisarVoltaPeloCentral`).
 */
export async function corretorAvisadoDaQueda(instanciaId: string): Promise<string | null> {
  try {
    const { data } = await createServiceClient()
      .from("corretor_whatsapp_instancias")
      .select("corretor_id, aviso_queda_enviado_em")
      .eq("id", instanciaId)
      .maybeSingle();
    return data?.aviso_queda_enviado_em ? data.corretor_id : null;
  } catch {
    return null;
  }
}

export async function avisarVoltaPeloCentral(corretorId: string | null): Promise<void> {
  if (!corretorId) return;
  await avisarPeloCentral(corretorId, montarWhatsappDeVolta);
}
