import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SLUGS_DE_GRUPO_RESERVADOS, validarSlugDoGrupo } from "./slugDoGrupo";

/*
 * Slug do grupo (0186, spec §18 / L34): vira nome de DNS na fase 3
 * (`<slug>.nexthomeimoveis.com`), então segue a regra de rótulo de DNS e não
 * pode tomar um nome que a própria plataforma usa (www, api, painel…).
 *
 * A lista de reservados existe duas vezes: no TS (a tela recusa antes de
 * gravar) e no SQL (`slug_de_grupo_reservado`, que `criar_grupo` consulta).
 * Duas cópias divergem no primeiro nome acrescentado a uma só; o último teste
 * lê a 0186 e compara.
 */

describe("validarSlugDoGrupo", () => {
  it("aceita imobiliaria-silva", () => {
    expect(validarSlugDoGrupo("imobiliaria-silva")).toEqual({ ok: true });
    expect(validarSlugDoGrupo("abc")).toEqual({ ok: true });
    expect(validarSlugDoGrupo("2ab")).toEqual({ ok: true });
    expect(validarSlugDoGrupo("a".repeat(63))).toEqual({ ok: true });
  });

  it("recusa maiúscula, acento, espaço, hífen no começo/fim, 1 letra e 64+ letras", () => {
    for (const slug of [
      "Imobiliaria",
      "imobiliária",
      "imobiliaria silva",
      "-silva",
      "silva-",
      "a",
      "a".repeat(64),
      "",
      "silva_imoveis",
      "silva.imoveis",
    ]) {
      expect(validarSlugDoGrupo(slug), slug).toEqual({ ok: false, motivo: "formato" });
    }
  });

  it("recusa www e plataforma", () => {
    expect(validarSlugDoGrupo("www")).toEqual({ ok: false, motivo: "reservado" });
    expect(validarSlugDoGrupo("plataforma")).toEqual({
      ok: false,
      motivo: "reservado",
    });
    expect(validarSlugDoGrupo("next-home")).toEqual({ ok: false, motivo: "reservado" });
  });

  it("a lista do TS é a mesma do SQL", () => {
    const sql = readFileSync(
      join(process.cwd(), "supabase", "migrations", "0186_grupos_da_plataforma.sql"),
      "utf8",
    ).replace(/--[^\n]*/g, "");
    const inicio = sql.search(
      /create (?:or replace )?function public\.slug_de_grupo_reservado/i,
    );
    expect(inicio, "slug_de_grupo_reservado não está na 0186").toBeGreaterThan(-1);
    const fim = sql.indexOf("$$;", inicio);
    const corpo = sql.slice(inicio, fim);
    const doSql = [...corpo.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]).sort();

    // Sem isto, um leitor quebrado que não acha nada aprovaria a lista vazia.
    expect(doSql.length).toBeGreaterThan(20);
    expect(doSql).toEqual([...SLUGS_DE_GRUPO_RESERVADOS].sort());
  });
});
