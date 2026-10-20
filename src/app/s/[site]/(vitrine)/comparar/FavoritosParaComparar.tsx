"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { alternarFavorito, TETO_COMPARAR } from "@/lib/favoritos";
import { useFavoritos } from "@/components/empreendimento/BotaoFavorito";

/**
 * Sem `?imoveis=` na URL, a comparação vem dos favoritos deste aparelho.
 * Mostra a lista para escolher; o servidor não sabe o que está salvo aqui.
 */
export function FavoritosParaComparar({
  selecionados,
  nomes,
}: {
  selecionados: string[];
  nomes: Record<string, string>;
}) {
  const favoritos = useFavoritos();
  const router = useRouter();
  if (favoritos.length === 0) {
    return (
      <p className="text-fluid-sm text-apoio">
        Toque no coração dos imóveis para salvar e comparar até {TETO_COMPARAR} lado a lado.{" "}
        <Link href="/empreendimentos" className="text-acento underline underline-offset-4">
          Ver imóveis
        </Link>
      </p>
    );
  }
  const alternar = (slug: string) => {
    const proximos = selecionados.includes(slug)
      ? selecionados.filter((s) => s !== slug)
      : [...selecionados, slug].slice(-TETO_COMPARAR);
    router.replace(proximos.length ? `/comparar?imoveis=${proximos.join(",")}` : "/comparar", { scroll: false });
  };
  return (
    <div>
      <p className="text-fluid-xs text-apoio">Seus favoritos (escolha até {TETO_COMPARAR}):</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {favoritos.map((slug) => {
          const ativo = selecionados.includes(slug);
          return (
            <li key={slug} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => alternar(slug)}
                aria-pressed={ativo}
                className={`min-h-11 rounded-full border px-4 text-sm ${
                  ativo ? "border-acento bg-acento text-sobre-cor" : "border-linha-forte bg-elevado text-titulo"
                }`}
              >
                {nomes[slug] ?? slug}
              </button>
              <button
                type="button"
                onClick={() => alternarFavorito(slug)}
                aria-label={`Tirar ${nomes[slug] ?? slug} dos favoritos`}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-tenue hover:text-titulo"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
