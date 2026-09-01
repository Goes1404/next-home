import { NextResponse } from "next/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getEmpreendimentoDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { montarCarrossel } from "@/lib/social/carrossel";
import { renderizarSlide } from "@/lib/social/renderizarSlide";
import { linkDeIndicacao } from "@/lib/social/linkDeIndicacao";

/**
 * Um slide do carrossel, em PNG.
 *
 * Rota de imagem em vez de download em lote: no celular — que é onde o
 * corretor posta — salvar imagem pela galeria é o gesto natural, e um .zip
 * é justamente o que o Android e o iOS tratam pior. Cada slide vira um
 * `<img>` que ele segura e salva.
 *
 * A sessão é conferida aqui, e não só no proxy: rota de imagem é endpoint
 * HTTP como qualquer outro, e o catálogo do painel enxerga rascunho.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string; indice: string }> },
) {
  const corretor = await getCorretorLogado();
  if (!corretor) return new NextResponse("Sessão expirada.", { status: 401 });

  const { slug, indice } = await ctx.params;
  const imovel = await getEmpreendimentoDoPainel(slug);
  if (!imovel) return new NextResponse("Imóvel não encontrado.", { status: 404 });

  const slides = montarCarrossel({
    imovel,
    linkDaChamada: linkDeIndicacao(corretor.slug),
  });

  const n = Number(indice);
  const slide = slides[n];
  if (!slide) return new NextResponse("Slide não existe.", { status: 404 });

  /*
   * A foto é baixada AQUI e passada pronta ao renderizador: rede e binário
   * nativo separados, para um erro de download não parecer erro de
   * decodificação. Falha na foto vira slide sem foto, não erro na tela.
   */
  let foto: Buffer | null = null;
  if (slide.foto?.url) {
    try {
      const r = await fetch(slide.foto.url);
      if (r.ok) foto = Buffer.from(await r.arrayBuffer());
    } catch (e) {
      console.error("[carrossel] falha ao baixar a foto:", e);
    }
  }

  try {
    const png = await renderizarSlide({ slide, indice: n, total: slides.length, fotoBaixada: foto });
    return new NextResponse(new Uint8Array(png), {
      headers: {
        "Content-Type": "image/png",
        // Nome de arquivo com a ordem: salvo na galeria, o carrossel
        // continua na sequência certa na hora de postar.
        "Content-Disposition": `inline; filename="${slug}-${String(n + 1).padStart(2, "0")}.png"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    console.error("[carrossel] falha ao renderizar:", e);
    return new NextResponse("Não foi possível gerar a imagem.", { status: 500 });
  }
}
