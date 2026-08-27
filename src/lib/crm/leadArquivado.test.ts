import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Lead arquivado não pode reaparecer em canto nenhum do painel.
 *
 * Este teste LÊ O CÓDIGO-FONTE em vez de rodar as consultas, pelo mesmo
 * motivo de `escalaDoPainel.test.ts` e `gravacaoDeMensagem.test.ts`: a
 * regressão aqui é CALADA. Esquecer o filtro numa das consultas não quebra
 * nada — a tela continua funcionando, só volta a mostrar (ou a contar) um
 * lead que o corretor mandou embora. E contagem que não bate com a lista
 * é o defeito que mais destrói a confiança no painel.
 *
 * O que se trava é qual FILTRO a consulta usa, não o resultado dela — por
 * isso a leitura de fonte, e não um mock de banco.
 */

const ARQUIVOS = [
  "src/lib/corretorSessao.ts",
  "src/lib/crm/filaDeTrabalho.ts",
  "src/lib/admin/agregados.ts",
];

function fonte(caminho: string): string {
  return readFileSync(caminho, "utf8");
}

/** Cada `.from("leads")` seguido do que vem até o fim da expressão. */
function consultasDeLeads(codigo: string): string[] {
  const partes = codigo.split('.from("leads")').slice(1);
  // 400 caracteres cobrem com folga a cadeia de uma consulta (select,
  // filtros, order, range) sem invadir a próxima função.
  return partes.map((p) => p.slice(0, 400));
}

describe("toda consulta de lead filtra os arquivados (0055)", () => {
  for (const arquivo of ARQUIVOS) {
    it(`${arquivo} não lista nem conta arquivado`, () => {
      const consultas = consultasDeLeads(fonte(arquivo));
      expect(consultas.length).toBeGreaterThan(0);

      for (const consulta of consultas) {
        const filtra =
          consulta.includes('is("arquivado_em", null)') ||
          // A lista de arquivados é a exceção legítima: é a tela que existe
          // para mostrá-los, e ela alterna entre os dois filtros.
          consulta.includes('filtro.arquivados') ||
          // Consulta que existe para contar OS ARQUIVADOS (o selo do botão
          // de acesso). Ela olha para o outro lado do mesmo filtro — não é
          // consulta que "esqueceu" de recortar.
          consulta.includes('not("arquivado_em", "is", null)');
        expect(filtra, `consulta sem filtro de arquivado em ${arquivo}:\n${consulta.slice(0, 200)}`).toBe(true);
      }
    });
  }

  it("a lista tem caminho de volta: dá para VER os arquivados", () => {
    // Sem esta tela, arquivar seria perder — e a régua da casa é que dado
    // guardado sem tela é indistinguível de dado perdido.
    expect(fonte("src/lib/corretorSessao.ts")).toContain('not("arquivado_em", "is", null)');
    expect(fonte("src/app/corretor/(painel)/leads/page.tsx")).toContain("arquivados");
  });

  it("excluir em LOTE também exige arquivado antes — a trava vive na query", () => {
    const acoes = fonte("src/app/corretor/(painel)/leads/acoes.ts");
    const delecao = acoes.slice(acoes.indexOf("export async function excluirLeadsEmLote"));
    const corpo = delecao.slice(0, delecao.indexOf("\n}"));
    // Na QUERY, e não numa conferência em JavaScript antes: entre ler e
    // apagar, o lead pode ter sido restaurado em outra aba.
    expect(corpo).toContain('.delete()');
    expect(corpo).toContain('not("arquivado_em", "is", null)');
  });

  it("arquivar em lote não alcança quem já estava arquivado", () => {
    const acoes = fonte("src/app/corretor/(painel)/leads/acoes.ts");
    const fn = acoes.slice(acoes.indexOf("export async function arquivarLeadsEmLote"));
    const corpo = fn.slice(0, fn.indexOf("\n}"));
    // Sem isto, arquivar de novo reescreveria a data e o lead pareceria
    // recém-arquivado — histórico que o próprio sistema falsifica.
    expect(corpo).toContain('is("arquivado_em", null)');
  });

  it("excluir exige o lead arquivado antes — dois passos, não um", () => {
    const acoes = fonte("src/app/corretor/(painel)/leads/[id]/acoes.ts");
    expect(acoes).toContain("Arquive o lead antes de excluir");
    // A checagem tem de vir ANTES do delete, senão não protege nada.
    expect(acoes.indexOf("Arquive o lead antes de excluir")).toBeLessThan(
      acoes.indexOf('.delete()'),
    );
  });
});
