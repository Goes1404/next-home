import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EtiquetaEtapa } from "./_componentes/CartaoLead";
import { OficinaDeMarketing } from "./marketing/OficinaDeMarketing";

/**
 * O que é de imóvel some (ou muda de palavra) nos outros ramos, e a
 * imobiliária continua letra por letra (30/10/2026, revisão do painel).
 */
const ler = (caminho: string) => readFileSync(`src/app/corretor/(painel)/${caminho}`, "utf8");

const oficina = (ramo: "imobiliaria" | "seguros") =>
  renderToStaticMarkup(
    <OficinaDeMarketing
      artesFeitas={0}
      artesHoje={{ usadas: 0, teto: 5 }}
      ultimasArtes={[]}
      imoveisProntos={0}
      imoveisTotal={0}
      linkDeIndicacao="https://exemplo.app/c/ana"
      temSlug
      imoveisParaCarrossel={[]}
      videosDisponiveis={2}
      videosNoMes={4}
      ramo={ramo}
    />,
  );

describe("o ramo nas telas do painel", () => {
  it("marketing: vídeo, carrossel e link do site de imóveis só na imobiliária", () => {
    const imob = oficina("imobiliaria");
    for (const texto of ["Criar vídeo", "Carrossel do Instagram", "Seu link de indicação", "ficha real do imóvel"]) expect(imob).toContain(texto);
    const seguros = oficina("seguros");
    for (const texto of ["Criar vídeo", "Carrossel do Instagram", "Seu link de indicação", "imóve"]) expect(seguros).not.toContain(texto);
    expect(seguros).toContain("Criar arte");
    expect(seguros).toContain("Disparar campanha");
  });

  it("a etiqueta da etapa fala o compromisso do ramo; sem ramo, a de sempre", () => {
    expect(renderToStaticMarkup(<EtiquetaEtapa etapa="visita_agendada" />)).toContain("Visita marcada");
    expect(renderToStaticMarkup(<EtiquetaEtapa etapa="visita_agendada" ramo="imobiliaria" />)).toContain("Visita marcada");
    expect(renderToStaticMarkup(<EtiquetaEtapa etapa="visita_agendada" ramo="advocacia" />)).not.toContain("Visita");
  });

  it("ficha do lead: pedido do site e atalho do consultor só com imóveis", () => {
    const ficha = ler("leads/[id]/page.tsx");
    expect(ficha).toContain("{comImoveis && <PedidoDoSite");
    expect(ficha).toContain("{comImoveis && <AtalhoDoConsultor");
    expect(ficha).toMatch(/comImoveis \? supabase\.from\("empreendimentos"\)/);
  });

  it("o consultor (imóveis + crédito imobiliário) some fora do ramo com catálogo: bolha, tela, action e atalho do chat", () => {
    expect(ler("layout.tsx")).toContain('{temModulo(ramo, "catalogoDeImoveis") && <BalaoConsultor />}');
    expect(ler("consultor/page.tsx")).toMatch(/if \(!temModulo\(corretor\.ramo, "catalogoDeImoveis"\)\) notFound\(\)/);
    expect(ler("consultor/acoes.ts")).toContain('temModulo(corretor.ramo, "catalogoDeImoveis")');
    expect(ler("conversas/Chat.tsx")).toContain("{comConsultor && ultimaDoCliente && (");
  });

  it("lista vazia sem catálogo aponta para a importação, que existe", () => {
    expect(ler("leads/ListaLeads.tsx")).toContain('href="/corretor/importar"');
    expect(readFileSync("src/app/corretor/(painel)/importar/page.tsx", "utf8").length).toBeGreaterThan(0);
  });

  it("portais de imóveis: as duas actions recusam fora da imobiliária", () => {
    const acoes = ler("admin/portais/acoes.ts");
    expect(acoes.match(/if \(!recursosDeImoveis\(guarda\.corretor\.ramo\)\) return \{ erro: SEM_PORTAIS \};/g)).toHaveLength(2);
  });

  it("leads que combinam: os dossiês são só dos leads lidos", () => {
    const fonte = ler("imoveis/_componentes/lerLeadsQueCombinam.ts");
    expect(fonte).toMatch(/from\("lead_observacoes_ia"\)[\s\S]*?\.in\("lead_id", lote\)/);
    expect(fonte).not.toContain(".limit(2000)");
  });
});
