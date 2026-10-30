import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONFIG_DOS_RAMOS,
  documentoProfissionalDaFicha,
  lerRamo,
  MODULOS_DO_RAMO,
  nomeDoRamo,
  RAMOS,
  rotuloDoGrupoVisita,
  rotulosDeEtapaDoRamo,
  SEM_DOCUMENTO_PROFISSIONAL,
  temModulo,
  validarRamo,
  vocabularioDoRamo,
} from "./ramos";

/**
 * O ramo da conta (29/10/2026, 0244): a configuração é a fonte única do que
 * muda de um negócio para outro. Estes testes seguram três coisas: todo ramo
 * está completo, a imobiliária continua com o texto de sempre, e a lista bate
 * com o CHECK do banco.
 */

describe("a configuração de cada ramo", () => {
  it("todo ramo da lista tem configuração completa", () => {
    expect(Object.keys(CONFIG_DOS_RAMOS).sort()).toEqual([...RAMOS].sort());
    for (const ramo of RAMOS) {
      const c = CONFIG_DOS_RAMOS[ramo];
      expect(c.id).toBe(ramo);
      expect(c.rotulo.length, ramo).toBeGreaterThan(2);
      expect(c.resumo.length, ramo).toBeGreaterThan(10);
      const v = c.vocabulario;
      for (const palavra of [v.equipe, v.cliente, v.oferta, v.compromisso, v.empresa]) {
        expect(palavra.singular.trim(), ramo).not.toBe("");
        expect(palavra.plural.trim(), ramo).not.toBe("");
      }
      expect(v.oferta.titulo.trim(), ramo).not.toBe("");
      expect(v.documento.rotulo.trim(), ramo).not.toBe("");
      expect(v.ranking.trim(), ramo).not.toBe("");
      for (const m of c.modulos) expect(MODULOS_DO_RAMO).toContain(m);
    }
  });

  it("só a imobiliária fica sem contexto de IA próprio (usa o prompt de sempre)", () => {
    for (const ramo of RAMOS) {
      const ia = CONFIG_DOS_RAMOS[ramo].ia;
      if (ramo === "imobiliaria") {
        expect(ia).toBeNull();
      } else {
        expect(ia, ramo).not.toBeNull();
        expect(ia!.papel.trim(), ramo).not.toBe("");
        expect(ia!.negocio.trim(), ramo).not.toBe("");
        expect(ia!.objetivo.trim(), ramo).not.toBe("");
        expect(ia!.qualificacao.length, ramo).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("a lista é a mesma do CHECK da 0244 (grupos e pedidos)", () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0244_ramo_da_conta.sql"), "utf8");
    const checks = [...sql.matchAll(/check \(ramo in \(([^)]*)\)\)/g)].map((m) =>
      [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]).sort(),
    );
    expect(checks).toHaveLength(2);
    for (const lista of checks) expect(lista).toEqual([...RAMOS].sort());
  });
});

describe("a imobiliária continua como era", () => {
  it("vocabulário de hoje, letra por letra", () => {
    const v = vocabularioDoRamo("imobiliaria");
    expect(v.equipe.singular).toBe("corretor");
    expect(v.oferta).toMatchObject({ singular: "imóvel", plural: "imóveis", titulo: "Imóveis" });
    expect(v.compromisso.singular).toBe("visita");
    expect(v.documento).toEqual({ rotulo: "CRECI", obrigatorio: true });
    expect(v.ranking).toBe("Ranking de VGV");
  });

  it("tem todos os módulos; os outros ramos, nenhum de imobiliária", () => {
    for (const m of MODULOS_DO_RAMO) expect(temModulo("imobiliaria", m)).toBe(true);
    for (const ramo of RAMOS.filter((r) => r !== "imobiliaria")) {
      for (const m of MODULOS_DO_RAMO) expect(temModulo(ramo, m), `${ramo}/${m}`).toBe(false);
    }
  });

  it("sem rótulo de etapa novo e sem coluna renomeada", () => {
    expect(rotulosDeEtapaDoRamo("imobiliaria")).toEqual({});
    expect(rotuloDoGrupoVisita("imobiliaria")).toBeNull();
  });

  it("ramo ausente, nulo ou desconhecido vale imobiliária", () => {
    expect(lerRamo(undefined)).toBe("imobiliaria");
    expect(lerRamo(null)).toBe("imobiliaria");
    expect(lerRamo("astronautica")).toBe("imobiliaria");
    expect(vocabularioDoRamo(null).equipe.singular).toBe("corretor");
  });
});

describe("o vocabulário dos outros ramos", () => {
  it("advocacia: advogado, consulta, OAB; etapas falam de consulta", () => {
    const v = vocabularioDoRamo("advocacia");
    expect(v.equipe.singular).toBe("advogado");
    expect(v.compromisso.singular).toBe("consulta");
    expect(v.documento.rotulo).toBe("OAB");
    expect(rotulosDeEtapaDoRamo("advocacia")).toEqual({ visita_agendada: "Consulta marcada", visitou: "Compareceu" });
    expect(rotuloDoGrupoVisita("advocacia")).toBe("Consulta");
  });

  it("seguros: consultor e registro SUSEP opcional", () => {
    const v = vocabularioDoRamo("seguros");
    expect(v.equipe.singular).toBe("consultor");
    expect(v.documento).toEqual({ rotulo: "Registro SUSEP", obrigatorio: false });
    expect(v.ranking).toBe("Ranking de vendas");
  });

  it("o gênero do compromisso vale na etapa ('Atendimento marcado')", () => {
    expect(rotulosDeEtapaDoRamo("varejo").visita_agendada).toBe("Atendimento marcado");
    expect(rotulosDeEtapaDoRamo("seguros").visita_agendada).toBe("Reunião marcada");
  });

  it("nome do ramo: o rótulo, ou o texto do Outro", () => {
    expect(nomeDoRamo("seguros")).toBe("Corretora de seguros");
    expect(nomeDoRamo("outro", "  Clínica   veterinária ")).toBe("Clínica veterinária");
    expect(nomeDoRamo("outro", "")).toBe("Outro");
  });
});

describe("validarRamo", () => {
  it("aceita os ramos da lista sem descrição (e descarta a que vier)", () => {
    expect(validarRamo("advocacia", "ignorado")).toEqual({ ok: true, dados: { ramo: "advocacia", ramoDescricao: null } });
  });

  it("Outro exige o texto, de 2 a 80", () => {
    expect(validarRamo("outro", "")).toMatchObject({ ok: false, campo: "ramoDescricao" });
    expect(validarRamo("outro", " x ")).toMatchObject({ ok: false, campo: "ramoDescricao" });
    expect(validarRamo("outro", "a".repeat(81))).toMatchObject({ ok: false, campo: "ramoDescricao" });
    expect(validarRamo("outro", "  Pet   shop\n")).toEqual({ ok: true, dados: { ramo: "outro", ramoDescricao: "Pet shop" } });
  });

  it("vazio ou desconhecido pede para escolher", () => {
    expect(validarRamo("", "")).toMatchObject({ ok: false, campo: "ramo" });
    expect(validarRamo("astronautica", "")).toMatchObject({ ok: false, campo: "ramo" });
  });
});

describe("o documento profissional da ficha", () => {
  it("imobiliária exige o CRECI", () => {
    expect(documentoProfissionalDaFicha("imobiliaria", "")).toBeNull();
    expect(documentoProfissionalDaFicha("imobiliaria", " 123-F ")).toBe("123-F");
  });

  it("nos ramos sem registro obrigatório, a ficha leva o marcador", () => {
    expect(documentoProfissionalDaFicha("advocacia", "")).toBe(SEM_DOCUMENTO_PROFISSIONAL);
    expect(documentoProfissionalDaFicha("advocacia", "OAB/SP 123")).toBe("OAB/SP 123");
  });
});

describe("o botão de um toque no ramo (30/10/2026, revisão)", () => {
  it("imobiliária: nada muda; outros ramos: o compromisso deles", async () => {
    const { acoesDeEtapaDoRamo } = await import("./ramos");
    expect(acoesDeEtapaDoRamo("imobiliaria")).toEqual({});
    expect(acoesDeEtapaDoRamo("seguros")).toEqual({ qualificado: "Marquei reunião", visita_agendada: "Ele compareceu" });
    expect(acoesDeEtapaDoRamo("saude").qualificado).toBe("Marquei consulta");
  });
});
