import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A página da visão de suporte (0243, 29/10/2026): a guarda vem antes de
 * qualquer leitura, e os números só aparecem com um acesso registrado e
 * válido (`?acesso=`). Sem ele, só o formulário do registro.
 */

const GRUPO = "00000000-0000-4000-8000-0000000000a1";
const ACESSO = "00000000-0000-4000-8000-0000000000c1";

let admin: boolean;
let acessoValido: boolean;
const chamadas: string[] = [];

vi.mock("@/lib/guardas", () => ({
  exigirAdminDaPlataformaNaPagina: async () => {
    chamadas.push("guarda");
    if (!admin) throw new Error("NEXT_NOT_FOUND");
    return { userId: "u-admin" };
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/plataforma/grupos", () => ({
  lerGrupoDaPlataforma: async () => {
    chamadas.push("grupo");
    return {
      id: GRUPO,
      nome: "Imobiliária Teste",
      tipo: "imobiliaria",
      plano: "profissional",
      situacao: "ativo",
      criadoEm: "2026-01-01T00:00:00Z",
      mensalidade: 297,
      diaDoVencimento: 10,
      tetoAjustado: null,
      tetoDoPlano: 1000,
      numerosConectados: 1,
      usoDaIa: { respostas: 10, teto: 1000, percentual: 1, nivel: "livre" },
      cobranca: { estado: "em_dia", competenciaEmAberto: null, vencimento: null, diasDeAtraso: 0, suspendeEm: null, proximoVencimento: "2026-11-10" },
      pagamentos: [],
      enderecos: [{ host: "teste.astro.com.br", tipo: "gratuito", principal: true }],
    };
  },
}));
vi.mock("@/lib/plataforma/visaoDeSuporte", () => ({
  lerAcessoDeSuporte: async () => {
    chamadas.push("acesso");
    return acessoValido ? { id: ACESSO, criadoEm: "2026-10-29T14:00:00Z", motivo: "Atendimento de suporte" } : null;
  },
  lerFunilEmNumeros: async () => {
    chamadas.push("funil");
    return {
      porEtapa: { novo: 3, primeiro_contato: 0, em_conversa: 0, qualificado: 0, visita_agendada: 1, visitou: 0, proposta: 0, documentacao: 0, fechado: 0, perdido: 0 },
      arquivados: 2,
      criadosEm7Dias: 1,
      criadosEm30Dias: 4,
      visitasMarcadas: 1,
    };
  },
  lerEquipeDoSuporte: async () => {
    chamadas.push("equipe");
    return [
      { corretorId: "c1", nome: "Ana Gestora", papel: "gestor", ativo: true, creciOk: true, temLogin: true, ultimoAcesso: null, whatsapp: [{ status: "conectado", desde: null }] },
    ];
  },
}));
vi.mock("@/lib/plataforma/saude", () => ({
  lerSaudeDosGrupos: async () => ({
    [GRUPO]: {
      custo: { custoBrl: 1, custoPorResposta: null, margem: null, fracaoDaMensalidade: null, alerta: false, porFinalidade: [], modelosSemPreco: [] },
      mensalidade: 297,
      cambio: 5,
    },
  }),
}));
vi.mock("@/lib/planos/usoDaIa", () => ({
  lerLimitesDetalhados: async () => {
    chamadas.push("limites");
    const livre = { nivel: "sem_teto", usado: 0, teto: null, percentual: null };
    return {
      limites: { arte: livre, video: livre, lista: livre },
      ajustados: { arte: null, video: null, lista: null },
      padroes: { arte: null, video: null, lista: null },
    };
  },
}));
vi.mock("./FormularioDoAcesso", () => ({ FormularioDoAcesso: () => "[formulário do registro]" }));
vi.mock("@/components/planos/UsoDosLimites", () => ({ UsoDosLimites: () => null }));

const { default: VisaoDeSuportePage } = await import("./page");

async function abrir(acesso?: string): Promise<string> {
  const elemento = await VisaoDeSuportePage({
    params: Promise.resolve({ id: GRUPO }),
    searchParams: Promise.resolve(acesso ? { acesso } : {}),
  });
  return renderToStaticMarkup(elemento);
}

beforeEach(() => {
  admin = true;
  acessoValido = true;
  chamadas.length = 0;
});

describe("visão de suporte", () => {
  it("quem não administra a plataforma recebe 404 antes de qualquer leitura", async () => {
    admin = false;
    await expect(abrir(ACESSO)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(chamadas).toEqual(["guarda"]);
  });

  it("sem acesso registrado: só o formulário, nenhum número lido", async () => {
    const html = await abrir();
    expect(html).toContain("[formulário do registro]");
    expect(chamadas).toEqual(["guarda", "grupo"]);
    expect(html).not.toContain("Funil em números");
  });

  it("acesso vencido ou de outro: avisa e não lê números", async () => {
    acessoValido = false;
    const html = await abrir(ACESSO);
    expect(html).toContain("expirou ou não é seu");
    expect(chamadas).not.toContain("funil");
    expect(chamadas).not.toContain("equipe");
  });

  it("com o acesso registrado: números, equipe e configurações", async () => {
    const html = await abrir(ACESSO);
    expect(chamadas.slice(0, 3)).toEqual(["guarda", "grupo", "acesso"]);
    expect(html).toContain("Funil em números");
    expect(html).toContain("Ana Gestora");
    expect(html).toContain("WhatsApp conectado");
    expect(html).toContain("teste.astro.com.br");
    expect(html).toContain("Configurações (só leitura)");
  });
});
