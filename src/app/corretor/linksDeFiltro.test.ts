import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guarda dos links que levam a uma lista JÁ FILTRADA.
 *
 * O defeito é sempre o mesmo e é CALADO: a tela de origem escreve um
 * parâmetro na URL, a lista de destino não conhece esse nome, e o
 * PostgREST/Next simplesmente ignora — o gestor clica num número de "12
 * leads" e cai na carteira inteira, achando que o filtro não funciona.
 *
 * Já aconteceu neste projeto com `?filtro=parados` (a lista só entendia
 * `?parado=N`). Este teste existe para o par link↔leitor não se separar de
 * novo, e para o próximo par nascer com a mesma verificação.
 */

const LISTA_DE_LEADS = readFileSync("src/app/corretor/(painel)/leads/page.tsx", "utf8");
const TELA_DE_ANUNCIOS = readFileSync(
  "src/app/corretor/(painel)/admin/anuncios/page.tsx",
  "utf8",
);

/** Nomes de parâmetro que a lista de leads sabe ler. */
function parametrosLidosPelaLista(): string[] {
  return [...LISTA_DE_LEADS.matchAll(/params\.([a-zA-Z]+)/g)].map((m) => m[1]);
}

describe("links de filtro do painel", () => {
  it("a lista de leads lê o parâmetro de campanha do Meta", () => {
    expect(parametrosLidosPelaLista()).toContain("campanha");
  });

  it("o filtro de campanha chega ao banco, não fica só no objeto", () => {
    const sessao = readFileSync("src/lib/corretorSessao.ts", "utf8");
    expect(sessao).toContain('query.eq("meta_campanha_id"');
  });

  it("todo link da tela de Anúncios para /corretor/leads usa parâmetro que a lista lê", () => {
    const lidos = new Set(parametrosLidosPelaLista());

    const desconhecidos = [...TELA_DE_ANUNCIOS.matchAll(/\/corretor\/leads\?([a-zA-Z]+)=/g)]
      .map((m) => m[1])
      .filter((nome) => !lidos.has(nome));

    expect(desconhecidos).toEqual([]);
  });

  /*
   * Por ID e nunca por nome: nome de campanha é rótulo de exibição e muda
   * quando alguém renomeia no Gerenciador de Anúncios — a atribuição do
   * passado quebraria sem ninguém perceber.
   */
  it("o link de campanha carrega o ID, não o nome", () => {
    expect(TELA_DE_ANUNCIOS).toContain("campanha=${encodeURIComponent(c.campanhaId)}");
  });
});
