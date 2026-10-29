import { textoDaAstro, tituloDaAstro } from "@/lib/fontesDaAstro";

/**
 * As fontes da Astro valendo no DOCUMENTO inteiro do painel e da plataforma
 * (29/10/2026), e não só dentro do `<main>`.
 *
 * As classes do `next/font` definem `--font-astro-*` só no elemento que as
 * recebe. Gaveta, consultor, folhas e modais do painel moram num portal no
 * `<body>`, fora do `<main>`, e lá a variável não existiria — o título
 * cairia na fonte do site. Este `<style>` a declara no `:root`, e só nas
 * rotas cujo layout o renderiza (o site público não carrega as fontes).
 */
export function FontesDaAstroNoDocumento() {
  const css = `:root{--font-astro-titulo:${tituloDaAstro.style.fontFamily};--font-astro-texto:${textoDaAstro.style.fontFamily}}`;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
