import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { planoDeMensagens } from "./planoDaRoleta";

describe("planoDeMensagens: o que a ROLETA manda ao cliente", () => {
  it("modo mensagem com repasse: a passagem do dono sai ANTES da abertura do escolhido", () => {
    expect(planoDeMensagens("mensagem", true)).toEqual(["passagem", "abertura"]);
  });

  it("modo mensagem sem repasse: nada sai (a boas-vindas fixa foi tirada em 27/10/2026)", () => {
    expect(planoDeMensagens("mensagem", false)).toEqual([]);
  });

  it("modo grupo: a roleta não manda nada, com ou sem repasse", () => {
    expect(planoDeMensagens("grupo", true)).toEqual([]);
    expect(planoDeMensagens("grupo", false)).toEqual([]);
  });
});

/**
 * A roleta toca banco e WhatsApp, então a regra que não pode regredir em
 * silêncio é guardada lendo o código (padrão do projeto, ver
 * campanhaDoCorretorSemIA.test.ts).
 */
const codigo = readFileSync(join(process.cwd(), "src/lib/whatsapp/roletaDosAnuncios.ts"), "utf8").replace(
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
  "",
);

describe("roletaDosAnuncios.ts", () => {
  it("passarAFicha devolve se a ficha mudou, e o repasse só segue se mudou", () => {
    expect(codigo).toMatch(/async function passarAFicha\([\s\S]*?\): Promise<boolean>/);
    expect(codigo).toMatch(/\.select\("id"\)/);
    expect(codigo).toMatch(/const trocou = await passarAFicha\([\s\S]*?if \(!trocou\) return null;/);
  });

  it("o aviso do grupo é enfileirado depois de a ficha trocar de dono", () => {
    const troca = codigo.indexOf("passarAFicha(supabase");
    const aviso = codigo.indexOf('rpc("enfileirar_aviso_do_lead"');
    expect(troca).toBeGreaterThan(-1);
    expect(aviso).toBeGreaterThan(troca);
  });

  it("pede ao banco o escolhido conforme o modo", () => {
    expect(codigo).toContain("p_modo: modo");
  });

  it("modo grupo não procura o WhatsApp do escolhido nem manda abertura", () => {
    expect(codigo).toContain('modo === "grupo"');
    const grupo = codigo.indexOf('modo === "grupo"');
    const instancia = codigo.indexOf('from("corretor_whatsapp_instancias")');
    expect(instancia).toBeGreaterThan(grupo);
  });

  it("sem repasse, o número do dono não manda nada ao cliente", () => {
    expect(codigo).not.toContain("BOAS_VINDAS_DE_CAMPANHA");
    expect(codigo).not.toMatch(/boasVindas/i);
  });

  it("lerModoDaRoleta existe e cai em desligada", () => {
    expect(codigo).toMatch(/export async function lerModoDaRoleta\(corretorId: string\): Promise<ModoDaRoleta>/);
    expect(codigo).toContain('"desligada"');
  });

  it("usa o modo que o webhook já leu, sem ler de novo", () => {
    expect(codigo).toMatch(/modo\?: ModoDaRoleta/);
    expect(codigo).toContain("params.modo ?? (await lerModoDaRoleta(params.corretorId))");
  });
});
