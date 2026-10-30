import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * O painel carrega por rota só o que a rota usa — guarda de código-fonte
 * (F4 do roadmap de performance, 13/09/2026).
 *
 * As regressões aqui são todas caladas: um `import { Chat }` estático de
 * volta na gaveta de Pessoas, o `ChatBase` de volta na bolha do consultor
 * (que mora no layout, ou seja, em toda rota), um `getUser()` de volta no
 * helper de sessão — build, tipos e tela seguem verdes, e cada tela do
 * painel volta a pesar e a esperar o Auth.
 */

const RAIZ = join(__dirname, "..", "..", "..", "..");

function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function ler(rel: string): string {
  return semComentarios(readFileSync(join(RAIZ, "src", rel), "utf8"));
}

describe("o painel carrega por rota só o que a rota usa", () => {
  it("a gaveta de Pessoas carrega o Chat por next/dynamic, e o modelo do chat sem ele", () => {
    const gaveta = ler("app/corretor/(painel)/pessoas/GavetaConversa.tsx");
    expect(gaveta).toMatch(/dynamic\(\(\) => import\("\.\.\/conversas\/Chat"\)/);
    expect(gaveta).not.toMatch(/import \{[^}]*\bChat\b[^}]*\} from "\.\.\/conversas\/Chat"/);
    expect(gaveta).toContain('from "../conversas/chatModelo"');
    // O hook ao vivo também: importar um utilitário de `./Chat` arrasta o
    // componente inteiro para quem só queria o utilitário.
    expect(ler("app/corretor/(painel)/conversas/useConversaAoVivo.ts")).toContain('from "./chatModelo"');
  });

  it("a bolha do consultor (no layout) não carrega o chat até o toque", () => {
    const balao = ler("app/corretor/(painel)/BalaoConsultor.tsx");
    expect(balao).not.toContain("ChatBase");
    expect(balao).not.toContain("BlocosDaResposta");
    expect(balao).toMatch(/dynamic\(\(\) => import\("\.\/PainelDoConsultor"\)/);
  });

  it("a busca rápida (no cabeçalho, em toda rota) só baixa a paleta no primeiro uso", () => {
    const botao = ler("app/corretor/(painel)/_componentes/busca/BotaoBuscaRapida.tsx");
    expect(botao).toMatch(/dynamic\(\(\) => import\("\.\/PaletaDeBusca"\)/);
    expect(botao).not.toMatch(/from "\.\/PaletaDeBusca"/);
    // A paleta busca pela rota da sessão, sem o supabase-js no navegador.
    expect(ler("app/corretor/(painel)/_componentes/busca/PaletaDeBusca.tsx")).not.toMatch(/lib\/supabase/);
  });

  it("a sessão do painel é verificada localmente, não com uma ida ao Auth por página", () => {
    const sessao = ler("lib/corretorSessao.ts");
    expect(sessao).not.toContain("getUser(");
    expect(sessao).toContain("auth.getClaims()");
  });

  it("a contagem do funil é deduplicada na requisição", () => {
    expect(ler("lib/corretorSessao.ts")).toMatch(/export const getContagemPorEtapa = cache\(/);
  });

  it("trocar de seção não paga de novo o que acabou de ser lido (30/10/2026)", () => {
    // Voltar a uma seção visitada há menos de 30 s reusa a tela do roteador.
    expect(readFileSync(join(RAIZ, "next.config.ts"), "utf8")).toMatch(/staleTimes:\s*\{\s*dynamic:\s*30/);
    // Os contadores do menu esperam a navegação, em vez de disputar com ela.
    const contadores = ler("app/corretor/(painel)/_componentes/contadoresDoMenu.ts");
    expect(contadores).toMatch(/if \(rota\) agendar\(rota\)/);
    // Marketing só conta e lista nomes: não lê o catálogo com tipologias,
    // mídias e unidades.
    const marketing = ler("app/corretor/(painel)/marketing/page.tsx");
    expect(marketing).toContain("getCatalogoResumidoDoPainel()");
    expect(marketing).not.toContain("getEmpreendimentosDoPainel");
    // O catálogo completo é deduplicado na requisição.
    expect(ler("lib/imoveis/catalogoDoPainel.ts")).toMatch(/export const getEmpreendimentosDoPainel = cache\(/);
    // As faixas async do layout não seguram a casca do painel.
    const layout = ler("app/corretor/(painel)/layout.tsx");
    for (const faixa of ["FaixaConexao", "FaixaCotaDaIa", "FaixaLimitesDoPlano", "FaixaCobranca"]) {
      expect(layout, faixa).toMatch(new RegExp(`<Suspense fallback=\\{null\\}>\\s*<${faixa}\\b`));
    }
  });

  it("toda tela principal do painel tem loading.tsx", () => {
    for (const tela of ["", "pessoas", "leads", "funil", "conversas", "imoveis"]) {
      expect(existsSync(join(RAIZ, "src", "app", "corretor", "(painel)", tela, "loading.tsx")), tela || "início").toBe(true);
    }
  });
});
