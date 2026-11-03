import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { bancoFalso, type BancoFalso } from "../../../../../../test/bancoFalso";

/**
 * A roleta é só do gestor (03/11/2026, pedido do dono).
 *
 * O caso que puxou o pedido: o lead final 5344 (Denise, Aretz, 30/10/2026)
 * chegou pelo anúncio do PRÓPRIO André e o aviso de "lead distribuído" saiu
 * para o grupo ANDRÉ & ARETZ antes de a etiqueta da Meta marcar o lead como
 * dele (a espera de 90 s de 31/10 resolveu essa corrida). O dono decidiu
 * também que a roleta não é do corretor: no número dele, o lead do anúncio
 * que ele pagou fica com ele — nem roleta, nem aviso no grupo.
 *
 * Três travas, medidas aqui: a aba e o botão somem para o corretor, as ações
 * recusam o corretor e a roleta do webhook não age em número de corretor.
 */

let banco: BancoFalso;
let sessao: { id: string; papel: "corretor" | "gestor"; grupoId: string } | null;

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/corretorSessao", () => ({ getCorretorLogado: async () => sessao }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => banco.cliente }));
vi.mock("@/lib/whatsapp/provider", () => ({ enviarMensagemWhatsapp: async () => ({ enviado: false }) }));
vi.mock("@/lib/whatsapp/repositorio", () => ({ gravarMensagem: async () => {}, obterOuCriarConversa: async () => null }));
vi.mock("@/lib/crm/avisoAoCorretor", () => ({ avisarCorretor: async () => {} }));
vi.mock("@/lib/crm/interacoes", () => ({ registrarInteracao: async () => {} }));
vi.mock("@/lib/marcaDoCrm/ler", () => ({ lerMarcaDoCrm: async () => ({ nome: "Aretz" }) }));
vi.mock("@/lib/marcaDoCrm/marca", () => ({ linkDoPainel: () => "https://painel" }));

const { ABAS, ABAS_DO_GESTOR, abaDoEndereco } = await import("./AbasDosAnuncios");
const { BotoesRapidos } = await import("@/app/corretor/(painel)/_componentes/BotoesRapidos");
const { alternarRoleta } = await import("@/app/corretor/(painel)/_componentes/acoesRapidas");
const { lerModoDaRoleta } = await import("@/lib/whatsapp/roletaDosAnuncios");

const G = "grupo-aretz";

describe("a aba Roleta só existe para o gestor", () => {
  it("o corretor que pede ?aba=roleta cai no Resumo; o gestor abre a Roleta", () => {
    expect(abaDoEndereco("roleta", false)).toBe("resumo");
    expect(abaDoEndereco("roleta", true)).toBe("roleta");
    expect(abaDoEndereco("meta", false)).toBe("resumo");
  });

  it("a Roleta está entre as abas do gestor, e as do corretor continuam lá", () => {
    expect(ABAS_DO_GESTOR.has("roleta")).toBe(true);
    const doCorretor = ABAS.filter((a) => !ABAS_DO_GESTOR.has(a.id)).map((a) => a.id);
    expect(doCorretor).toEqual(["resumo", "campanhas", "clique"]);
  });
});

describe("o botão da roleta no Início", () => {
  it("some para o corretor; o de pausar a IA fica", () => {
    const html = renderToStaticMarkup(
      <BotoesRapidos iaPausada={false} comRoleta={false} roletaLigada={false} roletaComLista />,
    );
    expect(html).toContain("Pausar a IA");
    expect(html).not.toContain("Dividir os leads");
  });

  it("aparece para o gestor", () => {
    const html = renderToStaticMarkup(<BotoesRapidos iaPausada={false} comRoleta roletaLigada={false} roletaComLista />);
    expect(html).toContain("Dividir os leads do anúncio");
  });
});

describe("ligar a roleta pelo Início", () => {
  beforeEach(() => {
    banco = bancoFalso({
      roleta_anuncios: [
        { corretor_id: "andre", grupo_id: G, ligada: false, destinos: ["moises"] },
        { corretor_id: "aretz", grupo_id: G, ligada: false, destinos: ["andre", "moises"] },
      ],
    });
  });

  it("o corretor é recusado e nada muda no banco", async () => {
    sessao = { id: "andre", papel: "corretor", grupoId: G };
    const r = await alternarRoleta(true);
    expect(r.erro).toBe("A roleta é configurada só pelo gestor da imobiliária.");
    expect(banco.tabelas.roleta_anuncios.find((l) => l.corretor_id === "andre")?.ligada).toBe(false);
  });

  it("o gestor liga a roleta do próprio número", async () => {
    sessao = { id: "aretz", papel: "gestor", grupoId: G };
    const r = await alternarRoleta(true);
    expect(r.erro).toBeUndefined();
    expect(banco.tabelas.roleta_anuncios.find((l) => l.corretor_id === "aretz")?.ligada).toBe(true);
  });
});

describe("a roleta do webhook não age em número de corretor", () => {
  function semear(papelDoDono: "corretor" | "gestor", modo: "grupo" | "mensagem" = "grupo") {
    banco = bancoFalso({
      roleta_anuncios: [{ corretor_id: "dono", grupo_id: G, ligada: true, modo_aviso: modo, destinos: ["moises"] }],
      corretores: [{ id: "dono", grupo_id: G, papel: papelDoDono }],
    });
  }

  it("roleta ligada no número de um corretor (linha antiga): desligada", async () => {
    semear("corretor");
    expect(await lerModoDaRoleta("dono")).toBe("desligada");
  });

  it("roleta ligada no número de um gestor: vale, no modo salvo", async () => {
    semear("gestor", "grupo");
    expect(await lerModoDaRoleta("dono")).toBe("grupo");
    semear("gestor", "mensagem");
    expect(await lerModoDaRoleta("dono")).toBe("mensagem");
  });

  it("sem conseguir ler o papel do dono, na dúvida a roleta não age", async () => {
    semear("gestor");
    banco.tabelas.corretores = [];
    expect(await lerModoDaRoleta("dono")).toBe("desligada");
  });
});
