import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  avisosParaQuemVe,
  instanteDeBrasilia,
  lerAvisosFechados,
  linkDoAvisoValido,
  situacaoDoAviso,
  validarAviso,
  type AvisoAosClientes,
} from "./avisoAosClientes";

/**
 * Os avisos da Astro para todos os clientes (0242, 29/10/2026): a validação
 * (a mesma no formulário e na action), a vigência e quem vê.
 */

const AGORA = new Date("2026-10-29T15:00:00.000Z");

describe("validarAviso", () => {
  const base = { titulo: "Agenda nova", texto: "Agora dá para marcar visita pelo celular.", tipo: "novidade" };

  it("aceita o mínimo e põe os padrões (todos, agora, sem fim)", () => {
    const r = validarAviso(base, AGORA);
    expect(r).toEqual({
      ok: true,
      aviso: { titulo: "Agenda nova", texto: base.texto, tipo: "novidade", link: null, publico: "todos", inicio_em: null, fim_em: null },
    });
  });

  it("título e texto nos limites da 0242 (3..80 e 3..400), sem contar espaços das pontas", () => {
    expect(validarAviso({ ...base, titulo: "  ab  " }, AGORA).ok).toBe(false);
    expect(validarAviso({ ...base, titulo: "a".repeat(81) }, AGORA).ok).toBe(false);
    expect(validarAviso({ ...base, titulo: "a".repeat(80) }, AGORA).ok).toBe(true);
    expect(validarAviso({ ...base, texto: "ok" }, AGORA).ok).toBe(false);
    expect(validarAviso({ ...base, texto: "a".repeat(401) }, AGORA).ok).toBe(false);
  });

  it("recusa tipo e público desconhecidos", () => {
    expect(validarAviso({ ...base, tipo: "promocao" }, AGORA).ok).toBe(false);
    expect(validarAviso({ ...base, publico: "corretores" }, AGORA).ok).toBe(false);
    expect(validarAviso({ ...base, publico: "gestores" }, AGORA)).toMatchObject({ ok: true, aviso: { publico: "gestores" } });
  });

  it("o link é caminho do painel ou https, e nada mais", () => {
    for (const bom of ["/corretor/agenda", "/corretor/agenda?x=1#y", "https://astrosolucoes.com.br/novidades"]) {
      expect(linkDoAvisoValido(bom), bom).toBe(true);
    }
    for (const ruim of ["//evil.com", "javascript:alert(1)", "http://site.com", "/\\evil.com", "/a b", "https://", "corretor/agenda"]) {
      expect(linkDoAvisoValido(ruim), ruim).toBe(false);
    }
    expect(validarAviso({ ...base, link: "javascript:alert(1)" }, AGORA).ok).toBe(false);
  });

  it("datas do formulário em horário de Brasília; fim depois do início e ainda por vir", () => {
    expect(instanteDeBrasilia("2026-10-30T08:00")).toBe("2026-10-30T11:00:00.000Z");
    expect(instanteDeBrasilia("")).toBeNull();
    expect(instanteDeBrasilia("30/10/2026")).toBeUndefined();

    expect(validarAviso({ ...base, inicio: "2026-10-30T08:00", fim: "2026-10-30T07:00" }, AGORA).ok).toBe(false);
    expect(validarAviso({ ...base, fim: "2026-10-29T11:00" }, AGORA)).toMatchObject({ ok: false, erro: expect.stringContaining("já passou") });
    expect(validarAviso({ ...base, inicio: "2026-10-30T08:00", fim: "2026-10-31T08:00" }, AGORA)).toMatchObject({
      ok: true,
      aviso: { inicio_em: "2026-10-30T11:00:00.000Z", fim_em: "2026-10-31T11:00:00.000Z" },
    });
  });
});

