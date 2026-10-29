import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, type BancoFalso } from "../../../test/bancoFalso";

/**
 * "Sem uso há 7 dias" no painel de números (29/10/2026): nenhum lead criado
 * e nenhum login da equipe em 7 dias. Leads só contados, por conta.
 */

const AGORA = new Date("2026-10-29T15:00:00Z");
const PROVA = { userId: "u-admin" };

let banco: BancoFalso;
let usuarios: { id: string; last_sign_in_at: string | null }[];
let falhaNoAuth: boolean;

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));

const { lerContasSemUso } = await import("./atividade");

const GRUPOS = [
  { id: "com-lead", situacao: "ativo" },
  { id: "com-login", situacao: "ativo" },
  { id: "parada", situacao: "ativo" },
  { id: "suspensa-parada", situacao: "suspenso" },
  { id: "cancelada", situacao: "encerrado" },
];

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  falhaNoAuth = false;
  usuarios = [
    { id: "u-login", last_sign_in_at: "2026-10-27T10:00:00Z" },
    { id: "u-velho", last_sign_in_at: "2026-09-01T10:00:00Z" },
  ];
  banco = bancoFalso({
    leads: [
      { grupo_id: "com-lead", created_at: "2026-10-28T10:00:00Z" },
      { grupo_id: "parada", created_at: "2026-10-01T10:00:00Z" },
    ],
    corretores: [
      { id: "1", grupo_id: "com-login", ativo: true, user_id: "u-login" },
      { id: "2", grupo_id: "parada", ativo: true, user_id: "u-velho" },
      // O login recente de quem saiu não conta.
      { id: "3", grupo_id: "parada", ativo: false, user_id: "u-login" },
    ],
  });
  (banco.cliente.auth as { admin: Record<string, unknown> }).admin.listUsers = async () =>
    falhaNoAuth ? { data: null, error: { message: "fora do ar" } } : { data: { users: usuarios }, error: null };
});

describe("lerContasSemUso", () => {
  it("sem lead e sem login recente; cancelada fica de fora", async () => {
    const semUso = await lerContasSemUso(PROVA, GRUPOS, AGORA);
    expect([...(semUso ?? [])].sort()).toEqual(["parada", "suspensa-parada"]);
  });

  it("leads só contados (head), um por conta viva e sempre no grupo", async () => {
    await lerContasSemUso(PROVA, GRUPOS, AGORA);
    const leads = banco.consultas.filter((c) => c.tabela === "leads");
    expect(leads).toHaveLength(4);
    for (const c of leads) expect(c.filtros).toEqual(["eq:grupo_id", "gte:created_at"]);
  });

  it("falha numa fonte vira null (não medido), nunca zero", async () => {
    falhaNoAuth = true;
    expect(await lerContasSemUso(PROVA, GRUPOS, AGORA)).toBeNull();
  });
});
