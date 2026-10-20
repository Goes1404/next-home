// O grupo (imobiliária ou corretor independente) a que cada dado pertence.
//
// A Next Home é o grupo 1, com id fixo: a migration que criou `grupos`
// grava esta linha com este id, e todo dado anterior à plataforma
// multi-grupo foi carimbado nele.

export const GRUPO_NEXT_HOME_ID = "00000000-0000-0000-0000-000000000001";

/*
 * `grupoDoSite()` (fixo no grupo 1) saiu na fase 3 (20/10/2026): o grupo do
 * site público vem do endereço da requisição — `siteDaPagina(params)` nas
 * páginas sob `src/app/s/[site]`, `siteDaRequisicao(request)` nas rotas.
 * Ver `src/lib/sites/`.
 */

/**
 * O tipo do grupo (0190, `grupos.tipo`): imobiliária com equipe, ou corretor
 * independente, que é um grupo de uma pessoa só. O painel usa para esconder
 * do menu o que só faz sentido com equipe (ranking, repasse de leads, convite
 * de contas). Esconder não é bloquear: as rotas continuam abrindo.
 */
export type TipoDoGrupo = "imobiliaria" | "independente";
