import type { ItemDaAgenda } from "@/lib/agenda/itens";
import { ETAPA_LABEL, type EtapaFunil } from "@/lib/types";

/**
 * O que o app guarda para abrir SEM INTERNET (29/10/2026): a agenda de hoje
 * e os 20 leads mais recentes do PRÓPRIO usuário, com o mínimo de campos
 * para ler e ligar. Nada de conversa, mensagem, anotação, documento ou dado
 * de outro corretor (nem para o gestor).
 *
 * Módulo PURO. Quem lê o banco é `/api/painel/offline`; quem guarda é o
 * `sw-painel.js`, numa caixa com o id do usuário no nome; quem mostra é o
 * `/offline.html`. O formato (`versao`) é o contrato entre os três.
 *
 * Testes: `dadosOffline.test.ts`.
 */

export const VERSAO_DOS_DADOS_OFFLINE = 1;
export const LEADS_OFFLINE = 20;
/** Onde o app pede os dados. O service worker só guarda ESTE endereço. */
export const ROTA_DOS_DADOS_OFFLINE = "/api/painel/offline";

export type ItemOffline = { tipo: ItemDaAgenda["tipo"]; inicio: string; texto: string };
export type LeadOffline = { nome: string; telefone: string | null; etapa: string; criadoEm: string };

export type DadosOffline = {
  versao: typeof VERSAO_DOS_DADOS_OFFLINE;
  /** Chave da caixa no service worker: a de outro usuário é apagada. */
  usuarioId: string;
  geradoEm: string;
  /** `yyyy-mm-dd` em São Paulo: a página diz "hoje" só se ainda for hoje. */
  dia: string;
  agenda: ItemOffline[];
  leads: LeadOffline[];
};

const TIPO: Record<ItemDaAgenda["tipo"], string> = { visita: "Visita", compromisso: "Compromisso", tarefa: "Tarefa", lembrete: "Lembrete" };

/** Uma linha de texto por item, sem telefone nem endereço. */
export function textoDoItem(item: ItemDaAgenda): string {
  const base =
    item.tipo === "visita"
      ? [item.nome, item.imovel?.nome].filter(Boolean).join(" · ")
      : item.tipo === "tarefa"
        ? item.nome
          ? `${item.titulo} · ${item.nome}`
          : item.titulo
        : item.tipo === "compromisso"
          ? item.titulo || (item.subtipo === "reuniao" ? "Reunião" : "Horário bloqueado")
          : item.texto;
  return `${TIPO[item.tipo]}: ${base}`.slice(0, 160);
}

type LinhaLeadOffline = { nome: string | null; telefone: string | null; etapa: string | null; created_at: string };

export function montarDadosOffline(p: {
  usuarioId: string;
  agora: Date;
  dia: string;
  agenda: ItemDaAgenda[];
  leads: LinhaLeadOffline[];
}): DadosOffline {
  return {
    versao: VERSAO_DOS_DADOS_OFFLINE,
    usuarioId: p.usuarioId,
    geradoEm: p.agora.toISOString(),
    dia: p.dia,
    agenda: p.agenda.slice(0, 30).map((i) => ({ tipo: i.tipo, inicio: i.inicio, texto: textoDoItem(i) })),
    leads: p.leads.slice(0, LEADS_OFFLINE).map((l) => ({
      nome: (l.nome ?? "").trim().slice(0, 80) || "Sem nome",
      telefone: l.telefone,
      etapa: (l.etapa && ETAPA_LABEL[l.etapa as EtapaFunil]) || "",
      criadoEm: l.created_at,
    })),
  };
}
