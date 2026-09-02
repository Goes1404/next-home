import { Esqueleto, AvisoDeCarregamento } from "./Esqueleto";

/**
 * A espera das telas de lista — leads, conversas, campanhas, imóveis.
 *
 * Todas têm a mesma anatomia: título, uma fileira de abas, filtros e uma
 * pilha de linhas com a régua de etapa à esquerda. O esqueleto repete essa
 * forma para que o conteúdo não empurre nada ao chegar.
 */
export function EsqueletoDeLista({
  linhas = 6,
  abas = 0,
  titulo = "Carregando…",
}: {
  linhas?: number;
  abas?: number;
  titulo?: string;
}) {
  return (
    <div className="space-y-6">
      <AvisoDeCarregamento>{titulo}</AvisoDeCarregamento>
      <Esqueleto className="h-8 w-44" />

      {abas > 0 && (
        <div className="border-linha flex gap-2 rounded-full border p-1">
          {Array.from({ length: abas }, (_, i) => (
            <Esqueleto key={i} className="h-9 flex-1 rounded-full" />
          ))}
        </div>
      )}

      <div className="border-linha bg-superficie shadow-painel divide-linha divide-y rounded-2xl border">
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <Esqueleto className="h-11 w-1 shrink-0 rounded-r-full" />
            <div className="min-w-0 flex-1 space-y-2">
              {/* Larguras diferentes por linha: uma pilha de barras idênticas
                  parece uma tabela vazia, não uma lista chegando. */}
              <Esqueleto className={i % 3 === 0 ? "h-4 w-48" : i % 3 === 1 ? "h-4 w-36" : "h-4 w-56"} />
              <Esqueleto className="h-3 w-28" />
            </div>
            <Esqueleto className="h-9 w-9 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
