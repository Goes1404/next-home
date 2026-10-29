import { nomeUtilDoLead, telefoneLegivel } from "@/lib/leads/nomeExibido";

/**
 * Como o cliente aparece no texto de uma notificação (29/10/2026).
 *
 * O nome quando ele serve para chamar alguém; "WhatsApp 1234" (o nome
 * provisório do lead que chegou sem nome) não serve, e cai para o telefone,
 * como no aviso de lead novo. Sem nada, "Cliente" — nunca "Contato sem nome"
 * numa tela de bloqueio.
 */
export function nomeNaNotificacao(lead: { nome?: string | null; telefone?: string | null }): string {
  const nome = lead.nome && /^WhatsApp \d{4}$/.test(lead.nome.trim()) ? null : nomeUtilDoLead(lead.nome);
  return nome ?? telefoneLegivel(lead.telefone) ?? "Cliente";
}
