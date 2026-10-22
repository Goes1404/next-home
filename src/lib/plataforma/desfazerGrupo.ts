/**
 * Desfazer um grupo recém-criado que não chegou ao fim (fase 2A).
 *
 * Nenhuma chave estrangeira para `grupos` apaga em cascata, então a ordem é
 * a das chaves: as linhas que `criar_grupo` (0195) gravou — evento, taxas,
 * fiscal —, a ficha do primeiro acesso, e só então o grupo, que é o que
 * devolve o endereço.
 *
 * A ordem é UMA constante: a action (`src/app/plataforma/acoes.ts`) apaga
 * nela, e o teste de banco (`src/lib/grupos/plataforma.db.test.ts`) apaga
 * nela contra o Postgres de verdade. Duas listas escritas à mão divergiriam
 * calado no dia em que `criar_grupo` passar a gravar mais uma tabela.
 */
export const ORDEM_DO_DESFAZER = [
  { tabela: "admin_eventos", coluna: "grupo_id" },
  { tabela: "parametros_credito", coluna: "grupo_id" },
  { tabela: "fiscal_config", coluna: "grupo_id" },
  { tabela: "corretores", coluna: "grupo_id" },
  { tabela: "grupos", coluna: "id" },
] as const;

/** Em que passo a criação parou. */
export type PassoQueFalhou = "ficha" | "convite" | "cadastro";

/**
 * O evento que fica depois do desfazer. Os eventos do grupo (`grupo_criado`,
 * `convite_enviado`) saem junto com ele; sem este, a tentativa falhada
 * sumiria sem rastro. Evento da plataforma (`grupo_id` nulo, 0191): só o
 * endereço e o passo — nem e-mail, nem nome de pessoa.
 */
export const ACAO_GRUPO_DESFEITO = "grupo_desfeito";
