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
        <img
          src={PIXEL_VAZIO}
          alt=""
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </picture>
      <div className="absolute inset-0 bg-fundo/60" />
    </div>
  );
}
