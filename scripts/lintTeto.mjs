#!/usr/bin/env node
/**
 * Trava de catraca do lint.
 *
 * ## Por que não é `eslint` puro no CI
 *
 * O repositório tem 14 erros de lint HERDADOS, em arquivos que ninguém está
 * mexendo agora: 11 `no-explicit-any` nos editores de imóvel, 2 `Date.now()`
 * chamado no corpo de um Server Component e 1 `prefer-const`. Pôr `eslint`
 * como porta no CI deixaria a esteira VERMELHA no primeiro dia — e esteira
 * vermelha por padrão é esteira que ninguém olha, do mesmo jeito que aviso
 * que está sempre aceso vira paisagem.
 *
 * A saída não é ignorar o lint nem parar tudo para refatorar código alheio:
 * é uma CATRACA. O número de erros de hoje vira teto; passar do teto
 * reprova. Assim o que existe não sangra mais, e cada limpeza baixa a
 * marca até ela chegar a zero — quando aí sim `eslint` puro pode virar a
 * porta e este arquivo some.
 *
 * Mesma ideia da lista `RESERVADOS` em `migrations.test.ts`: a exceção é
 * declarada, tem número, e o teste reclama quando ela fica obsoleta.
 */

import { execFileSync } from "node:child_process";

/**
 * Quantos erros de lint o repositório tem hoje.
 *
 * 31/08/2026: 14 (a dívida herdada, quando a catraca nasceu)
 * 01/09/2026:  8 — limpos os que dava para limpar com segurança:
 *   `prefer-const`, dois `catch (err: any)`, o setter de tipologia (que
 *   virou `K extends keyof Tipologia`, então passar texto onde se espera
 *   número agora é erro de compilação) e os dois `Date.now()` no corpo de
 *   Server Component, que saíram para `janelaDeDias.ts` — relógio dentro
 *   do render torna o componente não idempotente.
 *
 * Os 8 restantes são a MESMA forma e pedem mudança de contrato, não
 * troca de tipo: setters `(campo: string, valor: any)` em quatro
 * componentes de edição, e três `as any` em `imoveis/actions.ts` que
 * escondem atrito real com os tipos gerados. Mexer neles sem conseguir
 * exercitar a tela no navegador troca um erro de lint por um defeito de
 * verdade.
 *
 * BAIXE este número sempre que limpar algum. Nunca suba: subir é a coisa
 * exata que a catraca existe para impedir.
 */
const TETO = 8;

function rodarEslint() {
  try {
    // O eslint sai com código 1 quando há erro — o que aqui é o caso
    // normal, não uma falha da ferramenta. O JSON vem no stdout de qualquer
    // forma; só um estouro de verdade deixa o stdout vazio.
    return execFileSync("npx", ["eslint", "--format", "json"], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    if (e.stdout) return e.stdout;
    console.error("Não foi possível rodar o eslint:");
    console.error(e.stderr || e.message);
    process.exit(2);
  }
}

const saida = rodarEslint();

let arquivos;
try {
  arquivos = JSON.parse(saida);
} catch {
  console.error("O eslint não devolveu JSON válido. Saída bruta:\n" + saida.slice(0, 2000));
  process.exit(2);
}

const comErro = arquivos
  .filter((a) => a.errorCount > 0)
  .map((a) => ({
    arquivo: a.filePath.replace(process.cwd() + "/", ""),
    erros: a.errorCount,
    regras: [...new Set(a.messages.filter((m) => m.severity === 2).map((m) => m.ruleId ?? "?"))],
  }))
  .sort((x, y) => y.erros - x.erros);

const total = comErro.reduce((s, a) => s + a.erros, 0);

for (const a of comErro) {
  console.log(`  ${String(a.erros).padStart(3)}  ${a.arquivo}  (${a.regras.join(", ")})`);
}

if (total > TETO) {
  console.error(
    `\n✗ Lint: ${total} erros, acima do teto de ${TETO}.\n` +
      `  Corrija o que você acabou de introduzir — o teto é a dívida herdada,\n` +
      `  não uma licença para crescer.`,
  );
  process.exit(1);
}

if (total < TETO) {
  console.log(
    `\n✓ Lint: ${total} erros, ABAIXO do teto de ${TETO}.\n` +
      `  Alguém limpou. Baixe TETO para ${total} em scripts/lintTeto.mjs —\n` +
      `  teto folgado deixa a catraca girar para trás.`,
  );
  process.exit(0);
}

console.log(`\n✓ Lint: ${total} erros, exatamente o teto herdado. Nada novo entrou.`);
