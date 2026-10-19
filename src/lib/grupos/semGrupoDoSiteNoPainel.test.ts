import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "./codigoFonte";

/**
 * No painel, o grupo é sempre o de quem está logado (Task 13).
 *
 * `grupoDoSite()` responde "de quem é o site público que está sendo
 * servido". Nesta fase a resposta é fixa (o grupo 1), então um painel que o
 * use funciona para a Next Home e mostra calado o catálogo, a equipe ou os
 * parâmetros da Next Home a um corretor do grupo B — foi o defeito da
 * rodada 1 da Task 12, quando `getEmpreendimentos` tinha o grupo do site
 * como padrão. No painel, o grupo sai de `getCorretorLogado().grupoId` (ou
 * da sessão do gestor).
 *
 * A guarda cobre os dois jeitos de o grupo do site entrar: a chamada direta
 * e as funções de `queries.ts`/`corretorAtivo.ts` que o usam por dentro
 * (`getCorretores`, `getEmpreendimentoBySlug`, ...). A lista dessas funções
 * sai do código delas, não de uma lista escrita à mão: função nova do site
 * que passe a usar o grupo do site entra sozinha.
 */

const PASTAS_DO_PAINEL = ["src/app/corretor", "src/app/api/painel"];

const MODULOS_DO_SITE = ["src/lib/queries.ts", "src/lib/corretorAtivo.ts"];

function arquivosDoPainel(): string[] {
  return PASTAS_DO_PAINEL.flatMap((pasta) =>
    readdirSync(pasta, { recursive: true, encoding: "utf8" })
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
      .map((f) => join(pasta, f)),
  );
}

/**
 * As funções exportadas cujo corpo chama `grupoDoSite(`. O corpo vai do
 * `export` dela até o próximo `export` do arquivo.
 */
function funcoesComGrupoDoSite(): string[] {
  const nomes: string[] = [];
  for (const modulo of MODULOS_DO_SITE) {
    const codigo = semComentarios(readFileSync(modulo, "utf8"));
    const exportacoes = [...codigo.matchAll(/^export\s+(?:async\s+function\s+|const\s+)(\w+)/gm)];
    exportacoes.forEach((m, i) => {
      const fim = i + 1 < exportacoes.length ? exportacoes[i + 1].index! : codigo.length;
      if (codigo.slice(m.index!, fim).includes("grupoDoSite(")) nomes.push(m[1]);
    });
  }
  return nomes;
}

describe("guarda: o painel não usa o grupo do site", () => {
  it("nenhum arquivo do painel chama grupoDoSite()", () => {
    const arquivos = arquivosDoPainel();
    // Piso: a varredura acha o painel (sem isto, uma pasta renomeada
    // aprovaria tudo em silêncio).
    expect(arquivos.length).toBeGreaterThan(100);
    const fora = arquivos.filter((arquivo) => semComentarios(readFileSync(arquivo, "utf8")).includes("grupoDoSite("));
    expect(fora).toEqual([]);
  });

  it("nenhum arquivo do painel chama função do site que usa o grupo do site por dentro", () => {
    const funcoes = funcoesComGrupoDoSite();
    // Piso: getCorretores, getCorretorPorSlug, getEmpreendimentoBySlug,
    // getSimilares, getEmpreendimentosDestaque, getSlugsEmpreendimentos,
    // getRegioesDisponiveis, getEmpreendimentosDoLink e getCorretorAtivo.
    expect(funcoes).toContain("getCorretores");
    expect(funcoes).toContain("getCorretorAtivo");
    expect(funcoes.length).toBeGreaterThanOrEqual(9);
    // getEmpreendimentos recebe o grupo de quem chama: não pode entrar.
    expect(funcoes).not.toContain("getEmpreendimentos");

    const fora: string[] = [];
    for (const arquivo of arquivosDoPainel()) {
      const codigo = semComentarios(readFileSync(arquivo, "utf8"));
      for (const nome of funcoes) {
        if (new RegExp(`(?<![\\w.$])${nome}\\s*\\(`).test(codigo)) fora.push(`${arquivo}: ${nome}(`);
      }
    }
    expect(fora).toEqual([]);
  });
});
