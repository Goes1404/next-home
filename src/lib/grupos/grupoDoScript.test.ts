import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GRUPO_NEXT_HOME_ID } from "./grupo";
import { grupoDoScript } from "./grupoDoScript";

describe("grupoDoScript", () => {
  it("script sem --grupo recusa rodar", () => {
    expect(() => grupoDoScript(["lista.json"])).toThrow(/--grupo=/);
    expect(() => grupoDoScript(["--grupo="])).toThrow(/--grupo=/);
  });

  it("na fase 1 só aceita o grupo da Next Home", () => {
    expect(() => grupoDoScript(["--grupo=00000000-0000-0000-0000-000000000002"])).toThrow(/fase 1/);
  });

  it("devolve o grupo e os outros argumentos, na ordem", () => {
    expect(grupoDoScript(["lista.json", `--grupo=${GRUPO_NEXT_HOME_ID}`, "--seco"])).toEqual({
      grupoId: GRUPO_NEXT_HOME_ID,
      resto: ["lista.json", "--seco"],
    });
  });

  // Os scripts de catálogo gravam pela chave de serviço: cada um pede o
  // grupo e filtra o imóvel por ele, e o workflow que os roda passa a opção.
  it("todo script de catálogo pede o grupo e o workflow o passa", () => {
    const pasta = join(process.cwd(), "scripts/catalogo");
    const scripts = readdirSync(pasta).filter((a) => a.endsWith(".ts"));
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      const codigo = readFileSync(join(pasta, script), "utf8");
      expect(codigo, script).toMatch(/grupoDoScript\(/);
      expect(codigo, script).toMatch(/\.eq\("grupo_id", grupoId\)/);
    }
    const workflows = join(process.cwd(), ".github/workflows");
    for (const arquivo of readdirSync(workflows)) {
      const yml = readFileSync(join(workflows, arquivo), "utf8");
      for (const linha of yml.split("\n").filter((l) => /scripts\/catalogo\/\w+\.ts/.test(l) && /\btsx\b/.test(l))) {
        expect(linha, `${arquivo}: ${linha.trim()}`).toContain(`--grupo=${GRUPO_NEXT_HOME_ID}`);
      }
    }
  });
});
