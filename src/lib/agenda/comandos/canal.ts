import "server-only";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";
import { mesmoNumero } from "@/lib/whatsapp/participantesDoGrupo";
import { agendarVisitaLead, type InstanciaResolvida } from "@/lib/whatsapp/repositorio";
import { horariosDeVisitaSeguros, quemFazAVisitaDoLead } from "@/lib/crm/agendaDoCorretor";
import { lerCotaDaIa } from "@/lib/planos/usoDaIa";
import { grupoSuspenso } from "@/lib/planos/cobrancaDoGrupo";
import { lerItensDoDia } from "@/lib/agenda/lerAgenda";
import { criarBloqueio, criarReuniao } from "@/lib/agenda/compromissos";
import { responderVisita } from "@/lib/agenda/confirmacao";
import { gravarEstado, lerEstado, limparEstado } from "@/lib/agenda/conversaDeAgenda";
import type { ItemDaAgenda } from "@/lib/agenda/itens";
import { responderAoCorretor, type Dependencias } from "./conversa";

/** O cliente da chave de serviço, sempre vindo de quem validou a instância. */
type Supa = Parameters<typeof lerEstado>[0];
import { interpretarPedido } from "./interpretar";
import { lerRespostaCurta } from "./respostasCurtas";

/**
 * O canal do corretor com o sistema pelo WhatsApp (Agenda, fase 5).
 *
 * Os avisos ao corretor saem da instância DELE para `corretores.whatsapp`
 * (`avisoAoCorretor.ts`). A resposta dele chega de dois jeitos:
 * - mesmo número: na conversa "consigo mesmo" (`fromMe`, remetente = o
 *   próprio número) — ninguém mais está nessa conversa;
 * - número pessoal diferente: como mensagem de ENTRADA vinda de
 *   `corretores.whatsapp`. Esse número pode ser o que o corretor usa para
 *   testar a IA (palavra de teste): se ele já é conversa de lead nesta
 *   instância, só a resposta curta a uma pergunta pendente vira comando.
 *
 * Tem de ser separado ANTES do resto do webhook: lida como fala de cliente
 * ou do corretor, a mensagem criaria lead ou desligaria a IA. Nunca medido
 * com payload real de produção (só raciocinado): ver a nota do vault.
 */

/** Toda resposta do sistema começa assim: o eco dela nunca vira comando. */
export const MARCA_DO_SISTEMA = "📅";

export function canalDaMensagem(p: {
  fromMe: boolean;
  sender: string;
  whatsappCorretor: string | null | undefined;
  telefoneConectado: string | null | undefined;
}): "propria" | "do_corretor" | null {
  const doCorretor = Boolean(p.whatsappCorretor) && mesmoNumero(p.sender, p.whatsappCorretor!);
  const daInstancia = Boolean(p.telefoneConectado) && mesmoNumero(p.sender, p.telefoneConectado!);
  if (p.fromMe) return doCorretor || daInstancia ? "propria" : null;
  return doCorretor && !daInstancia ? "do_corretor" : null;
}

/** As mensagens que o próprio sistema manda ao corretor (eco, se houver). */
export function ehMensagemDoSistema(texto: string): boolean {
  const t = texto.trim();
  return t.startsWith(MARCA_DO_SISTEMA) || /^A visita com .+\) aconteceu\?/.test(t);
}

function descricao(item: ItemDaAgenda): string {
  switch (item.tipo) {
    case "visita":
      return `Visita · ${item.nome}`;
    case "compromisso":
      return item.subtipo === "reuniao" ? `Reunião · ${item.titulo || "Reunião"}` : `Bloqueado${item.titulo ? ` · ${item.titulo}` : ""}`;
    case "tarefa":
      return `Tarefa · ${item.titulo}${item.nome ? ` (${item.nome})` : ""}`;
    case "lembrete":
      return `Lembrete · ${item.texto}`;
  }
}

/** O primeiro pedaço do nome, sem os curingas do `ilike`. */
function trechoDeBusca(nome: string): string {
  return (nome.trim().split(/\s+/)[0] ?? "").replace(/[%_,()\\]/g, "").slice(0, 40);
}

/**
 * Trata a mensagem se ela é do canal; devolve se tratou (o webhook encerra).
 * Nunca lança: falha aqui responde "tente de novo" e encerra.
 */
