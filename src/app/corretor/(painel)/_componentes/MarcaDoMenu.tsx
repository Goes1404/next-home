import { cn } from "@/lib/utils";
import type { MarcaDoMenu as Marca } from "./contadoresDoMenu";

/**
 * O número (ou o ponto de "número no ar") ao lado de um item do menu.
 *
 * Pílula de acento com texto `sobre-cor`: contraste garantido nos dois
 * temas. Quando o item está ativo (fundo já sólido na cor do acento), a
 * pílula inverte para não sumir no fundo.
 */
export function MarcaDoMenu({ marca, sobreSolido = false }: { marca?: Marca; sobreSolido?: boolean }) {
  if (!marca) return null;
  if (marca.numero !== undefined) {
    return (
      <span
        className={cn(
          "ml-auto inline-flex min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] leading-5 font-semibold tabular-nums",
          sobreSolido ? "bg-sobre-cor text-acento" : "bg-acento text-sobre-cor",
        )}
      >
        {marca.numero > 99 ? "99+" : marca.numero}
        <span className="sr-only"> pendentes</span>
      </span>
    );
  }
  if (marca.ponto) {
    return (
      <span className="ml-auto inline-flex shrink-0 items-center">
        <span
          aria-hidden
          className={cn(
            "size-2 rounded-full ring-2",
            marca.ponto === "ok" ? "bg-ok ring-ok-linha" : "bg-perigo ring-perigo-linha",
          )}
        />
        <span className="sr-only">{marca.ponto === "ok" ? "Número conectado" : "Número desconectado"}</span>
      </span>
    );
  }
  return null;
}

/**
 * O tópico FECHADO não mostra os subtópicos, e o número some com eles. Um
 * ponto no tópico diz "tem coisa esperando aqui dentro" sem abrir a pasta.
 * Só número conta: o ponto verde de "conectado" não é pendência.
 */
export function temPendencia(hrefs: string[], marcas: Record<string, Marca>): boolean {
  return hrefs.some((h) => (marcas[h]?.numero ?? 0) > 0);
}
