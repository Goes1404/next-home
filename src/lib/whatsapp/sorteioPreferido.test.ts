import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guarda de código-fonte sobre a última definição da função no diretório
 * de migrations. Banco de teste não existe aqui, e a regressão seria
 * calada: o link pessoal pararia de preferir alguém sem nada ficar
 * vermelho, ou o telefone pessoal do corretor voltaria a ficar exposto por
 * `anon`/`authenticated` sem nenhum aviso.
 *
 * A âncora é `create or replace function public.sortear_corretor_whatsapp`,
 * não só `function public.sortear_corretor_whatsapp`: a segunda também casa
 * dentro de `revoke execute on function ...` e `grant execute on function
 * ...`. Com a ACL entrando na MESMA migration que a função (ver a última
 * asserção abaixo), o `lastIndexOf` da âncora curta passaria a apontar para
 * a última linha de `grant` — que também contém o texto "function
 * public.sortear_corretor_whatsapp" — perdendo da fatia a definição
 * inteira (create, corpo da consulta e até os três `revoke` que vêm antes
 * do `grant`).
 */
function ultimaDefinicaoDeSorteio(): string {
  const dir = "supabase/migrations";
  const arquivos = readdirSync(dir)
    .filter((nome) => nome.endsWith(".sql"))
    .sort();

  let ultima = "";
  for (const arquivo of arquivos) {
    const sql = readFileSync(`${dir}/${arquivo}`, "utf8");
    const corte = sql
      .toLowerCase()
      .lastIndexOf("create or replace function public.sortear_corretor_whatsapp");
    if (corte >= 0) ultima = sql.slice(corte);
  }
  return ultima;
}

describe("o sorteio do porteiro", () => {
  const def = ultimaDefinicaoDeSorteio();
  // Comparação sempre em MINÚSCULAS: o Postgres dobra identificador sem
  // aspas para minúsculo, então `PREFERIDO` maiúsculo no SQL é o MESMO
  // filtro que `preferido` — e `.toContain`/`.not.toContain` são sensíveis
  // a caixa por padrão.
  const defMin = def.toLowerCase();

  it("aceita um corretor preferido, com default null", () => {
    expect(defMin).toMatch(/preferido\s+uuid\s+default\s+null/);
  });

  it("usa o preferido como ORDENAÇÃO, nunca como filtro", () => {
    // Preferência entra no `order by`. Se entrasse antes disso — no
    // `where`, OU escondida na condição do `join ... on` — o link pessoal
    // de um corretor desconectado devolveria destino nenhum, o erro que a
    // roleta de leads já cometeu uma vez.
    //
    // A checagem negativa cobre o CORPO INTEIRO da consulta, de
    // `as $function$`/`as $$` até `order by` — não só o trecho que vem
    // depois da palavra "where". Um filtro no `on` do `join` fica
    // textualmente ANTES de "where" (`join ... on i.corretor_id = c.id and
    // (preferido is null or c.id = preferido)`) e passaria batido se a
    // fatia negativa começasse só dali.
    const inicioCorpo = Math.max(defMin.indexOf("as $function$"), defMin.indexOf("as $$"));
    const fimCorpo = defMin.indexOf("order by");
    expect(inicioCorpo).toBeGreaterThanOrEqual(0);
    expect(fimCorpo).toBeGreaterThan(inicioCorpo);

    const corpoAntesDaOrdem = defMin.slice(inicioCorpo, fimCorpo);
    expect(corpoAntesDaOrdem).not.toContain("preferido");

    const ordem = defMin.slice(fimCorpo);
    expect(ordem).toContain("preferido");
  });

  it("continua exigindo numero conectado", () => {
    expect(defMin).toMatch(/status_conexao\s*=\s*'conectado'/);
    expect(defMin).toMatch(/telefone_conectado\s+is\s+not\s+null/);
  });

  it("fecha o execute para PUBLIC/anon/authenticated e libera só o service_role, na assinatura (uuid, uuid)", () => {
    // `create or replace function` com assinatura DIFERENTE não substitui:
    // cria um SEGUNDO objeto, que nasce com EXECUTE liberado para PUBLIC
    // por padrão do Postgres. A função é `security definer` e devolve o
    // TELEFONE PESSOAL do corretor — a 0052 fechou isso de propósito, e sem
    // repetir os três `revoke` e o `grant` aqui, referenciando a
    // assinatura `(uuid, uuid)`, a versão nova reabriria esse buraco em
    // silêncio, sem nada ficar vermelho.
    expect(defMin).toMatch(
      /revoke execute on function public\.sortear_corretor_whatsapp\(uuid, uuid\)\s+from public/,
    );
    expect(defMin).toMatch(
      /revoke execute on function public\.sortear_corretor_whatsapp\(uuid, uuid\)\s+from anon/,
    );
    expect(defMin).toMatch(
      /revoke execute on function public\.sortear_corretor_whatsapp\(uuid, uuid\)\s+from authenticated/,
    );
    expect(defMin).toMatch(
      /grant execute on function public\.sortear_corretor_whatsapp\(uuid, uuid\)\s+to service_role/,
    );
  });
});
