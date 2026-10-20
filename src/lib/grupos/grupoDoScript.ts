import { GRUPO_NEXT_HOME_ID } from "./grupo";

/**
 * O grupo de um script que roda com a chave secreta (0192).
 *
 * A chave de serviço ignora a RLS: um script sem grupo lê e grava em todos.
 * Por isso todo script assim exige `--grupo=<uuid>` e, na fase 1, só aceita
 * o grupo da Next Home (spec §18: "scripts com chave secreta exigem --grupo e
 * aceitam só o grupo 1"). Pedir o grupo por extenso, em vez de assumir o 1,
 * é o que faz o script continuar certo no dia em que houver outro grupo: o
 * esquecimento vira erro, não uma escrita no grupo errado.
 *
 * Devolve o grupo e os argumentos sem a opção, para o script ler os dele.
 */
export function grupoDoScript(argv: string[]): { grupoId: string; resto: string[] } {
  const opcao = argv.find((a) => a.startsWith("--grupo="));
  const resto = argv.filter((a) => a !== opcao);
  const grupoId = opcao?.slice("--grupo=".length).trim() ?? "";
  if (!grupoId) {
    throw new Error(`Informe o grupo: --grupo=${GRUPO_NEXT_HOME_ID} (a chave de serviço enxerga todos os grupos).`);
  }
  if (grupoId !== GRUPO_NEXT_HOME_ID) {
    throw new Error(`Na fase 1 os scripts só rodam no grupo da Next Home (${GRUPO_NEXT_HOME_ID}); recebi ${grupoId}.`);
  }
  return { grupoId, resto };
}
