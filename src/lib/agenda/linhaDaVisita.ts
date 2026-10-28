import type { ItemDaAgenda } from "./itens";

/**
 * A linha de `visitas` como a Agenda lê (0224/0223) e o item que ela vira.
 * Compartilhado pela agenda do corretor (`lerAgenda.ts`) e pela da equipe
 * (`lerEquipe.ts`): o mesmo select, o mesmo item.
 */
export type LinhaVisita = {
  id: string;
  inicio: string;
  lead_id: string;
  corretor_id: string;
  status: string;
  passada_em: string | null;
  corretor: { nome: string } | null;
  lead: {
    nome: string;
    telefone: string | null;
    corretor_id: string | null;
    arquivado_em: string | null;
    visita_agendada_em: string | null;
    visita_confirmada_em: string | null;
    empreendimento: { nome: string; endereco: string | null } | null;
  } | null;
};

const CAMPOS_DO_LEAD = `nome, telefone, corretor_id, arquivado_em, visita_agendada_em, visita_confirmada_em,
    empreendimento:empreendimentos!leads_empreendimento_id_fkey(nome, endereco)`;

/** Embeds com a FK explícita, regra da casa (`embedsAmbiguos.test.ts`). */
export const SELECT_VISITA = `id, inicio, lead_id, corretor_id, status, passada_em,
  corretor:corretores!visitas_corretor_id_fkey(nome),
  lead:leads!visitas_lead_id_fkey(${CAMPOS_DO_LEAD})`;

/** O mesmo, com o lead obrigatório: para filtrar pelo dono do lead (`lead.corretor_id`). */
export const SELECT_VISITA_PELO_DONO = `id, inicio, lead_id, corretor_id, status, passada_em,
  corretor:corretores!visitas_corretor_id_fkey(nome),
  lead:leads!visitas_lead_id_fkey!inner(${CAMPOS_DO_LEAD})`;

export type VisitaDoItem = Extract<ItemDaAgenda, { tipo: "visita" }>;

export function itemDaVisita(v: LinhaVisita): VisitaDoItem | null {
  if (!v.lead || v.lead.arquivado_em) return null;
  // O "confirmo" do cliente (0123) é do lead: vale só para a visita que é a atual dele.
  const ehAtual = v.lead.visita_agendada_em !== null && Date.parse(v.lead.visita_agendada_em) === Date.parse(v.inicio);
  return {
    tipo: "visita",
    id: v.id,
    inicio: v.inicio,
    leadId: v.lead_id,
    nome: v.lead.nome,
    telefone: v.lead.telefone,
    imovel: v.lead.empreendimento,
    confirmadaPeloCliente: ehAtual && v.lead.visita_confirmada_em !== null,
    corretorId: v.corretor_id,
    corretorNome: v.corretor?.nome ?? null,
    donoDoLeadId: v.lead.corretor_id,
    passada: v.passada_em !== null,
    status: v.status,
  };
}