export async function tratarConversaComOSistema(p: {
  instancia: InstanciaResolvida;
  sender: string;
  fromMe: boolean;
  texto: string;
  ehAudio: boolean;
  /** O cliente da chave de serviço do webhook, que já validou a instância. */
  supabase: Supa;
  agora?: Date;
}): Promise<boolean> {
  const canal = canalDaMensagem({
    fromMe: p.fromMe,
    sender: p.sender,
    whatsappCorretor: p.instancia.whatsappCorretor,
    telefoneConectado: p.instancia.telefoneConectado,
  });
  if (!canal) return false;
  if (ehMensagemDoSistema(p.texto)) return true;

  const agora = p.agora ?? new Date();
  const supabase = p.supabase;
  const { corretorId, grupoId } = p.instancia;

  if (canal === "do_corretor") {
    const { data: conversaDeTeste } = await supabase
      .from("whatsapp_conversas")
      .select("id")
      .eq("corretor_id", corretorId)
      .eq("telefone_cliente", p.sender)
      .not("lead_id", "is", null)
      .limit(1)
      .maybeSingle();
    if (conversaDeTeste && !(lerRespostaCurta(p.texto) && (await lerEstado(supabase, corretorId, agora)))) return false;
  }

  // Grupo suspenso: o sistema não responde (como a IA dos clientes).
  if (await grupoSuspenso(grupoId, agora).catch(() => false)) return true;

  const enviar = (texto: string) =>
    enviarMensagemWhatsapp({ instanceName: p.instancia.instanceName, telefone: p.sender, texto: `${MARCA_DO_SISTEMA} ${texto}` });

  if (p.ehAudio && !p.texto.trim()) {
    await enviar("Por enquanto eu só entendo mensagem escrita. Mande o pedido em texto.");
    return true;
  }

  try {
    const { data: quem } = await supabase.from("corretores").select("papel").eq("id", corretorId).maybeSingle();
    const ehGestor = quem?.papel === "gestor";
    const resposta = await responderAoCorretor(p.texto, montarDependencias({ supabase, corretorId, grupoId, ehGestor, agora }));
    await enviar(resposta);
  } catch (e) {
    console.error("[agenda] comando do corretor falhou:", e);
    await enviar("Não consegui fazer isso agora. Tente de novo em instantes, ou use a Agenda do painel.");
  }
  return true;
}

function montarDependencias(p: {
  supabase: Supa;
  corretorId: string;
  grupoId: string;
  ehGestor: boolean;
  agora: Date;
}): Dependencias {
  const { supabase, corretorId, grupoId, ehGestor, agora } = p;
  return {
    agora,
    ehGestor,
    lerEstado: () => lerEstado(supabase, corretorId, agora),
    gravarEstado: (estado) => gravarEstado(supabase, { corretorId, grupoId, estado }, agora),
    limparEstado: () => limparEstado(supabase, corretorId),
    podeUsarIa: async () => {
      try {
        return (await lerCotaDaIa(grupoId, agora)).nivel !== "esgotada";
      } catch {
        return true;
      }
    },
    interpretar: (texto) => interpretarPedido(texto, { agora, ehGestor }),
    buscarLeads: async (nome) => {
      const trecho = trechoDeBusca(nome);
      if (!trecho) return [];
      let consulta = supabase
        .from("leads")
        .select("id, nome")
        .eq("grupo_id", grupoId)
        .is("arquivado_em", null)
        .ilike("nome", `%${trecho}%`);
      // O corretor procura entre os dele; o gestor, no grupo.
      if (!ehGestor) consulta = consulta.eq("corretor_id", corretorId);
      const { data } = await consulta.order("nome").limit(50);
      return data ?? [];
    },
    buscarEquipe: async () => {
      const { data } = await supabase.from("corretores").select("id, nome").eq("grupo_id", grupoId).eq("ativo", true);
      return data ?? [];
    },
    agendaDoDia: async (dia) =>
      (await lerItensDoDia({ corretorId, grupoId, dia })).map((item) => ({ inicio: item.inicio, descricao: descricao(item) })),
    marcarVisita: async (leadId, quando) => {
      if (await agendarVisitaLead(leadId, quando)) return {};
      const livres = await horariosDeVisitaSeguros(await quemFazAVisitaDoLead(leadId, corretorId, agora), agora);
      const sugestao = livres.slice(0, 3).map((h) => h.rotulo).join("; ");
      return {
        erro: sugestao
          ? `Esse horário não está livre. Livres: ${sugestao}. Mande o pedido de novo com um deles.`
          : "Esse horário não está livre. Veja os horários na Agenda do painel.",
      };
    },
    bloquear: (inicio, fim, motivo) => criarBloqueio({ grupoId, corretorId, inicio, fim, motivo }, supabase, agora),
    lembrete: async (leadId, texto, quando) => {
      const { error } = leadId
        ? await supabase.from("lead_tarefas").insert({ lead_id: leadId, corretor_id: corretorId, titulo: texto.slice(0, 200), prazo: quando.toISOString() })
        : await supabase.from("anotacoes").insert({
            corretor_id: corretorId,
            destinatario_id: corretorId,
            texto: texto.slice(0, 500),
            lembrete_em: quando.toISOString(),
            lembrete_whatsapp: true,
          });
      return error ? { erro: "Não consegui criar o lembrete agora. Tente de novo." } : {};
    },
    reuniao: (titulo, inicio, fim, participantes) =>
      ehGestor
        ? criarReuniao({ grupoId, gestorId: corretorId, titulo, inicio, fim, participantes }, supabase, agora)
        : Promise.resolve({ erro: "Só o gestor marca reunião." }),
    responderVisita: (visitaId, resposta, nova) => responderVisita({ visitaId, corretorId, resposta, nova }, supabase),
  };
}
