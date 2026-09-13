import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O hero da página do imóvel sai no stream ANTES das seções (13/09/2026).
 *
 * O `h1` é o LCP desta página, e ele só era revelado depois do documento
 * inteiro — 6 a 9 s no celular em rede lenta. A correção tem três partes que
 * falham CALADAS se alguém as desfizer: a página continua funcionando, só
 * volta a demorar. Por isso a guarda lê o código:
 *
 * 1. as seções vivem num `<Suspense>` próprio, e o hero fica fora dele;
 * 2. o componente das seções cede a vez ao stream antes de renderizar
 *    (`cederAoStream`) — sem isso o boundary termina na mesma passada e o
 *    React o emite junto com o resto;
 * 3. o Lightbox entra por `LightboxAdiado`, não pelo módulo direto — o
 *    módulo direto arrasta os plugins do GSAP para o primeiro carregamento.
 */

const RAIZ = join(__dirname, "..", "..", "..", "..", "..");

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function ler(rel: string): string {
  return semComentarios(readFileSync(join(RAIZ, "src", rel), "utf8"));
}

describe("o hero da página do imóvel sai no stream antes das seções", () => {
  const pagina = ler("app/(vitrine)/empreendimentos/[slug]/page.tsx");
  const secoes = ler("app/(vitrine)/empreendimentos/[slug]/SecoesDoImovel.tsx");

  it("o hero fica fora do Suspense e as seções dentro", () => {
    const hero = pagina.indexOf("<Hero ");
    const abre = pagina.indexOf("<Suspense");
    const fecha = pagina.indexOf("</Suspense>");
    const dentro = pagina.indexOf("<SecoesDoImovel");
    expect(hero).toBeGreaterThan(-1);
    expect(abre).toBeGreaterThan(hero);
    expect(dentro).toBeGreaterThan(abre);
    expect(fecha).toBeGreaterThan(dentro);
  });

  it("a página não monta seção nenhuma por conta própria", () => {
    for (const secao of ["<Galeria", "<Sobre", "<Tipologias", "<Lazer", "<Contato", "<Similares"]) {
      expect(pagina, `${secao} deve morar em SecoesDoImovel`).not.toContain(secao);
    }
  });

  it("as seções cedem a vez ao stream antes de renderizar", () => {
    expect(secoes).toMatch(/export async function SecoesDoImovel/);
    const cede = secoes.indexOf("await cederAoStream()");
    const jsx = secoes.indexOf("<FichaNumeros");
    expect(cede).toBeGreaterThan(-1);
    expect(jsx).toBeGreaterThan(cede);
  });

  it("o cliente recebe o que lê, não o cadastro inteiro", () => {
    expect(secoes).toContain("cenas={cenasDoShowcase(e)}");
    expect(secoes).toContain("fotosDosItens={[...fotosDoLazer(e.lazer, e.galeria)]}");
    expect(ler("components/empreendimento/Lazer.tsx")).not.toContain("fotosDoLazer(");
    expect(ler("components/empreendimento/CenaShowcase.tsx")).not.toContain("Empreendimento");
  });

  it("o Lightbox entra adiado nas seções que o abrem", () => {
    for (const rel of ["components/empreendimento/Galeria.tsx", "components/empreendimento/Tipologias.tsx"]) {
      const fonte = ler(rel);
      expect(fonte, rel).not.toContain('from "@/components/ui/Lightbox"');
      expect(fonte, rel).toContain("<LightboxAdiado");
    }
  });
});
