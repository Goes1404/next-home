import { beforeEach, describe, expect, it, vi } from "vitest";
import { filtro, supabaseFalso, type Consulta, type Resposta } from "./supabaseFalso.testutil";

const notificacoes: { corretorId: string; n: { titulo: string; corpo: string; url: string; tag?: string } }[] = [];
vi.mock("@/lib/notificacoes/push", () => ({
  notificarCorretor: async (_s: unknown, corretorId: string, n: (typeof notificacoes)[number]["n"]) => {
    notificacoes.push({ corretorId, n });
    return 1;
  },
}));

const { avisarSenhasVencendo } = await import("./senhaVencendo");
const { decidirAvisoDeSenha, horaDoAvisoDeSenha, notificacaoDaSenha } = await import("./regrasDaSenha");

const DIA = 86_400_000;
const sp = (dataHora: string) => new Date(`${dataHora}-03:00`);
// 29/10/2026 9h10 em São Paulo: a hora do aviso.
const AGORA = sp("2026-10-29T09:10:00");
/** `app_metadata` de quem trocou a senha há `dias` dias (validade de 90). */
const trocouHa = (dias: number) => ({ senha_trocada_em: new Date(AGORA.getTime() - dias * DIA).toISOString() });

beforeEach(() => {
  notificacoes.length = 0;
});

describe("regra da senha vencendo", () => {
  it("conta sem a data não é avisada", () => {
    expect(decidirAvisoDeSenha({ appMetadata: {}, ultimoAviso: null, agora: AGORA })).toBeNull();
    expect(decidirAvisoDeSenha({ appMetadata: null, ultimoAviso: null, agora: AGORA })).toBeNull();
    expect(decidirAvisoDeSenha({ appMetadata: { senha_trocada_em: "lixo" }, ultimoAviso: null, agora: AGORA })).toBeNull();
  });

  it("avisa só nos últimos 7 dias", () => {
    expect(decidirAvisoDeSenha({ appMetadata: trocouHa(80), ultimoAviso: null, agora: AGORA })).toBeNull();
    expect(decidirAvisoDeSenha({ appMetadata: trocouHa(83), ultimoAviso: null, agora: AGORA })).toEqual({ tipo: "vence", dias: 7 });
    expect(decidirAvisoDeSenha({ appMetadata: trocouHa(89.5), ultimoAviso: null, agora: AGORA })).toEqual({ tipo: "vence", dias: 0 });
  });

  it("uma vez por dia de São Paulo", () => {
    const meta = trocouHa(87);
    expect(decidirAvisoDeSenha({ appMetadata: meta, ultimoAviso: sp("2026-10-29T09:00:00"), agora: AGORA })).toBeNull();
    expect(decidirAvisoDeSenha({ appMetadata: meta, ultimoAviso: sp("2026-10-28T09:00:00"), agora: AGORA })).toEqual({ tipo: "vence", dias: 3 });
  });

  it("vencida: um aviso só, o primeiro depois do vencimento", () => {
    const meta = trocouHa(95); // venceu há 5 dias
    expect(decidirAvisoDeSenha({ appMetadata: meta, ultimoAviso: null, agora: AGORA })).toEqual({ tipo: "vencida" });
    // O último aviso foi o de "vence em 1 dia", antes do vencimento: avisa que venceu.
    expect(decidirAvisoDeSenha({ appMetadata: meta, ultimoAviso: new Date(AGORA.getTime() - 6 * DIA), agora: AGORA })).toEqual({
      tipo: "vencida",
    });
    // Já avisou depois do vencimento: nunca mais.
    expect(decidirAvisoDeSenha({ appMetadata: meta, ultimoAviso: new Date(AGORA.getTime() - 4 * DIA), agora: AGORA })).toBeNull();
  });

  it("os textos", () => {
    expect(notificacaoDaSenha({ tipo: "vence", dias: 5 }).titulo).toBe("Sua senha vence em 5 dias");
    expect(notificacaoDaSenha({ tipo: "vence", dias: 1 }).titulo).toBe("Sua senha vence em 1 dia");
    expect(notificacaoDaSenha({ tipo: "vence", dias: 0 }).titulo).toBe("Sua senha vence em menos de 24 horas");
    expect(notificacaoDaSenha({ tipo: "vencida" }).corpo).toMatch(/próximo acesso/);
  });

  it("só na hora das 9h de São Paulo", () => {
    expect(horaDoAvisoDeSenha(sp("2026-10-29T09:00:00"))).toBe(true);
    expect(horaDoAvisoDeSenha(sp("2026-10-29T09:55:00"))).toBe(true);
    expect(horaDoAvisoDeSenha(sp("2026-10-29T10:00:00"))).toBe(false);
    expect(horaDoAvisoDeSenha(sp("2026-10-29T03:00:00"))).toBe(false);
  });
});

function cenario(usuarios: { id: string; app_metadata: Record<string, unknown> }[], fichas: unknown[]) {
  const listUsers = vi.fn(async () => ({ data: { users: usuarios }, error: null }));
  const falso = supabaseFalso(
    (c: Consulta): Resposta => {
      if (c.tabela === "corretores" && c.acao === "select") return { data: fichas, error: null };
      if (c.tabela === "corretores" && c.acao === "update") return { data: [{ id: "ok" }], error: null };
      return { data: null, error: null };
    },
    { listUsers },
  );
  return { ...falso, listUsers };
}

describe("avisarSenhasVencendo", () => {
  it("fora das 9h nem lê a lista do Auth", async () => {
    const { cliente, listUsers } = cenario([], []);
    expect(await avisarSenhasVencendo(cliente, sp("2026-10-29T14:00:00"))).toBe(0);
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("avisa cada ficha ativa pela regra, com claim diário (vencendo) ou único (vencida)", async () => {
    const vencida = trocouHa(95);
    const { cliente, consultas } = cenario(
      [
        { id: "u1", app_metadata: trocouHa(86) },
        { id: "u2", app_metadata: {} },
        { id: "u3", app_metadata: vencida },
        { id: "u4", app_metadata: trocouHa(10) },
      ],
      [
        { id: "c1", user_id: "u1", aviso_senha_em: null },
        { id: "c3", user_id: "u3", aviso_senha_em: null },
        { id: "c4", user_id: "u4", aviso_senha_em: null },
      ],
    );
    expect(await avisarSenhasVencendo(cliente, AGORA)).toBe(2);

    // Quem não tem a data nem entra na consulta de fichas.
    const leitura = consultas.find((c) => c.tabela === "corretores" && c.acao === "select")!;
    expect(filtro(leitura, "in")).toEqual(["user_id", ["u1", "u3", "u4"]]);
    expect(leitura.filtros).toContainEqual(["eq", "ativo", true]);

    const claims = consultas.filter((c) => c.acao === "update");
    expect(filtro(claims[0], "or")).toEqual([`aviso_senha_em.is.null,aviso_senha_em.lt.${sp("2026-10-29T00:00:00").toISOString()}`]);
    const vencimento = new Date(new Date(vencida.senha_trocada_em).getTime() + 90 * DIA).toISOString();
    expect(filtro(claims[1], "or")).toEqual([`aviso_senha_em.is.null,aviso_senha_em.lt.${vencimento}`]);

    expect(notificacoes.map((x) => [x.corretorId, x.n.titulo, x.n.url, x.n.tag])).toEqual([
      ["c1", "Sua senha vence em 4 dias", "/corretor/senha", "senha"],
      ["c3", "Sua senha venceu", "/corretor/senha", "senha"],
    ]);
  });
});
