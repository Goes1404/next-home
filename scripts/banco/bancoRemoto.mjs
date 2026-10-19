// Regras do `npm run db:teste:remoto` (scripts/banco/dbTeste.mjs), num módulo
// sem efeito colateral para o vitest poder importá-lo: o dbTeste.mjs roda o
// comando assim que é carregado.
//
// O comando aplica TODAS as migrations no projeto Supabase de testes
// (docs/AMBIENTE-DE-TESTES.md, passo 2). É o único comando deste repositório
// que escreve num banco remoto por migration, então a conferência mora aqui e
// não na mão de quem digita a URL: produção é recusada pelo ref do projeto,
// que aparece no host direto e no usuário do pooler. A mesma regra vale em
// `conectar()` (src/lib/grupos/apoioDoBanco.ts), que a semeadura usa.

/** O projeto de produção. */
const PRODUCAO = "prhhrqyubjcafvucirri";

const LOCAL = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/**
 * Devolve a URL limpa ou lança dizendo por que ela não serve.
 * @param {string | undefined} url
 * @returns {string}
 */
export function conferirBancoRemoto(url) {
  const limpa = (url ?? "").trim();
  if (!limpa) {
    throw new Error(
      "Defina DB_TESTE_URL com a connection string do projeto de testes (Session pooler).",
    );
  }
  if (!/^postgres(ql)?:\/\//.test(limpa)) {
    throw new Error("DB_TESTE_URL precisa ser uma connection string postgresql://.");
  }
  if (limpa.includes(PRODUCAO)) {
    throw new Error("DB_TESTE_URL aponta para o banco de produção. Use o projeto de testes.");
  }
  let host;
  try {
    host = new URL(limpa).hostname;
  } catch {
    throw new Error("DB_TESTE_URL não é uma connection string postgresql:// válida.");
  }
  if (LOCAL.has(host)) {
    throw new Error(
      "DB_TESTE_URL aponta para o banco local. Para ele, use `npm run db:teste`, que recria o volume do zero.",
    );
  }
  return limpa;
}

/**
 * Argumentos do CLI para aplicar as migrations no projeto de testes.
 * Sem `--include-seed`: o supabase/seed.sql é de 08/2026 e grava uma coluna
 * que a 0129 apagou.
 * @param {string} url
 * @returns {string[]}
 */
export function argumentosDoPushRemoto(url) {
  return ["db", "push", "--db-url", url];
}
