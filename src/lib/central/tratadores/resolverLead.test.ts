import { describe, expect, it, vi } from "vitest";
import { bancoFalso } from "../bancoFalso";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => null }));

const { resolverLead } = await import("./resolverLead");

const G = "g1";
const corretor = { corretorId: "c1", grupoId: G, papel: "corretor" as const, nome: "Carol", imobiliaria: "Next Home" };
const gestor = { ...corretor, corretorId: "g", papel: "gestor" as const };

function banco() {
  return bancoFalso({
    leads: [
      { id: "l1", grupo_id: G, corretor_id: "c1", nome: "João Pereira", telefone: "5511987654321", etapa: "novo", arquivado_em: null },
      { id: "l2", grupo_id: G, corretor_id: "c1", nome: "João Lima", telefone: null, etapa: "novo", arquivado_em: null },
      { id: "l3", grupo_id: G, corretor_id: "c2", nome: "Ana Souza", telefone: "5511911112222", etapa: "novo", arquivado_em: null },
      { id: "l4", grupo_id: G, corretor_id: "c1", nome: "Carla Arquivada", telefone: null, etapa: "perdido", arquivado_em: "2026-10-01" },
      { id: "l5", grupo_id: "outro", corretor_id: "c1", nome: "Ana Outro Grupo", telefone: null, etapa: "novo", arquivado_em: null },
    ],
  }).cliente;
}

describe("resolverLead", () => {
  it("nome que casa com um só", async () => {
    expect(await resolverLead(corretor, "joão p", banco())).toMatchObject({ tipo: "um", lead: { id: "l1" } });
  });

  it("nome que casa com vários pergunta", async () => {
    const r = await resolverLead(corretor, "João", banco());
    expect(r.tipo).toBe("varios");
  });

  it("corretor não acha lead de outro corretor; gestor acha; outro grupo nunca", async () => {
    expect((await resolverLead(corretor, "Ana", banco())).tipo).toBe("nenhum");
    expect(await resolverLead(gestor, "Ana", banco())).toMatchObject({ tipo: "um", lead: { id: "l3" } });
  });

  it("arquivado não conta", async () => {
    expect((await resolverLead(corretor, "Carla", banco())).tipo).toBe("nenhum");
  });

  it("telefone inteiro acha pelas variantes; só o final não identifica", async () => {
    expect(await resolverLead(corretor, "11 98765-4321", banco())).toMatchObject({ tipo: "um", lead: { id: "l1" } });
    expect((await resolverLead(corretor, "4321", banco())).tipo).toBe("nenhum");
  });
});
