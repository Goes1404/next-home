import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O repasse de lead guarda a origem ANTES de sobrescrevê-la (L30, 0192).
 *
 * `atribuirLead` e `redistribuirCarteira` gravam `origem_atribuicao =
 * "manual"`. A fase 5 tira a etiqueta de origem de quem já foi repassado da
 * linha `repasse` em `lead_interacoes`, com `detalhes.origem_anterior`.
 * Gravada depois do update, uma falha no meio perderia a origem para sempre;
 * e a regressão é calada (a tela segue funcionando), por isso a guarda lê o
 * código.
 */

function corpoDaFuncao(arquivo: string, nome: string): string {
  const codigo = readFileSync(join(process.cwd(), arquivo), "utf8")
    // Comentário não conta: ele pode citar o que a função faz sem fazer.
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const inicio = codigo.indexOf(`export async function ${nome}(`);
  expect(inicio, `${nome} em ${arquivo}`).toBeGreaterThanOrEqual(0);
  const fim = codigo.indexOf("\nexport ", inicio + 1);
  return codigo.slice(inicio, fim < 0 ? undefined : fim);
}

const CASOS = [
  { arquivo: "src/app/corretor/actions.ts", funcao: "atribuirLead" },
  { arquivo: "src/app/corretor/(painel)/admin/acoes.ts", funcao: "redistribuirCarteira" },
];

describe("repasse de lead", () => {
  for (const { arquivo, funcao } of CASOS) {
    it(`${funcao} grava o repasse com a origem anterior antes de sobrescrevê-la`, () => {
      const corpo = corpoDaFuncao(arquivo, funcao);
      const repasse = corpo.indexOf('tipo: "repasse"');
      const origem = corpo.indexOf("origem_anterior:");
      const sobrescreve = corpo.indexOf('origem_atribuicao: "manual"');
      expect(repasse, "linha de repasse").toBeGreaterThanOrEqual(0);
      expect(origem, "detalhes.origem_anterior").toBeGreaterThan(repasse);
      expect(sobrescreve, "update da origem").toBeGreaterThan(origem);
    });

    // A linha de repasse não se apaga (lead_interacoes não tem DELETE). Se o
    // destino for de outro grupo, o gatilho da 0191 recusa o update DEPOIS
    // dela, e sobra um repasse que não houve. O grupo do destino tem de ser
    // conferido antes da linha.
    it(`${funcao} confere o grupo do destino antes de gravar o repasse`, () => {
      const corpo = corpoDaFuncao(arquivo, funcao);
      const repasse = corpo.indexOf('tipo: "repasse"');
      const grupo = corpo.indexOf(".grupo_id !== guarda.corretor.grupoId");
      expect(grupo, "checagem de grupo do destino").toBeGreaterThanOrEqual(0);
      expect(repasse, "linha de repasse").toBeGreaterThan(grupo);
    });
  }
});
