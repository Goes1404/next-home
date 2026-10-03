import { FUNDO_DESKTOP_URL } from "@/lib/site";

/** GIF transparente de 1x1: o `<img>` do celular não baixa nada. */
const PIXEL_VAZIO = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/**
 * Fundo da casa no computador (03/10/2026): a foto da avenida entre torres,
 * no lugar do vídeo que aparecia ali.
 *
 * É um `<picture>` com `media` e não um `<img className="hidden md:block">`
 * porque `display: none` NÃO impede o download: o celular baixaria 149 KB de
 * uma foto que nunca mostra, além da peça vertical que é o fundo dele.
 *
 * O véu é da própria foto, não do layout: o céu claro e o vidro espelhado
 * ficam atrás do título do herói, e sem ele o texto escuro do tema claro (e o
 * claro do escuro) perde contraste nas torres. `bg-fundo` acompanha o tema.
 */
export function FundoDaCasaDesktop() {
  return (
    <div aria-hidden className="absolute inset-0 hidden md:block">
      <picture>
        <source media="(min-width: 768px)" srcSet={FUNDO_DESKTOP_URL} type="image/webp" />
        {/* 130% de altura, sobrando 15% em cima e embaixo: é a folga (e 3% de cada lado) que o
            parallax (rolagem em `ParallaxFundoHome`, ponteiro em
            `ProfundidadeDoPonteiro`) percorre sem nunca mostrar a borda. */}
        <img
          src={PIXEL_VAZIO}
          alt=""
          decoding="async"
          data-fundo-camada
          className="absolute -left-[3%] -top-[15%] h-[130%] w-[106%] max-w-none object-cover will-change-transform"
        />
      </picture>
      <div className="absolute inset-0 bg-fundo/60" />
    </div>
  );
}
