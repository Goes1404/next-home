import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Toda rota de cron chamada pelo pg_cron precisa aceitar POST.
 *
 * `net.http_post` é o verbo que as funções `configurar_*` usam — é o mais
 * simples de assinar com o segredo do Vault. Uma rota que só exporta `GET`
 * responde **405 para sempre, em silêncio**: o job roda no horário, a Vercel
 * recusa o método, e nada em `cron.job_run_details` parece errado, porque a
 * requisição FOI enviada com sucesso. O erro só existe na resposta, que
 * ninguém lê.
 *
 * Aconteceu de verdade em 03/09/2026: `relatorio-semanal` e
 * `quem-esta-esperando` foram construídas sem `export const POST = GET` e
 * agendadas assim. `campanhas` e `followups` já tinham a linha, com o
 * comentário certo — só que o padrão morava no exemplo, não numa guarda.
 *
 * `meta-ads` é a exceção declarada: quem a chama é o cron da VERCEL
 * (`vercel.json`), que usa GET.
 */

const SO_GET = ["meta-ads"];
const DIR = path.join(process.cwd(), "src/app/api/cron");

function rotasDeCron(): string[] {
  return fs
    .readdirSync(DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(DIR, e.name, "route.ts")))
    .map((e) => e.name);
}

describe("rotas de cron aceitam o verbo que o pg_cron usa", () => {
  const rotas = rotasDeCron();

  it("acha as rotas de cron", () => {
    expect(rotas.length).toBeGreaterThan(2);
  });

  it("toda rota chamada pelo pg_cron exporta POST", () => {
    const semPost = rotas
      .filter((r) => !SO_GET.includes(r))
      .filter((r) => {
        const codigo = fs.readFileSync(path.join(DIR, r, "route.ts"), "utf8");
        return !/export\s+(const\s+POST|async\s+function\s+POST|function\s+POST)/.test(codigo);
      });
    expect(
      semPost,
      "Estas rotas só aceitam GET e o pg_cron chama com POST: elas responderiam " +
        "405 no horário agendado, sem erro visível em lugar nenhum. Acrescente " +
        "`export const POST = GET;` — ou, se quem chama for o cron da Vercel " +
        "(que usa GET), declare a rota em SO_GET com o motivo.",
    ).toEqual([]);
  });

  it("a lista de exceções não tem entrada morta", () => {
    const orfas = SO_GET.filter((r) => !rotas.includes(r));
    expect(orfas, "Estas rotas não existem mais; tire-as de SO_GET.").toEqual([]);
  });
});
