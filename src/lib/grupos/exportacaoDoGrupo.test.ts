import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { nomeDoArquivo } from "./exportacaoDoGrupo";

/**
 * Guarda da exportação do grupo: ela é lida pela sessão do gestor E pela
 * chave de serviço (plataforma e rotina dos 90 dias), então o código tem de
 * filtrar o grupo por escrito em toda consulta e nunca tocar em tabela de
 * conversa (§4: gestor e plataforma não leem conversa). A regressão seria
 * calada: a planilha sairia com mais coisa e ninguém olharia.
 */
const codigo = readFileSync(join(process.cwd(), "src/lib/grupos/exportacaoDoGrupo.ts"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

// `venda_parcelas` (0232): só a data da última parcela recebida, para a aba de vendas.
const PERMITIDAS = ["leads", "empreendimentos", "corretores", "vendas", "venda_parcelas"];

/** Cada `.from("x")` até o `.range(` que fecha a consulta. */
function consultas(): { tabela: string; cadeia: string }[] {
  const saida: { tabela: string; cadeia: string }[] = [];
  const re = /\.from\("([a-z_]+)"\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(codigo))) {
    const fim = codigo.indexOf(".range(", m.index);
    saida.push({ tabela: m[1], cadeia: codigo.slice(m.index, fim === -1 ? undefined : fim) });
  }
  return saida;
}

describe("exportação do grupo", () => {
  it("lê só leads, imóveis, corretores e vendas (com as parcelas)", () => {
    const lidas = consultas().map((c) => c.tabela);
    expect(lidas.length).toBeGreaterThanOrEqual(4);
    expect(lidas.filter((t) => !PERMITIDAS.includes(t))).toEqual([]);
  });

  it("toda consulta filtra o grupo no mesmo encadeamento", () => {
    const sem = consultas().filter((c) => !c.cadeia.includes('.eq("grupo_id", grupoId)'));
    expect(sem.map((c) => c.tabela)).toEqual([]);
  });

  it("não pede coluna de conversa nem texto livre", () => {
    expect(codigo).not.toMatch(/mensagem|conversa|observacao|detalhes|whatsapp|user_id/);
  });

  it("o nome do arquivo leva o endereço do grupo e o dia de São Paulo", () => {
    // 02h UTC de 21/10 ainda é 20/10 em São Paulo.
    expect(nomeDoArquivo("imob-silva", new Date("2026-10-21T02:00:00Z"))).toBe("dados-imob-silva-2026-10-20.xlsx");
    expect(nomeDoArquivo("../x", new Date("2026-10-21T15:00:00Z"))).toBe("dados-x-2026-10-21.xlsx");
  });
});
