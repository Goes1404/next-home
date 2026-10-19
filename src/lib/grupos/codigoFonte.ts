// Leitura de código-fonte para as guardas de isolamento por grupo.
//
// As guardas desta pasta leem o código (não o executam) para pegar a
// regressão que falha calada: a consulta pela chave de serviço que esquece o
// grupo continua funcionando enquanto só existe um grupo, e atravessa grupos
// no dia em que existir o segundo.

/** Tira comentários de bloco e de linha (sem comer `https://` de string). */
export function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

/**
 * O encadeamento `.from("x").a(...).b(...)` que começa em `inicio`: a
 * chamada e todos os métodos emendados nela, até o primeiro ponto que não
 * continua a cadeia.
 */
export function encadeamento(codigo: string, inicio: number): string {
  let i = inicio;
  let fim = inicio;
  for (;;) {
    const passo = /^\s*\.\s*[A-Za-z_$][\w$]*\s*(<[^>()]*>)?\s*\(/.exec(codigo.slice(i));
    if (!passo) break;
    i += passo[0].length;
    let profundidade = 1;
    while (i < codigo.length && profundidade > 0) {
      if (codigo[i] === "(") profundidade++;
      else if (codigo[i] === ")") profundidade--;
      i++;
    }
    fim = i;
  }
  return codigo.slice(inicio, fim);
}

export type Leitura = { tabela: string; cadeia: string; inicio: number };

/**
 * As LEITURAS de tabela do arquivo: `.from("x")` seguido de `.select(` e sem
 * escrita (`insert`, `update`, `upsert`, `delete`) no mesmo encadeamento.
 * `.storage.from(...)` é bucket, não tabela, e fica de fora.
 */
export function leiturasDe(codigo: string): Leitura[] {
  const saida: Leitura[] = [];
  for (const m of codigo.matchAll(/\.from\(\s*"(\w+)"\s*\)/g)) {
    if (/storage\s*$/.test(codigo.slice(Math.max(0, m.index! - 20), m.index!))) continue;
    const cadeia = encadeamento(codigo, m.index!);
    if (/\.(insert|update|upsert|delete)\s*\(/.test(cadeia)) continue;
    if (!/\.select\s*\(/.test(cadeia)) continue;
    saida.push({ tabela: m[1], cadeia, inicio: m.index! });
  }
  return saida;
}
