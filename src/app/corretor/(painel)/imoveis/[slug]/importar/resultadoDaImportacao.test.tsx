import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...resto }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...resto}>
      {children}
    </a>
  ),
}));

import { ResultadoDaImportacao, tituloDoResultado } from "./ResultadoDaImportacao";

/**
 * Pedido de 25/09: retorno visual explícito quando a inserção dá certo. Antes
 * era uma linha miúda embaixo do botão, fácil de perder depois de um envio
 * de um minuto.
 */

describe("o título diz o desfecho", () => {
  it("tudo entrou", () => {
    expect(tituloDoResultado({ entraram: 3, falharam: 0, linhas: [] })).toBe("Pronto! 3 itens entraram no imóvel.");
    expect(tituloDoResultado({ entraram: 1, falharam: 0, linhas: [] })).toBe("Pronto! 1 item entrou no imóvel.");
  });

  it("parte ficou de fora", () => {
    expect(tituloDoResultado({ entraram: 2, falharam: 1, linhas: [] })).toMatch(/2 itens entraram.*1 ficou de fora/);
  });

  it("nada entrou por erro não se passa por sucesso", () => {
    expect(tituloDoResultado({ entraram: 0, falharam: 2, linhas: [] })).toMatch(/^Nada entrou/);
  });

  it("só duplicadas: nada novo, e sem acusar erro", () => {
    expect(tituloDoResultado({ entraram: 0, falharam: 0, linhas: [] })).toMatch(/já estava no imóvel/);
  });
});

describe("o cartão", () => {
  const html = (entraram: number, falharam: number) =>
    renderToStaticMarkup(<ResultadoDaImportacao resultado={{ entraram, falharam, linhas: ["3 fotos adicionadas."] }} slug="viva" />);

  it("sucesso leva ao imóvel", () => {
    const saida = html(3, 0);
    expect(saida).toContain('data-tom="ok"');
    expect(saida).toContain('href="/corretor/imoveis/viva"');
    expect(saida).toContain("3 fotos adicionadas.");
  });

  it("sem nada novo não oferece o link", () => {
    expect(html(0, 0)).not.toContain("/corretor/imoveis/viva");
  });

  it("parcial tem outra cor", () => {
    expect(html(2, 1)).toContain('data-tom="parcial"');
  });
});

describe("as três abas mostram o cartão e o aviso", () => {
  for (const arquivo of ["OrigemSite.tsx", "OrigemPdf.tsx", "OrigemDrive.tsx"]) {
    it(arquivo, () => {
      const codigo = readFileSync(join(__dirname, arquivo), "utf8");
      expect(codigo).toMatch(/<ResultadoDaImportacao resultado=/);
      expect(codigo).toMatch(/avisar\(tituloDoResultado\(final\)/);
    });
  }
});
