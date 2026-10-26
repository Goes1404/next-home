import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { site as siteDaCasa } from "@/lib/site";
import { normalizarHost } from "@/lib/sites/endereco";
import { metadadosDoSite, metadadosSemSite } from "@/lib/sites/metadados";
import { type ParamsDoSite } from "@/lib/sites/pagina";
import { resolverSite } from "@/lib/sites/resolver";
import { CSS_DO_ESCURO_FIXO, cssDasCoresDoSite, scriptDoTemaFixo, temaFixoDoSite } from "@/lib/sites/coresDoSite";

/**
 * O site público de cada grupo, pelo endereço (fase 3, 20/10/2026).
 *
 * O `proxy.ts` reescreve toda página pública para `/s/<host>/<caminho>`;
 * aqui o host vira o grupo (`siteDaPagina`, com cache por host). Endereço
 * que não é de nenhum grupo — ou de grupo encerrado — dá 404 com a página
 * neutra (`src/app/not-found.tsx`), nunca o site da Next Home.
 *
 * Por que o host no CAMINHO, e não `headers()` em cada página: com o host no
 * caminho o cache de rota (ISR) já sai separado por site, e as páginas
 * continuam estáticas. Com `headers()`, toda página pública voltaria a ser
 * dinâmica — exatamente o que a F2b desfez (12/10/2026). Medido em
 * docs/superpowers/plans/2026-10-20-fase-3-site-por-endereco.md.
 *
 * O endereço canônico da Next Home é prerenderizado no build, como antes;
 * os demais endereços nascem na primeira visita e ficam no cache.
 */
export function generateStaticParams(): ParamsDoSite[] {
  const host = normalizarHost(urlHost(siteDaCasa.url));
  return host ? [{ site: host }] : [];
}

function urlHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<ParamsDoSite> }): Promise<Metadata> {
  const site = await resolverSite(decodeURIComponent((await params).site));
  return site ? metadadosDoSite(site.marca) : metadadosSemSite();
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<ParamsDoSite>;
}) {
  // Endereço de nenhum grupo NÃO lança aqui: um `notFound()` de layout só
  // é pego pela fronteira do segmento PAI, e o 404 saía com o HTML vazio
  // (medido em `next start`, 20/10/2026). Quem lança é o layout do grupo de
  // rotas e a página, logo abaixo (`siteDaPagina`), e o 404 cai em
  // `./not-found.tsx`, inteiro no HTML do servidor. Sem site, sem rodapé.
  const site = await resolverSite(decodeURIComponent((await params).site));
  // As cores que a imobiliária escolheu em "Meu site" (0209 e 0210) viram
  // variáveis CSS em `:root`: o acento e a escala da marca, a segunda cor e,
  // com fundo e texto escolhidos, os papéis de superfície e de texto nos dois
  // temas (e o seletor claro/escuro some). Com cores do modo escuro (0212),
  // cada tema leva as suas e o seletor fica. Em `:root`, e não num envoltório,
  // porque o fundo pinta o `<body>` e o menu do celular é um portal. SEMPRE
  // nulo na Next Home (a marca dela vem zerada): nenhuma tag a mais no HTML.
  const marca = site?.marca;
  const cores = marca && !marca.ehNextHome
    ? {
        principal: marca.cor,
        secundaria: marca.corSecundaria,
        fundo: marca.corFundo,
        texto: marca.corTexto,
        escuro: {
          principal: marca.corEscuro,
          secundaria: marca.corSecundariaEscuro,
          fundo: marca.corFundoEscuro,
          texto: marca.corTextoEscuro,
        },
      }
    : null;
  const css = cores ? cssDasCoresDoSite(cores) : null;
  // Fundo fixo escuro: o `<html>` vai para o tema escuro antes da pintura,
  // senão as superfícies do claro (vidro, faixas) pintam por cima das cores
  // do grupo — o "no celular está tudo feio" da Aretz (26/10/2026).
  const temaFixo = cores ? temaFixoDoSite(cores) : null;
  const conteudo = (
    <>
      {children}
      {site && <Footer marca={site.marca} />}
    </>
  );
  // Movimento mais curto nos sites dos outros grupos (pedido da Aretz,
  // 26/10/2026: "deixe o site mais rápido, as transições"). A Next Home
  // segue byte a byte igual: nenhuma tag a mais no HTML dela.
  const movimento = marca && !marca.ehNextHome ? CSS_DO_MOVIMENTO_RAPIDO : null;
  if (!css && !movimento) return conteudo;
  return (
    <>
      {/* Só hex calculado em `cssDasCoresDoSite`: nada digitado chega aqui. */}
      {temaFixo && <script dangerouslySetInnerHTML={{ __html: scriptDoTemaFixo(temaFixo) }} />}
      {temaFixo && <style dangerouslySetInnerHTML={{ __html: CSS_DO_ESCURO_FIXO }} />}
      {css && <style dangerouslySetInnerHTML={{ __html: css }} />}
      {movimento && <style dangerouslySetInnerHTML={{ __html: movimento }} />}
      {conteudo}
    </>
  );
}

/**
 * O movimento curto dos sites de outros grupos: as mesmas animações da casa,
 * em menos tempo. Fora de `@layer` (como as cores), vence as regras do
 * `globals.css` sem `!important` — e o `!important` do movimento reduzido,
 * que está em camada, continua vencendo este.
 *
 * - A onda entre páginas passa em 360 ms (era 640 ms), com as cores do grupo.
 * - A página nova entra em 220 ms (era 380 ms), mantendo a cascata curta.
 * - A travessia home → catálogo (`nav-forward`) leva 240 ms, sem atraso.
 * - `--ritmo-do-movimento` encurta as entradas do GSAP para 60% do tempo
 *   (`Reveal`, `TituloEditorial`, via `ritmoDoMovimento`).
 */
const CSS_DO_MOVIMENTO_RAPIDO =
  ":root{--ritmo-do-movimento:0.6}" +
  ".onda-transicao{animation-duration:360ms}" +
  ":root[data-entrando] main>*{animation-duration:220ms}" +
  "::view-transition-old(.nav-forward),::view-transition-new(.nav-forward){animation-duration:240ms;animation-delay:0s}";
