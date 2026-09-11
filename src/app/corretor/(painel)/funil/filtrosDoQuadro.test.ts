import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const arquivo = path.join(__dirname, "Quadro.tsx");
const codigo = fs.readFileSync(arquivo, "utf8");

describe("filtros do quadro do funil", () => {
  it("oferece recortes operacionais e combina os filtros", () => {
    expect(codigo).toContain('value="parados"');
    expect(codigo).toContain('value="sem_retorno"');
    expect(codigo).toContain('value="com_visita"');
    expect(codigo).toContain("chaveDaOrigem(lead) !== origem");
    expect(codigo).toContain("lead.tentativasSemResposta > 0");
  });

  it("mantém responsável restrito à visão do gestor", () => {
    expect(codigo).toMatch(/\{mostrarDono && \(\s*<label[^>]*>[\s\S]*?Responsável/);
  });

  it("tem alvos de toque seguros e uma saída clara", () => {
    expect(codigo).toContain("min-h-11");
    expect(codigo).toContain("Nenhum lead combina com esses filtros");
    expect(codigo).toContain("limparFiltros");
  });
});
