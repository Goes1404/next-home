import "server-only";
import { revalidateTag } from "next/cache";
import { TAG_CATALOGO, TAG_CORRETORES, TAG_CREDITO } from "./tags";

/**
 * Derruba o cache do site público quando o painel grava (F2 do roadmap de
 * performance). Chamar de TODA Server Action que escreva em
 * `empreendimentos`, `midias`, `tipologias`, `empreendimento_lazer`,
 * `corretores` (campos públicos) ou `parametros_credito`.
 *
 * `"max"` marca o dado como velho (stale-while-revalidate, doc do Next 16):
 * a próxima leitura FORA de uma rota derrubada ainda recebe o velho e
 * recalcula ao fundo. Quem garante que a página que o corretor abre para
 * conferir venha fresca é o `revalidarSitePublico()` (`sites/revalidar.ts`):
 * ele expira na hora as etiquetas implícitas das páginas públicas, e o
 * `unstable_cache` lido dentro delas obedece a essas etiquetas.
 *
 * Desde a fase 3 o caminho precisa ser o de DESTINO (`/s/[site]`): o proxy
 * reescreve o site para `/s/<host>/...`, e `revalidatePath("/empreendimentos")`
 * não acha rota nenhuma. A guarda `revalidarSitePublico.test.ts` reprova
 * caminho público sem o prefixo.
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
