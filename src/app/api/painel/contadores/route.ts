import { getContadoresDoMenu, getCorretorLogado } from "@/lib/corretorSessao";

/**
 * Os contadores do menu do painel. O menu pede a cada troca de tela, em vez
 * de o LAYOUT calcular: layout não re-executa entre rotas irmãs, e um "3 sem
 * revisão" que não diminui depois de revisar ensina a ignorar o número.
 *
 * `no-store` pelo mesmo motivo: número cacheado é número velho. Sem sessão
 * de corretor devolve 401 e o menu simplesmente não mostra nada.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const corretor = await getCorretorLogado();
  if (!corretor) {
    return new Response(null, { status: 401, headers: { "cache-control": "no-store" } });
  }
  const contadores = await getContadoresDoMenu(corretor.id);
  return Response.json(contadores, { headers: { "cache-control": "no-store, max-age=0" } });
}
