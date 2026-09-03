import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A roleta de leads (`distribuir_lead`, 0007) decide a carteira de gente, e
 * as duas regressões que ela sofre falham CALADAS: o lead aparece
 * atribuído, a tela funciona, e só meses depois alguém repara que ninguém
 * atendeu.
 *
 * 1. Distribuir para quem não pode agir. Medido em 03/09/2026, antes da
 *    0093: 8 dos 9 leads da roleta estavam com 6 corretores sem login e sem
 *    WhatsApp. Como o único critério era carga, quanto mais alguém
 *    trabalhava, menos lead recebia — até o lead ir parar com quem não
 *    consegue abrir a tela para vê-lo.
 *
 * 2. Contar carteira arquivada. Lead arquivado não dá trabalho a ninguém, e
 *    contá-lo faz a roleta evitar justamente quem está livre.
 *
 * Este teste lê a ÚLTIMA definição da função nas migrations, que é a que
 * vale no banco — reescrever a função numa migration futura sem as
 * preferências é exatamente o acidente que ele existe para pegar.
 */

const DIR = join(process.cwd(), "supabase", "migrations");

function ultimaDefinicaoDaRoleta(): string {
  const arquivos = readdirSync(DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort();

  let ultima = "";
  for (const nome of arquivos) {
    const sql = readFileSync(join(DIR, nome), "utf8");
    const i = sql.toLowerCase().lastIndexOf("function public.distribuir_lead()");
    if (i === -1) continue;
    // Do início da função até o fim do corpo: `$function$;` ou `$$;`.
    const resto = sql.slice(i);
    const fim = resto.search(/\$(function)?\$\s*;/);
    ultima = fim === -1 ? resto : resto.slice(0, fim);
  }
  return ultima;
}

describe("a roleta distribui para quem consegue atender", () => {
  const corpo = ultimaDefinicaoDaRoleta();

  it("a função existe nas migrations", () => {
    expect(corpo, "Nenhuma migration define distribuir_lead().").not.toBe("");
  });

  it("prefere quem tem o WhatsApp no ar", () => {
    expect(
      /\(\s*i\.corretor_id\s+is\s+null\s*\)/.test(corpo),
      "A roleta parou de preferir quem tem WhatsApp conectado. O contato do lead " +
        "acontece por ele; sem essa preferência o lead vai para um número que não existe.",
    ).toBe(true);
  });

  it("prefere quem consegue abrir o painel", () => {
    expect(
      /\(\s*c\.user_id\s+is\s+null\s*\)/.test(corpo),
      "A roleta parou de preferir quem tem login. Lead atribuído a quem não " +
        "entra no painel é tão invisível quanto lead sem dono, e mais difícil de notar.",
    ).toBe(true);
  });

  it("conta carga só de lead ativo", () => {
    expect(
      /l\.arquivado_em\s+is\s+null/.test(corpo),
      "A conta de carga voltou a incluir lead arquivado. Carteira morta não dá " +
        "trabalho, e contá-la faz a roleta evitar quem está livre.",
    ).toBe(true);
  });

  it("nunca transforma preferência em filtro — o lead precisa nascer com dono", () => {
    /*
     * O WHERE que importa é o da consulta de corretores, não o da
     * subconsulta de cidade que vem antes — recortar pelo primeiro " where "
     * do corpo pegava o LEFT JOIN inteiro e acusava um filtro que não existe.
     */
    const minusculo = corpo.toLowerCase();
    const daRoleta = minusculo.indexOf("from corretores c");
    const where = corpo.slice(
      minusculo.indexOf(" where ", daRoleta),
      minusculo.indexOf("order by", daRoleta),
    );
    for (const proibido of ["user_id is not null", "status_conexao", "slug is not null"]) {
      expect(
        where.includes(proibido),
        `"${proibido}" virou filtro no WHERE. Filtro devolve alvo nulo e o lead ` +
          `nasce órfão — pior que mal distribuído. Isso é ordem, não recorte.`,
      ).toBe(false);
    }
  });
});

describe("o webhook do Meta escreve com a chave de serviço", () => {
  /*
   * `anon` tem só INSERT em `leads`. O upsert do webhook passava por
   * acidente, porque `ignoreDuplicates: true` transforma o conflito em
   * no-op e nunca chega a pedir UPDATE. Bastaria alguém tirar essa opção
   * para o webhook falhar em silêncio — a Meta recebe 200 e o lead some.
   */
  const rota = readFileSync(
    join(process.cwd(), "src", "app", "api", "webhooks", "meta", "route.ts"),
    "utf8",
  );

  it("importa createServiceClient", () => {
    expect(rota.includes("createServiceClient")).toBe(true);
  });

  it("não usa o cliente publicável", () => {
    expect(
      rota.includes("@/lib/supabase/public"),
      "O webhook voltou ao cliente anônimo, que não tem UPDATE em `leads`.",
    ).toBe(false);
  });
});
