// O grupo (imobiliária ou corretor independente) a que cada dado pertence.
//
// A Next Home é o grupo 1, com id fixo: a migration que criou `grupos`
// grava esta linha com este id, e todo dado anterior à plataforma
// multi-grupo foi carimbado nele.

export const GRUPO_NEXT_HOME_ID = "00000000-0000-0000-0000-000000000001";

/**
 * O grupo dono do site público que está sendo servido.
 *
 * Nesta fase só existe o site da Next Home, então a resposta é fixa. A
 * fase 3 troca isto pela resolução pelo `Host` da requisição (cada grupo
 * com o seu domínio), e é por isso que os chamadores já passam por aqui em
 * vez de usar a constante.
 */
export function grupoDoSite(): string {
  return GRUPO_NEXT_HOME_ID;
}

/**
 * O tipo do grupo (0190, `grupos.tipo`): imobiliária com equipe, ou corretor
 * independente, que é um grupo de uma pessoa só. O painel usa para esconder
 * do menu o que só faz sentido com equipe (ranking, repasse de leads, convite
 * de contas). Esconder não é bloquear: as rotas continuam abrindo.
 */
export type TipoDoGrupo = "imobiliaria" | "independente";
