import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  chaveDoNumero,
  ehRecusaDeNumero,
  FRASE_NUMERO_EM_OUTRO_GRUPO,
  numeroEmOutroGrupo,
} from "./numeroDeUmGrupo";

describe("chaveDoNumero (espelho de chave_do_numero_whatsapp, 0198)", () => {
  it("colapsa as duas formas do nono dígito do celular brasileiro", () => {
    expect(chaveDoNumero("5511988887777")).toBe("551188887777");
    expect(chaveDoNumero("551188887777")).toBe("551188887777");
    expect(chaveDoNumero("+55 (11) 98888-7777")).toBe("551188887777");
  });

  it("deixa o resto só com os dígitos, e vazio vira null", () => {
    expect(chaveDoNumero("1 (415) 555-2671")).toBe("14155552671");
    expect(chaveDoNumero("")).toBeNull();
    expect(chaveDoNumero(null)).toBeNull();
  });

  it("a migration usa a mesma regra (55 + DDD + 8 últimos, 10 ou 11 dígitos depois do 55)", () => {
    const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0198_regras_de_operacao.sql"), "utf8");
    expect(sql).toContain("~ '^55[0-9]{10,11}$'");
    expect(sql).toMatch(/substr\(regexp_replace\(p_telefone, '\\D', '', 'g'\), 3, 2\)/);
    expect(sql).toMatch(/right\(regexp_replace\(p_telefone, '\\D', '', 'g'\), 8\)/);
  });
});

describe("numeroEmOutroGrupo", () => {
  function cliente(resposta: { data: unknown; error: { message: string } | null }) {
    return { rpc: vi.fn().mockResolvedValue(resposta) };
  }

  it("pergunta ao banco pelo grupo de quem conecta e devolve sim/não", async () => {
    const c = cliente({ data: true, error: null });
    expect(await numeroEmOutroGrupo(c, "g1", "5511988887777")).toBe(true);
    expect(c.rpc).toHaveBeenCalledWith("numero_whatsapp_em_outro_grupo", {
      p_grupo: "g1",
      p_telefone: "5511988887777",
    });
  });

  it("erro do banco vira 'não sei' (null): o gatilho continua sendo a trava", async () => {
    const c = cliente({ data: null, error: { message: "function does not exist" } });
    expect(await numeroEmOutroGrupo(c, "g1", "5511988887777")).toBeNull();
  });

  it("número vazio nem pergunta", async () => {
    const c = cliente({ data: true, error: null });
    expect(await numeroEmOutroGrupo(c, "g1", "")).toBe(false);
    expect(c.rpc).not.toHaveBeenCalled();
  });
});

describe("a recusa", () => {
  it("reconhece o erro do gatilho", () => {
    expect(ehRecusaDeNumero({ message: "numero_em_outro_grupo" })).toBe(true);
    expect(ehRecusaDeNumero({ message: "outra coisa" })).toBe(false);
    expect(ehRecusaDeNumero(null)).toBe(false);
  });

  it("a frase diz o que fazer, sem dizer de quem é o número", () => {
    expect(FRASE_NUMERO_EM_OUTRO_GRUPO).toMatch(/outra conta/);
    expect(FRASE_NUMERO_EM_OUTRO_GRUPO).toMatch(/desconect/i);
  });
});
