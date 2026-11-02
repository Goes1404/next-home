import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MOLDE_DA_AMOSTRA } from "./molde";
import { renderizarAmostra } from "./renderizar";

const OPCOES = { rastrear: true, whatsappDaAstro: "5511937696256", vendedor: "Eduardo" };
const LOJA = {
  nome: "Royal Cosméticos",
  slug: "royal-cosmeticos-barueri",
  modelo: "varejo",
  cidade: "Barueri",
  bairro: "Vila São João",
  endereco: "Av. Henriqueta Mendes Guerra, 322",
  amostra: { cores: { primaria: "#6B2FA3", profunda: "#4A1D78", tinta: "#2A1240" } },
};

describe("renderizarAmostra", () => {
  it("preenche todos os marcadores do molde", () => {
    const html = renderizarAmostra(LOJA, OPCOES);
    expect(html).not.toMatch(/\[\[[A-Z0-9]+\]\]/);
    expect(html).toContain("<title>Royal Cosméticos · Prévia de conceito</title>");
    expect(html).toContain('name="robots" content="noindex, nofollow"');
    expect(html).toContain("--magenta:#6B2FA3");
  });

  it("escapa o nome da loja e não deixa abrir tag pelo script", () => {
    const html = renderizarAmostra(
      { ...LOJA, nome: 'Loja <script>alert(1)</script> "x"', amostra: { novidades: [{ n: "<img src=x onerror=1>", c: "c", p: "1", b: ["tall", "#000000", "#000000", "#000000"], bg: "#ffffff", t: "t" }] } },
      OPCOES,
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("Loja &lt;script&gt;alert(1)&lt;/script&gt; &quot;x&quot;");
    expect(html).not.toContain("<img src=x");
  });

  it("recusa cor que não é hexadecimal e forma fora da lista", () => {
    const html = renderizarAmostra({ ...LOJA, amostra: { cores: { primaria: "red;}body{display:none" }, heroA: [["bomba", "#fff", "#fff", "#fff", 100]] } }, OPCOES);
    expect(html).not.toContain("red;}body");
    expect(html).toContain("--magenta:#D81B6A");
    expect(html).not.toContain('"bomba"');
  });

  it("só rastreia fora da prévia do painel", () => {
    expect(renderizarAmostra(LOJA, OPCOES)).toContain("/api/prospeccao/visita");
    expect(renderizarAmostra(LOJA, { ...OPCOES, rastrear: false })).not.toContain("/api/prospeccao/visita");
  });

  it("leva o botão do vendedor com a loja na mensagem", () => {
    const html = renderizarAmostra(LOJA, OPCOES);
    expect(html).toContain("https://wa.me/5511937696256?text=");
    expect(html).toContain("Conversar com o Eduardo");
  });

  it("muda os textos pelo modelo", () => {
    expect(renderizarAmostra({ ...LOJA, modelo: "alimentacao" }, OPCOES)).toContain("Cardápio do dia");
    expect(renderizarAmostra({ ...LOJA, modelo: "servicos" }, OPCOES)).toContain('id="servicos"');
    expect(renderizarAmostra({ ...LOJA, modelo: "desconhecido" }, OPCOES)).toContain("Vitrine da semana");
  });

  it("mostra o horário só quando a loja tem os sete dias", () => {
    expect(renderizarAmostra(LOJA, OPCOES)).not.toContain('class="hours"');
    const horario = ["9h às 18h", "9h às 18h", "9h às 18h", "9h às 18h", "9h às 18h", "9h às 14h", "Fechado"];
    expect(renderizarAmostra({ ...LOJA, amostra: { horario } }, OPCOES)).toContain("<li><span>Sábado</span><span>9h às 14h</span></li>");
  });
});

describe("molde.ts", () => {
  it("está igual ao molde.html (rode node scripts/prospeccao/gerarMolde.mjs)", () => {
    const html = readFileSync(join(__dirname, "molde.html"), "utf8");
    expect(MOLDE_DA_AMOSTRA).toBe(html);
  });
});
