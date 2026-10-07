import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import { gerarXlsx } from "@/lib/imoveis/xlsxEscrita";
import type { Movimento } from "./caixa";
import { CONFIG_PADRAO, impostosDoMes } from "./fiscal";
import { abasDoPacote, totaisDoMes, type EntradaDoPacote } from "./pacoteDoMes";
import { resultadoDoMes } from "./resultado";

const mov = (p: Partial<Movimento>): Movimento => ({
  chave: Math.random().toString(),
  origem: "lancamento",
  tipo: "saida",
  descricao: "Aluguel",
  detalhe: null,
  categoria: "aluguel",
  valor: 1000,
  vencimento: "2026-09-10",
  pagoEm: "2026-09-10",
  ...p,
});

function entrada(): EntradaDoPacote {
  const movimentos = [
    mov({}),
    mov({ origem: "comissao", tipo: "entrada", categoria: null, descricao: "Comissão Dom Parque", valor: 16000, pagoEm: "2026-09-05" }),
    mov({ origem: "repasse", categoria: null, descricao: "Repasse Ana", valor: 6000, pagoEm: "2026-09-06" }),
  ];
  return {
    mes: "2026-09",
    resultado: resultadoDoMes(movimentos, "2026-09"),
    movimentos,
    impostos: impostosDoMes(16000, CONFIG_PADRAO),
    impostosPagos: 0,
    receita: 16000,
    config: CONFIG_PADRAO,
    rpas: [],
    comissoesDoMes: [
      {
        id: "v1",
        imovel: "Dom Parque",
        unidade: "101",
        construtora: "P4",
        leadNome: "Ana",
        dataVenda: "2026-08-01",
        valorVenda: 400000,
        comissaoValor: 16000,
        status: "ativa",
        comissaoRecebidaEm: "2026-09-05",
      },
    ],
    dados: new Map(),
  };
}

/** Lê os nomes de arquivo e o workbook.xml de dentro do .xlsx gerado. */
function lerZip(buf: Buffer): Map<string, string> {
  const arquivos = new Map<string, string>();
  let i = 0;
  while (buf.readUInt32LE(i) === 0x04034b50) {
    const tam = buf.readUInt32LE(i + 18);
    const nomeLen = buf.readUInt16LE(i + 26);
    const extra = buf.readUInt16LE(i + 28);
    const nome = buf.toString("utf8", i + 30, i + 30 + nomeLen);
    const ini = i + 30 + nomeLen + extra;
    arquivos.set(nome, inflateRawSync(buf.subarray(ini, ini + tam)).toString("utf8"));
    i = ini + tam;
  }
  return arquivos;
}

describe("pacote do mês", () => {
  it("totais batem com a DRE e contam comissão sem nota", () => {
    const t = totaisDoMes(entrada());
    expect(t.receita).toBe(16000);
    expect(t.repasses).toBe(6000);
    expect(t.despesas).toBe(1000);
    expect(t.resultado).toBe(9000);
    expect(t.impostosEstimados).toBe(960);
    expect(t.semNota).toBe(1);
  });

  it("cinco abas, saída negativa nos movimentos", () => {
    const abas = abasDoPacote(entrada());
    expect(abas.map((a) => a.aba)).toEqual(["Resumo 2026-09", "Entradas e saídas", "Impostos 2026-09", "RPA 2026-09", "Notas 2026-09"]);
    const movimentos = abas[1].linhas;
    expect(movimentos[0][0]).toBe("2026-09-05"); // ordenado por data
    expect(movimentos.find((l) => l[2] === "Repasse a corretor")?.[5]).toBe(-6000);
  });

  it("o arquivo tem uma planilha por aba no workbook", () => {
    const zip = lerZip(gerarXlsx(abasDoPacote(entrada())));
    expect([...zip.keys()].filter((n) => n.startsWith("xl/worksheets/"))).toHaveLength(5);
    const wb = zip.get("xl/workbook.xml") ?? "";
    expect(wb.match(/<sheet /g)).toHaveLength(5);
    expect(zip.get("xl/_rels/workbook.xml.rels")).toContain('Id="rId6"'); // estilos depois das 5 abas
  });

  it("nome de aba repetido ganha número", () => {
    const p = { aba: "Igual", colunas: [{ titulo: "A", largura: 5 }], linhas: [] };
    const wb = lerZip(gerarXlsx([p, p])).get("xl/workbook.xml") ?? "";
    expect(wb).toContain('name="Igual"');
    expect(wb).toContain('name="Igual (2)"');
  });
});
