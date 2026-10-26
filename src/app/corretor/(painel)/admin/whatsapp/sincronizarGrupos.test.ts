import { beforeEach, describe, expect, it, vi } from "vitest";
import { bancoFalso, leiturasSemGrupo, type BancoFalso } from "../../../../../../test/bancoFalso";

/**
 * Sincronização dos grupos da Aretz: vínculo do corretor com o grupo dele e
 * o `@lid` dele lá dentro (spec 6.4). Roda sobre o banco falso, que aplica os
 * filtros: linha de outro grupo só fica intacta se o código filtrar por grupo.
 */

const GRUPO_A = "00000000-0000-0000-0000-00000000000a";
const GRUPO_B = "00000000-0000-0000-0000-00000000000b";

let banco: BancoFalso;
const listarGruposWhatsapp = vi.fn();
const listarParticipantesDoGrupo = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/whatsapp/provider", () => ({
  desconectarInstancia: async () => ({ ok: true }),
  listarGruposWhatsapp: (...args: unknown[]) => listarGruposWhatsapp(...args),
  listarParticipantesDoGrupo: (...args: unknown[]) => listarParticipantesDoGrupo(...args),
}));
vi.mock("@/lib/guardas", () => ({
  exigirGestorNaAcao: async () => ({ corretor: { id: "gestor-a", papel: "gestor", grupoId: GRUPO_A } }),
}));

const { sincronizarGruposDeLeadsDaAretz } = await import("./acoes");

function corretor(id: string, nome: string, whatsapp: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    nome,
    whatsapp,
    grupo_id: GRUPO_A,
    ativo: true,
    papel: "corretor",
    whatsapp_grupo_leads_jid: null,
    whatsapp_grupo_leads_nome: null,
    whatsapp_lid: null,
    ...extra,
  };
}

function linha(id: string) {
  const l = banco.tabelas.corretores.find((c) => c.id === id);
  if (!l) throw new Error(`sem corretor ${id}`);
  return l;
}

