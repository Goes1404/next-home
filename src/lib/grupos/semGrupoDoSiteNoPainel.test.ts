import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "./codigoFonte";

/**
 * No painel, o grupo é sempre o de quem está logado (Task 13).
 *
 * Até a fase 3 o site público tinha `grupoDoSite()`, fixo no grupo 1, e um
 * painel que o usasse mostrava calado o catálogo da Next Home a um corretor
 * do grupo B (rodada 1 da Task 12). Desde a fase 3 (20/10/2026) o grupo do
 * site sai do ENDEREÇO da requisição (`src/lib/sites/`), e o perigo mudou de
 * forma: um painel aberto no domínio de um cliente resolveria o grupo do
 * DOMÍNIO, não o de quem entrou. A guarda é a mesma ideia com a fonte nova:
 *
 * 1. nenhum arquivo do painel resolve site pelo endereço;
 * 2. as funções do site (`queries.ts`, `corretorAtivo.ts`) recebem o grupo
 *    de quem chama — nenhuma o descobre por dentro;
 * 3. `grupoDoSite()` não volta a existir.
 */

const PASTAS_DO_PAINEL = ["src/app/corretor", "src/app/api/painel", "src/app/plataforma"];

const MODULOS_DO_SITE = ["src/lib/queries.ts", "src/lib/corretorAtivo.ts"];

const RESOLUCAO_PELO_ENDERECO = /\b(siteDaPagina|siteDaRequisicao|siteDoCabecalho|resolverSite)\b|@\/lib\/sites\/(pagina|resolver)/;

function arquivosDoPainel(): string[] {
  return PASTAS_DO_PAINEL.flatMap((pasta) =>
    readdirSync(pasta, { recursive: true, encoding: "utf8" })
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
      .map((f) => join(pasta, f)),
  );
}

describe("guarda: o painel não usa o grupo do endereço", () => {
  it("nenhum arquivo do painel resolve o site pelo endereço", () => {
    const arquivos = arquivosDoPainel();
    // Piso: a varredura acha o painel (sem isto, uma pasta renomeada
    // aprovaria tudo em silêncio).
    expect(arquivos.length).toBeGreaterThan(100);
    const fora = arquivos.filter((arquivo) => RESOLUCAO_PELO_ENDERECO.test(semComentarios(readFileSync(arquivo, "utf8"))));
    expect(fora).toEqual([]);
  });

  it("as funções do site recebem o grupo de quem chama", () => {
    for (const modulo of MODULOS_DO_SITE) {
      const codigo = semComentarios(readFileSync(modulo, "utf8"));
      expect(codigo, modulo).not.toMatch(RESOLUCAO_PELO_ENDERECO);
      expect(codigo, modulo).not.toMatch(/grupoDoSite\s*\(/);
    }
    // As funções que o site usa levam o grupo como parâmetro.
    const queries = semComentarios(readFileSync("src/lib/queries.ts", "utf8"));
    for (const nome of [
      "getEmpreendimentos",
      "getEmpreendimentosDoLink",
      "getSimilares",
      "getEmpreendimentosDestaque",
      "getEmpreendimentoBySlug",
      "getSlugsEmpreendimentos",
      "getCorretores",
      "getCorretorPorSlug",
      "getRegioesDisponiveis",
    ]) {
      expect(queries, nome).toMatch(new RegExp(`export async function ${nome}\\(\\s*(?:/\\*\\*[\\s\\S]*?\\*/\\s*)?grupoId: string`));
    }
    const ativo = semComentarios(readFileSync("src/lib/corretorAtivo.ts", "utf8"));
    expect(ativo).toMatch(/getCorretorAtivo = cache\(async \(grupoId: string\)/);
  });

  it("grupoDoSite() não volta a existir", () => {
    const grupo = semComentarios(readFileSync("src/lib/grupos/grupo.ts", "utf8"));
    expect(grupo).not.toMatch(/function grupoDoSite/);
  });
});
