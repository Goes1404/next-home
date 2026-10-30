import { describe, expect, it } from "vitest";
import {
  ANCORA_DOS_AVISOS,
  chaveDoOcultar,
  inicioConcluido,
  passosDoInicio,
  progressoDoInicio,
  type EstadoDoInicio,
} from "./primeirosPassosDoInicio";

/**
 * Os primeiros passos do cliente novo no Início (29/10/2026): o que cada
 * papel vê, quando cada passo conta como feito e o que acontece quando uma
 * contagem falha (o passo sai, não vira pendente).
 */

const gestorNovo: EstadoDoInicio = {
  papel: "gestor",
  tipoDoGrupo: "imobiliaria",
  whatsappConectado: false,
  temFoto: false,
  temApresentacao: false,
  aparelhosComAviso: 0,
  imoveisDoGrupo: 0,
  corretoresAtivos: 1,
  leads: 0,
};

const ids = (e: EstadoDoInicio) => passosDoInicio(e).map((p) => p.id);

describe("quem vê o quê", () => {
  it("gestor de imobiliária: os seis passos, com o WhatsApp primeiro", () => {
    expect(ids(gestorNovo)).toEqual(["whatsapp", "perfil", "avisos", "imovel", "equipe", "lead"]);
  });

  it("corretor de imobiliária: sem catálogo e sem convidar a equipe", () => {
    expect(ids({ ...gestorNovo, papel: "corretor" })).toEqual(["whatsapp", "perfil", "avisos", "lead"]);
  });

  it("independente: cuida do catálogo, mas não tem equipe para convidar", () => {
    expect(ids({ ...gestorNovo, tipoDoGrupo: "independente" })).toEqual(["whatsapp", "perfil", "avisos", "imovel", "lead"]);
    expect(ids({ ...gestorNovo, papel: "corretor", tipoDoGrupo: "independente" })).toContain("imovel");
  });
});

describe("quando cada passo está feito", () => {
  const feito = (e: EstadoDoInicio, id: string) => passosDoInicio(e).find((p) => p.id === id)?.feito;

  it("WhatsApp: instância conectada", () => {
    expect(feito(gestorNovo, "whatsapp")).toBe(false);
    expect(feito({ ...gestorNovo, whatsappConectado: true }, "whatsapp")).toBe(true);
  });

  it("perfil: foto E apresentação", () => {
    expect(feito({ ...gestorNovo, temFoto: true }, "perfil")).toBe(false);
    expect(feito({ ...gestorNovo, temFoto: true, temApresentacao: true }, "perfil")).toBe(true);
  });

  it("avisos: pelo menos um aparelho inscrito", () => {
    expect(feito({ ...gestorNovo, aparelhosComAviso: 2 }, "avisos")).toBe(true);
  });

  it("imóvel: o catálogo do grupo tem pelo menos um", () => {
    expect(feito({ ...gestorNovo, imoveisDoGrupo: 1 }, "imovel")).toBe(true);
  });

  it("equipe: mais de um corretor ativo (o gestor sozinho não é equipe)", () => {
    expect(feito({ ...gestorNovo, corretoresAtivos: 1 }, "equipe")).toBe(false);
    expect(feito({ ...gestorNovo, corretoresAtivos: 2 }, "equipe")).toBe(true);
  });

  it("lead: o primeiro recebido ou importado", () => {
    expect(feito({ ...gestorNovo, leads: 1 }, "lead")).toBe(true);
  });
});

describe("contagem que falhou", () => {
  it("o passo sai da lista em vez de aparecer pendente", () => {
    const e = { ...gestorNovo, whatsappConectado: null, aparelhosComAviso: null, imoveisDoGrupo: null, corretoresAtivos: null, leads: null };
    expect(ids(e)).toEqual(["perfil"]);
  });
});

describe("progresso e conclusão", () => {
  it("conta feitos sobre o total e dá a fração da barra", () => {
    const passos = passosDoInicio({ ...gestorNovo, whatsappConectado: true, leads: 3, imoveisDoGrupo: 4 });
    expect(progressoDoInicio(passos)).toEqual({ feitos: 3, total: 6, fracao: 0.5 });
    expect(inicioConcluido(passos)).toBe(false);
  });

  it("tudo feito: o cartão some", () => {
    const tudo: EstadoDoInicio = {
      ...gestorNovo,
      whatsappConectado: true,
      temFoto: true,
      temApresentacao: true,
      aparelhosComAviso: 1,
      imoveisDoGrupo: 10,
      corretoresAtivos: 5,
      leads: 40,
    };
    expect(inicioConcluido(passosDoInicio(tudo))).toBe(true);
    expect(progressoDoInicio(passosDoInicio(tudo)).fracao).toBe(1);
  });
});

describe("cada passo leva à tela que o faz", () => {
  it("rotas do painel", () => {
    const href = Object.fromEntries(passosDoInicio(gestorNovo).map((p) => [p.id, p.href]));
    expect(href).toEqual({
      whatsapp: "/corretor/whatsapp",
      perfil: "/corretor/perfil",
      avisos: `/corretor/perfil#${ANCORA_DOS_AVISOS}`,
      imovel: "/corretor/imoveis/novo",
      equipe: "/corretor/admin/contas",
      lead: "/corretor/importar",
    });
    for (const p of passosDoInicio(gestorNovo)) expect(p.porque.length).toBeGreaterThan(20);
  });

  it("o ocultar é guardado por login", () => {
    expect(chaveDoOcultar("a")).not.toBe(chaveDoOcultar("b"));
  });
});

describe("o ramo da conta (30/10/2026, revisão)", () => {
  it("imobiliária explícita = o mesmo de sem ramo, letra por letra", () => {
    expect(passosDoInicio({ ...gestorNovo, ramo: "imobiliaria" })).toEqual(passosDoInicio(gestorNovo));
  });

  it("sem catálogo de imóveis, o passo do primeiro imóvel não existe", () => {
    expect(ids({ ...gestorNovo, ramo: "seguros" })).toEqual(["whatsapp", "perfil", "avisos", "equipe", "lead"]);
    expect(ids({ ...gestorNovo, tipoDoGrupo: "independente", ramo: "advocacia" })).not.toContain("imovel");
  });

  it("o texto fala a língua do ramo: nada de corretor nem de 'sua página'", () => {
    const passos = passosDoInicio({ ...gestorNovo, ramo: "seguros" });
    const texto = passos.map((p) => `${p.titulo} ${p.porque}`).join(" ");
    expect(texto).not.toMatch(/corretor|sua página|imóve/i);
    expect(passos.find((p) => p.id === "equipe")?.porque).toContain("Cada consultor");
  });
});