const aviso = (o: Partial<AvisoAosClientes>): AvisoAosClientes => ({
  id: "a",
  titulo: "t",
  texto: "x",
  tipo: "novidade",
  link: null,
  publico: "todos",
  inicio_em: "2026-10-29T12:00:00.000Z",
  fim_em: null,
  encerrado_em: null,
  ...o,
});

describe("situação do aviso", () => {
  it("no ar, agendado e encerrado (à mão ou pelo fim)", () => {
    expect(situacaoDoAviso(aviso({}), AGORA)).toBe("no_ar");
    expect(situacaoDoAviso(aviso({ inicio_em: "2026-10-30T12:00:00.000Z" }), AGORA)).toBe("agendado");
    expect(situacaoDoAviso(aviso({ encerrado_em: "2026-10-29T13:00:00.000Z" }), AGORA)).toBe("encerrado");
    expect(situacaoDoAviso(aviso({ fim_em: "2026-10-29T14:59:00.000Z" }), AGORA)).toBe("encerrado");
  });
});

describe("quem vê (público por papel)", () => {
  const lista = [
    aviso({ id: "todos" }),
    aviso({ id: "so-gestor", publico: "gestores" }),
    aviso({ id: "agendado", inicio_em: "2026-11-01T12:00:00.000Z" }),
    aviso({ id: "encerrado", encerrado_em: "2026-10-29T13:00:00.000Z" }),
  ];

  it("o corretor não vê o aviso só para gestores", () => {
    expect(avisosParaQuemVe(lista, "corretor", AGORA).map((a) => a.id)).toEqual(["todos"]);
  });

  it("o gestor vê os dois; agendado e encerrado não aparecem para ninguém", () => {
    expect(avisosParaQuemVe(lista, "gestor", AGORA).map((a) => a.id).sort()).toEqual(["so-gestor", "todos"]);
  });

  it("importante primeiro, depois manutenção, depois novidade", () => {
    const ordem = avisosParaQuemVe(
      [aviso({ id: "n", tipo: "novidade" }), aviso({ id: "i", tipo: "importante" }), aviso({ id: "m", tipo: "manutencao" })],
      "corretor",
      AGORA,
    );
    expect(ordem.map((a) => a.id)).toEqual(["i", "m", "n"]);
  });
});

describe("avisos fechados no navegador", () => {
  it("lixo vira lista vazia", () => {
    expect(lerAvisosFechados(null)).toEqual([]);
    expect(lerAvisosFechados("{")).toEqual([]);
    expect(lerAvisosFechados('{"a":1}')).toEqual([]);
    expect(lerAvisosFechados('["a", 2, "b"]')).toEqual(["a", "b"]);
  });
});

describe("0242 no banco", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0242_avisos_aos_clientes.sql"), "utf8").replace(/--.*$/gm, "");

  it("só a chave de serviço: RLS ligada, sem policy, sem grant para anon e authenticated", () => {
    expect(sql).toMatch(/enable row level security/);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toMatch(/revoke all on public\.avisos_aos_clientes from anon/);
    expect(sql).toMatch(/revoke all on public\.avisos_aos_clientes from authenticated/);
  });

  it("global: sem grupo_id", () => {
    expect(sql).not.toMatch(/^\s*grupo_id\s/m);
    expect(sql).not.toMatch(/references public\.grupos/);
  });

  it("os limites batem com os do módulo", () => {
    expect(sql).toMatch(/length\(btrim\(titulo\)\) between 3 and 80/);
    expect(sql).toMatch(/length\(btrim\(texto\)\) between 3 and 400/);
    expect(sql).toMatch(/tipo in \('novidade', 'manutencao', 'importante'\)/);
    expect(sql).toMatch(/publico in \('todos', 'gestores'\)/);
  });

  it("a consulta do painel tem índice (vigentes, parcial nos não encerrados)", () => {
    expect(sql).toMatch(/on public\.avisos_aos_clientes \(inicio_em, fim_em\)\s+where encerrado_em is null/);
  });
});
