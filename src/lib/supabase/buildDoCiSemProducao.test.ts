// O build do CI não pode ler o banco de PRODUÇÃO.
//
// Desde a F2b (13/09/2026) o `next build` consulta o Supabase: o
// `generateStaticParams` de /empreendimentos/[slug] lê o catálogo. Sem
// variável de ambiente, src/lib/supabase/env.ts cai no fallback, que é
// produção. Em 19/10/2026 isso derrubou o job `verificar` da fase 1
// multi-grupo (o código filtra `empreendimentos.grupo_id`, que produção ainda
// não tinha) — e, pior, tornava o verde da esteira dependente do estado de
// produção, não do código da branch. O build passou a ler o banco de teste
// montado só de supabase/migrations, o mesmo do job `isolamento`.
//
// A regressão é calada: basta tirar o passo do banco, ou o grep das
// variáveis, e o build volta a falar com produção sem nenhum aviso — passando
// verde enquanto produção tiver o esquema que a branch espera.
//
// Lê o código-fonte e tira os comentários (linhas de `#` no YAML, `//` no
// .mjs) antes de procurar: comentário que cita o passo não pode aprová-lo.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const raiz = path.resolve(__dirname, "..", "..", "..");

function semComentariosYaml(texto: string): string {
  return texto
    .split(/\r?\n/)
    .filter((linha) => !/^\s*#/.test(linha))
    .join("\n");
}

function semComentariosJs(texto: string): string {
  return texto
    .split(/\r?\n/)
    .filter((linha) => !/^\s*\/\//.test(linha))
    .join("\n");
}

/** O bloco do job `verificar`, até o próximo job de mesmo recuo. */
function jobVerificar(): string {
  const ci = semComentariosYaml(
    readFileSync(path.join(raiz, ".github", "workflows", "ci.yml"), "utf8"),
  );
  const inicio = ci.indexOf("\n  verificar:");
  expect(inicio, "job verificar não encontrado no ci.yml").toBeGreaterThan(-1);
  const resto = ci.slice(inicio + 1);
  const proximo = resto.slice(1).search(/\n {2}[A-Za-z_-]+:\s*\n/);
  return proximo === -1 ? resto : resto.slice(0, proximo + 1);
}

/** Os passos do job, cada um com nome e corpo. */
function passos(job: string): { nome: string; corpo: string }[] {
  return job
    .split(/\n {6}- /)
    .slice(1)
    .map((bloco) => ({
      nome: /name:\s*(.+)/.exec(bloco)?.[1]?.trim() ?? "",
      corpo: bloco,
    }));
}

describe("build do CI sem produção", () => {
  it("o build roda depois de subir o banco de teste e exportar a API dele", () => {
    const lista = passos(jobVerificar());
    const iBuild = lista.findIndex((p) => /npm run build/.test(p.corpo));
    expect(iBuild, "passo com `npm run build` no job verificar").toBeGreaterThan(-1);

    const iBanco = lista.findIndex(
      (p) =>
        /npm run db:teste\b(?!:)/.test(p.corpo) &&
        /NEXT_PUBLIC_SUPABASE_\(URL\|PUBLISHABLE_KEY\)/.test(p.corpo) &&
        /GITHUB_ENV/.test(p.corpo),
    );
    expect(iBanco, "passo que sobe o banco e exporta URL e chave").toBeGreaterThan(-1);
    expect(iBanco).toBeLessThan(iBuild);
  });

  it("o passo do build recusa URL que não seja a do runner", () => {
    const build = passos(jobVerificar()).find((p) => /npm run build/.test(p.corpo));
    expect(build).toBeDefined();
    expect(build!.corpo).toMatch(/http:\/\/127\.0\.0\.1:\*\)/);
    expect(build!.corpo).toMatch(/NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:\?/);
    // A trava vem antes do build no mesmo passo.
    expect(build!.corpo.indexOf("127.0.0.1")).toBeLessThan(build!.corpo.indexOf("npm run build"));
  });

  it("o db:teste imprime as duas variáveis que o CI exporta", () => {
    const script = semComentariosJs(
      readFileSync(path.join(raiz, "scripts", "banco", "dbTeste.mjs"), "utf8"),
    );
    expect(script).toMatch(/console\.log\(`NEXT_PUBLIC_SUPABASE_URL=\$\{/);
    expect(script).toMatch(/console\.log\(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=\$\{/);
  });
});
