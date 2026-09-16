import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guarda de código-fonte sobre a última definição da função no diretório
 * de migrations. Banco de teste não existe aqui, e a regressão seria
 * calada: o link pessoal pararia de preferir alguém sem nada ficar
 * vermelho.
 */
function ultimaDefinicaoDeSorteio(): string {
  const dir = "supabase/migrations";
  const arquivos = readdirSync(dir)
    .filter((nome) => nome.endsWith(".sql"))
    .sort();

  let ultima = "";
  for (const arquivo of arquivos) {
    const sql = readFileSync(`${dir}/${arquivo}`, "utf8");
    const corte = sql.toLowerCase().lastIndexOf("function public.sortear_corretor_whatsapp");
    if (corte >= 0) ultima = sql.slice(corte);
  }
  return ultima;
}

describe("o sorteio do porteiro", () => {
  const def = ultimaDefinicaoDeSorteio();

  it("aceita um corretor preferido, com default null", () => {
    expect(def).toMatch(/preferido\s+uuid\s+default\s+null/i);
  });

  it("usa o preferido como ORDENAÇÃO, nunca como filtro", () => {
    // Preferência entra no `order by`. Se entrasse no `where`, o link
    // pessoal de um corretor desconectado devolveria destino nenhum — o
    // erro que a roleta de leads ja cometeu uma vez.
    const ordem = def.slice(def.toLowerCase().indexOf("order by"));
    expect(ordem).toContain("preferido");

    const onde = def.slice(
      def.toLowerCase().indexOf("where"),
      def.toLowerCase().indexOf("order by"),
    );
    expect(onde).not.toContain("preferido");
  });

  it("continua exigindo numero conectado", () => {
    expect(def).toMatch(/status_conexao\s*=\s*'conectado'/);
    expect(def).toMatch(/telefone_conectado\s+is\s+not\s+null/i);
  });
});
