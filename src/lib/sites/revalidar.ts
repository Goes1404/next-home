import { revalidatePath } from "next/cache";

/**
 * A rota de DESTINO de todo o site público (fase 3). O `proxy.ts` reescreve
 * `/empreendimentos/x` para `/s/<host>/empreendimentos/x`, e o cache de rota
 * é guardado pelo arquivo que renderiza — então `revalidatePath` precisa do
 * caminho de destino, não do que aparece na barra do navegador (doc do
 * Next 16, "Using revalidatePath with rewrites"). `revalidatePath("/empreendimentos/x")`
 * não acha mais rota nenhuma, e a ficha seguia com o preço antigo.
 *
 * O padrão com `[site]` e `"layout"` derruba todas as páginas públicas de
 * TODOS os endereços na próxima visita de cada uma. É o certo para o
 * catálogo: a home, a listagem, o mapa e a ficha mostram o mesmo imóvel, e
 * o painel não sabe por qual endereço o cliente vai abrir.
 */
export const ROTA_DO_SITE_PUBLICO = "/s/[site]";

/** Derruba o cache de rota de todas as páginas públicas, de todo endereço. */
export function revalidarSitePublico(): void {
  revalidatePath(ROTA_DO_SITE_PUBLICO, "layout");
}
