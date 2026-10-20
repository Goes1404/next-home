import { describe, expect, it, vi } from "vitest";
import { caminhoDepoisDoAceite, SECOES_DOS_TERMOS, TERMOS_SAO_RASCUNHO, VERSAO_DOS_TERMOS } from "./termos";
import { aceitouTermosVigentes } from "./aceite";

describe("o texto dos termos", () => {
  it("tem versão curta e marcada como rascunho até o advogado revisar", () => {
    expect(VERSAO_DOS_TERMOS.length).toBeGreaterThan(0);
    expect(VERSAO_DOS_TERMOS.length).toBeLessThanOrEqual(60);
    expect(TERMOS_SAO_RASCUNHO).toBe(true);
    expect(VERSAO_DOS_TERMOS).toMatch(/rascunho/);
  });

  it("fala do risco do número, da IA que pode errar e dos dados dos clientes", () => {
    const tudo = SECOES_DOS_TERMOS.flatMap((s) => [s.titulo, ...s.paragrafos]).join(" ");
    expect(tudo).toMatch(/bloque/i);
    expect(tudo).toMatch(/pode errar/i);
    expect(tudo).toMatch(/uma conta/i);
    expect(tudo).toMatch(/LGPD/);
  });

  it("serve ao corretor independente, que não tem imobiliária", () => {
    const tudo = SECOES_DOS_TERMOS.flatMap((s) => s.paragrafos).join(" ");
    expect(tudo).toMatch(/corretor independente/);
    // Nada afirma que toda conta tem uma imobiliária por trás.
    for (const afirmacao of ["oferecido à sua imobiliária", "sua imobiliária desativar", "plano da sua imobiliária", "gestor da sua imobiliária"]) {
      expect(tudo).not.toContain(afirmacao);
    }
  });

  it("não promete o que o produto não faz", () => {
    const tudo = SECOES_DOS_TERMOS.flatMap((s) => s.paragrafos).join(" ").toLowerCase();
    for (const promessa of ["garantimos que", "nunca será bloqueado", "100%", "sem risco", "api oficial do whatsapp"]) {
      expect(tudo).not.toContain(promessa);
    }
  });
});

describe("para onde vai depois de aceitar", () => {
  it("quem ainda tem senha provisória vai trocar a senha; os outros, ao painel", () => {
    expect(caminhoDepoisDoAceite(true)).toBe("/corretor/senha");
    expect(caminhoDepoisDoAceite(false)).toBe("/corretor");
  });
});

describe("aceitouTermosVigentes", () => {
  function cliente(resposta: { data: unknown; error: { message: string } | null }) {
    const consulta = {
      select: vi.fn(() => consulta),
      eq: vi.fn(() => consulta),
      maybeSingle: vi.fn().mockResolvedValue(resposta),
    };
    return { from: vi.fn(() => consulta), consulta };
  }

  it("procura o aceite do corretor na versão vigente", async () => {
    const c = cliente({ data: { id: "a1" }, error: null });
    expect(await aceitouTermosVigentes(c as never, "c1")).toBe(true);
    expect(c.from).toHaveBeenCalledWith("aceites_de_termos");
    expect(c.consulta.eq).toHaveBeenCalledWith("corretor_id", "c1");
    expect(c.consulta.eq).toHaveBeenCalledWith("versao", VERSAO_DOS_TERMOS);
  });

  it("sem aceite, não aceitou", async () => {
    expect(await aceitouTermosVigentes(cliente({ data: null, error: null }) as never, "c1")).toBe(false);
  });

  it("erro de leitura não tranca o painel (a tabela pode chegar depois do deploy)", async () => {
    const espiao = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await aceitouTermosVigentes(cliente({ data: null, error: { message: "relation does not exist" } }) as never, "c1")).toBe(true);
    espiao.mockRestore();
  });
});
