export const TIPOS_EVENTO_MARKETING = [
  "lead.criado",
  "lead.qualificado",
  "visita.agendada",
  "visita.realizada",
  "proposta.criada",
  "venda.confirmada",
] as const;

export type TipoEventoMarketing = (typeof TIPOS_EVENTO_MARKETING)[number];

/** Chave estável: repetir a mesma transição produz o mesmo evento. */
export function idEventoMarketing(tipo: TipoEventoMarketing, entidadeId: string, versao = 1) {
  const id = entidadeId.trim().toLowerCase();
  if (!id) throw new Error("entidadeId é obrigatório");
  if (!Number.isInteger(versao) || versao < 1) throw new Error("versao deve ser um inteiro positivo");
  return `${tipo}:${id}:v${versao}`;
}
