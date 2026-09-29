import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Guarda de código-fonte sobre a última definição da função no diretório
 * de migrations. Banco de teste não existe aqui, e a regressão seria
 * calada: o telefone pessoal do corretor voltaria a ficar exposto por
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
  // aspas para minúsculo, e `.toMatch` é sensível a caixa por padrão.
  const defMin = def.toLowerCase();

  it("aceita o corretor preferido do link pessoal, com default null", () => {
    expect(defMin).toMatch(/preferido\s+uuid\s+default\s+null/);
  });

  it("usa o preferido como ORDENAÇÃO, nunca como filtro", () => {
    // Como filtro, o link de um corretor desconectado devolveria destino
    // nenhum e o clique morreria. O corpo antes do `order by` inclui o `on`
    // do join, onde um filtro também se esconderia.
    const inicio = Math.max(defMin.indexOf("as $function$"), defMin.indexOf("as $$"));
    const fimCorpo = defMin.indexOf("order by", defMin.indexOf("select c.id"));
    expect(inicio).toBeGreaterThanOrEqual(0);
    expect(fimCorpo).toBeGreaterThan(inicio);
    expect(defMin.slice(inicio, fimCorpo)).not.toContain("preferido");
    expect(defMin.slice(fimCorpo)).toContain("preferido");
  });

  it("mantém o rodízio por imóvel da 0117", () => {
    expect(defMin).toContain("p_empreendimento");
    expect(defMin).toMatch(/origem like 'anuncio\/%'/);
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
