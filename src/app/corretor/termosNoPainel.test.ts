/**
 * O aceite dos termos no primeiro acesso ao painel (fase 2D, 0198).
 *
 * O layout do `(painel)` manda para `/corretor/termos` quem não aceitou a
 * versão vigente. Três coisas falhariam caladas e por isso são cobradas
 * aqui, lendo o código:
 *
 * - a página dos termos FORA do `(painel)` (dentro dele, o próprio layout a
 *   redirecionaria para ela mesma: loop);
 * - "Sair" na própria página dos termos (quem não quer aceitar precisa
 *   conseguir sair);
 * - as rotas de entrar, recuperar e criar senha continuam fora do `(painel)`
 *   (o convite e o "esqueci a senha" chegam antes de qualquer aceite).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const raiz = join(process.cwd(), "src", "app", "corretor");
const semComentarios = (s: string) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const ler = (...partes: string[]) => semComentarios(readFileSync(join(raiz, ...partes), "utf8"));

describe("o aceite dos termos no painel", () => {
  it("o layout do painel redireciona para os termos quem não aceitou a versão vigente", () => {
    const layout = ler("(painel)", "layout.tsx");
    expect(layout).toMatch(/aceitouTermosVigentes\(/);
    expect(layout).toMatch(/redirect\("\/corretor\/termos"\)/);
    // Só com sessão: sem corretor o layout mostra a conta sem vínculo.
    const pergunta = layout.indexOf("aceitouTermosVigentes(");
    expect(layout.slice(Math.max(0, pergunta - 200), pergunta)).toMatch(/corretor/);
  });

  it("a página dos termos mora fora do (painel), e as rotas de senha e link também", () => {
    expect(existsSync(join(raiz, "termos", "page.tsx"))).toBe(true);
    expect(existsSync(join(raiz, "(painel)", "termos"))).toBe(false);
    for (const rota of ["entrar", "esqueci-a-senha", "definir-senha"]) {
      expect(existsSync(join(raiz, rota)), rota).toBe(true);
      expect(existsSync(join(raiz, "(painel)", rota)), rota).toBe(false);
    }
  });

  it("a página dos termos tem Sair e a ação grava o aceite pela sessão", () => {
    const pagina = ler("termos", "page.tsx");
    expect(pagina).toMatch(/action=\{sair\}/);
    const acoes = ler("termos", "acoes.ts");
    expect(acoes).toMatch(/from\("aceites_de_termos"\)[\s\S]*?\.insert\(/);
    expect(acoes).toContain("VERSAO_DOS_TERMOS");
    expect(acoes).not.toContain("createServiceClient");
    expect(acoes).toMatch(/caminhoDepoisDoAceite\(/);
  });

  it("conectar o WhatsApp também pede o aceite (o risco do número é do corretor)", () => {
    const acoes = semComentarios(
      readFileSync(join(raiz, "(painel)", "whatsapp", "acoes.ts"), "utf8"),
    );
    const inicio = acoes.indexOf("export async function conectarWhatsapp(");
    const corpo = acoes.slice(inicio, acoes.indexOf("\nexport ", inicio + 10));
    const aceite = corpo.indexOf("aceitouTermosVigentes(");
    expect(aceite).toBeGreaterThan(-1);
    expect(corpo.indexOf("obterQrCodeInstancia(")).toBeGreaterThan(aceite);
  });
});
