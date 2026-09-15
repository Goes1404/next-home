import "server-only";
import { revalidateTag } from "next/cache";
import { TAG_CATALOGO, TAG_CORRETORES, TAG_CREDITO } from "./tags";

/**
 * Derruba o cache do site público quando o painel grava (F2 do roadmap de
 * performance). Chamar de TODA Server Action que escreva em
 * `empreendimentos`, `midias`, `tipologias`, `empreendimento_lazer`,
 * `corretores` (campos públicos) ou `parametros_credito`.
 *
 * `"max"` é o perfil de expiração: a próxima requisição recalcula e o
 * resultado velho não é servido nem como "stale". Para catálogo de imóveis
 * é o certo — o corretor que acabou de publicar um imóvel abre a vitrine
 * para conferir, e "stale-while-revalidate" mostraria a lista sem ele.
 *
 * Os `revalidatePath` que já existiam nas actions continuam: eles limpam o
 * cache de ROTA (o HTML/RSC), estas limpam o cache de DADO. Sem as duas, a
 * rota é recalculada com o dado velho.
 *
 * A guarda `cacheDoCatalogo.test.ts` lê as actions e cobra a chamada.
 */
export function revalidarCatalogo(): void {
  revalidateTag(TAG_CATALOGO, "max");
}

export function revalidarCorretores(): void {
  revalidateTag(TAG_CORRETORES, "max");
}

export function revalidarCredito(): void {
  revalidateTag(TAG_CREDITO, "max");
}
