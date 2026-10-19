// Opções do export do golden (`exportarGolden.ts`), separadas para teste.
//
// O export lê conversa REAL com a chave de serviço, que ignora RLS. Com mais
// de um grupo no mesmo banco, duas regras da fase 1 (spec da plataforma
// multi-grupo, §18) valem aqui:
//
// - o script exige `--grupo` e aceita só o grupo 1 (a Next Home), para nunca
//   exportar conversa de outra empresa;
// - o resultado é gravado FORA do repositório. Antes ele ia direto para
//   eval/golden/casos.json, ou seja, trecho de conversa de cliente entrava no
//   git. Quem cura o caso (anonimiza de novo, anota as expectativas) copia à
//   mão o que for para o golden.

import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { GRUPO_NEXT_HOME_ID } from "../../src/lib/grupos/grupo";

export type OpcoesDoGolden = { grupo: string; saida: string };

function opcao(argv: string[], nome: string): string | undefined {
  return argv
    .find((a) => a.startsWith(`--${nome}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}

/** `true` se `caminho` é a raiz do repositório ou está dentro dela. */
function dentroDe(raiz: string, caminho: string): boolean {
  const r = relative(resolve(raiz), caminho);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
}

/**
 * Lê `--grupo` e `--saida` da linha de comando. `raiz` é a raiz do
 * repositório: caminho relativo é resolvido a partir dela, e nada dentro
 * dela é aceito como destino.
 */
export function lerOpcoesDoGolden(argv: string[], raiz: string): OpcoesDoGolden {
  const grupo = opcao(argv, "grupo");
  if (!grupo) {
    throw new Error(`Informe o grupo: --grupo=${GRUPO_NEXT_HOME_ID}`);
  }
  if (grupo !== GRUPO_NEXT_HOME_ID) {
    throw new Error(`O export do golden só aceita o grupo 1 (${GRUPO_NEXT_HOME_ID}).`);
  }

  const pedida = opcao(argv, "saida");
  const saida = pedida
    ? resolve(raiz, pedida)
    : join(resolve(tmpdir()), "nexthome-golden", `casos-${grupo}.json`);
  if (dentroDe(raiz, saida)) {
    throw new Error(
      `--saida precisa ficar fora do repositório (${saida}): conversa real não entra no git.`,
    );
  }
  return { grupo, saida };
}
