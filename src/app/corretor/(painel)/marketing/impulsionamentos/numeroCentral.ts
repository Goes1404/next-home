type InstanciaDaEquipe = {
  corretor_id: string;
  instance_name: string;
  status_conexao: string | null;
  conectado_em: string | null;
  sessao_caida_em: string | null;
};

/**
 * As opções do número central dos grupos de leads (27/10/2026).
 *
 * A conta oculta (0189) NÃO sai daqui: o número central é o da imobiliária,
 * e a Aretz conectou justamente a conta oculta de administração para isso.
 * Tirá-la deixava o seletor só com "Desativado", e sem número central não há
 * sincronização nem vínculo à mão. Só o gestor vê esta lista, e a conta
 * oculta é dele também (seção "Contas ocultas"); ela segue fora da lista de
 * corretores e da roleta.
 */
export function opcoesDoNumeroCentral(
  instancias: readonly InstanciaDaEquipe[],
  pessoas: readonly { id: string; nome: string }[],
  ocultas: ReadonlySet<string>,
): { instanceName: string; nome: string; conectada: boolean }[] {
  const nomePor = new Map(pessoas.map((p) => [p.id, p.nome]));
  return instancias.map((i) => {
    const nome = nomePor.get(i.corretor_id) ?? i.instance_name;
    return {
      instanceName: i.instance_name,
      nome: ocultas.has(i.corretor_id) ? `${nome} (conta oculta)` : nome,
      conectada: i.status_conexao === "conectado" && i.conectado_em !== null && i.sessao_caida_em === null,
    };
  });
}
