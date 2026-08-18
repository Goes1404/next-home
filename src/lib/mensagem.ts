export type VariaveisTemplate = {
  nomeLead: string;
  nomeCorretor: string;
  telefoneCorretor: string;
};

/** Troca as três variáveis conhecidas pelo valor do lead/corretor atual. */
export function preencherTemplate(conteudo: string, vars: VariaveisTemplate): string {
  return conteudo
    .replaceAll("{{nome_lead}}", vars.nomeLead)
    .replaceAll("{{nome_corretor}}", vars.nomeCorretor)
    .replaceAll("{{telefone_corretor}}", vars.telefoneCorretor);
}