describe("sincronizarGruposDeLeadsDaAretz", () => {
  beforeEach(() => {
    listarGruposWhatsapp.mockReset();
    listarParticipantesDoGrupo.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    banco = bancoFalso({
      grupos: [{ id: GRUPO_A, envio_grupo_leads_ativo: true, envio_grupo_leads_instancia: "central" }],
      corretores: [
        corretor("ana", "Ana Souza", "11987654321"),
        corretor("beto", "Beto Lima", "11911112222"),
        corretor("outro", "Ana Souza", "11900000000", { grupo_id: GRUPO_B, whatsapp_lid: "999@lid" }),
      ],
    });
    listarGruposWhatsapp.mockResolvedValue({
      grupos: [
        { jid: "1@g.us", nome: "Ana Souza & Aretz" },
        { jid: "2@g.us", nome: "Beto Lima & Aretz" },
      ],
    });
  });

  it("vincula o grupo e guarda o @lid achado pelo número do corretor", async () => {
    listarParticipantesDoGrupo.mockImplementation(async (_instancia: string, jid: string) => ({
      participantes:
        jid === "1@g.us"
          ? [
              { id: "10@lid", numero: "5511987654321" },
              { id: "11@lid", numero: "5511955554444" }, // um gestor
            ]
          : [{ id: "20@lid", numero: "5511911112222" }],
    }));

    const r = await sincronizarGruposDeLeadsDaAretz();

    expect(r.ok).toBe("2 grupo(s) vinculado(s).");
    expect(linha("ana")).toMatchObject({ whatsapp_grupo_leads_jid: "1@g.us", whatsapp_lid: "10@lid" });
    expect(linha("beto")).toMatchObject({ whatsapp_grupo_leads_jid: "2@g.us", whatsapp_lid: "20@lid" });
    expect(listarParticipantesDoGrupo).toHaveBeenCalledWith("central", "1@g.us");
  });

  it("reconhece o nome real do grupo: maiúsculas, acento e emoji", async () => {
    banco.tabelas.corretores.push(corretor("andre", "André", "11933334444"));
    listarGruposWhatsapp.mockResolvedValue({ grupos: [{ jid: "3@g.us", nome: "ANDRÉ & ARETZ🟢" }] });
    listarParticipantesDoGrupo.mockResolvedValue({ participantes: [] });
    await sincronizarGruposDeLeadsDaAretz();
    expect(linha("andre").whatsapp_grupo_leads_jid).toBe("3@g.us");
  });

  it("não mexe em corretor de outro grupo", async () => {
    listarParticipantesDoGrupo.mockResolvedValue({ participantes: [] });
    await sincronizarGruposDeLeadsDaAretz();
    expect(linha("outro")).toMatchObject({ whatsapp_grupo_leads_jid: null, whatsapp_lid: "999@lid" });
    expect(leiturasSemGrupo(banco, "corretores")).toEqual([]);
    const escritas = banco.consultas.filter((c) => c.operacao === "update" && c.tabela === "corretores");
    expect(escritas.length).toBeGreaterThan(0);
    expect(escritas.every((c) => c.filtros.includes("eq:grupo_id"))).toBe(true);
  });

  it("participante que só tem o número não grava @lid", async () => {
    listarParticipantesDoGrupo.mockResolvedValue({
      participantes: [{ id: "5511987654321@s.whatsapp.net", numero: "5511987654321" }],
    });
    await sincronizarGruposDeLeadsDaAretz();
    expect(linha("ana").whatsapp_lid).toBeNull();
  });

  it("@lid sem número na lista não é atribuído a ninguém", async () => {
    listarParticipantesDoGrupo.mockResolvedValue({ participantes: [{ id: "77@lid", numero: null }] });
    await sincronizarGruposDeLeadsDaAretz();
    expect(linha("ana").whatsapp_lid).toBeNull();
    expect(linha("beto").whatsapp_lid).toBeNull();
  });

  it("falha ao ler os participantes não desfaz o vínculo do grupo", async () => {
    listarParticipantesDoGrupo.mockResolvedValue({ participantes: [], erro: "HTTP 500" });
    const r = await sincronizarGruposDeLeadsDaAretz();
    expect(r.ok).toBe("2 grupo(s) vinculado(s).");
    expect(linha("ana")).toMatchObject({ whatsapp_grupo_leads_jid: "1@g.us", whatsapp_lid: null });
  });

  it("exceção ao ler os participantes também não desfaz o vínculo", async () => {
    listarParticipantesDoGrupo.mockRejectedValue(new Error("caiu"));
    const r = await sincronizarGruposDeLeadsDaAretz();
    expect(r.ok).toBe("2 grupo(s) vinculado(s).");
    expect(linha("beto").whatsapp_grupo_leads_jid).toBe("2@g.us");
  });

  it("falha na leitura mantém o @lid que já estava guardado", async () => {
    linha("ana").whatsapp_lid = "10@lid";
    listarParticipantesDoGrupo.mockResolvedValue({ participantes: [], erro: "HTTP 500" });
    await sincronizarGruposDeLeadsDaAretz();
    expect(linha("ana").whatsapp_lid).toBe("10@lid");
  });

  it("grupo que serve a dois corretores não vincula nenhum e limpa o vínculo antigo", async () => {
    banco.tabelas.corretores.push(
      corretor("ana2", "ANA SOUZA", "11922223333", { whatsapp_grupo_leads_jid: "1@g.us", whatsapp_grupo_leads_nome: "x" }),
    );
    linha("ana").whatsapp_grupo_leads_jid = "1@g.us";
    listarParticipantesDoGrupo.mockResolvedValue({ participantes: [] });

    const r = await sincronizarGruposDeLeadsDaAretz();

    expect(linha("ana").whatsapp_grupo_leads_jid).toBeNull();
    expect(linha("ana2")).toMatchObject({ whatsapp_grupo_leads_jid: null, whatsapp_grupo_leads_nome: null });
    expect(linha("beto").whatsapp_grupo_leads_jid).toBe("2@g.us");
    expect(r.ok).toContain("1 grupo(s) vinculado(s).");
    expect(r.ok).toContain(
      "O grupo Ana Souza & Aretz serve a mais de um corretor; renomeie para ter um grupo por corretor.",
    );
    // Os participantes só são lidos do grupo que ficou vinculado.
    expect(listarParticipantesDoGrupo).toHaveBeenCalledTimes(1);
    expect(listarParticipantesDoGrupo).toHaveBeenCalledWith("central", "2@g.us");
  });

  it("se TODOS os grupos caíram em repetido, a resposta é erro", async () => {
    banco.tabelas.corretores = banco.tabelas.corretores.filter((c) => c.id !== "beto");
    banco.tabelas.corretores.push(corretor("ana2", "ana souza", "11922223333"));
    const r = await sincronizarGruposDeLeadsDaAretz();
    expect(r.ok).toBeUndefined();
    expect(r.erro).toContain("serve a mais de um corretor");
    expect(listarParticipantesDoGrupo).not.toHaveBeenCalled();
  });

  it("corretor sem grupo no padrão perde o vínculo antigo", async () => {
    linha("beto").whatsapp_grupo_leads_jid = "9@g.us";
    listarGruposWhatsapp.mockResolvedValue({ grupos: [{ jid: "1@g.us", nome: "Ana Souza & Aretz" }] });
    listarParticipantesDoGrupo.mockResolvedValue({ participantes: [] });
    const r = await sincronizarGruposDeLeadsDaAretz();
    expect(linha("beto").whatsapp_grupo_leads_jid).toBeNull();
    expect(r.ok).toBe("1 grupo(s) vinculado(s); 1 sem grupo no padrão.");
  });
});
