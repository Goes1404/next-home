import { NextResponse } from "next/server";
import { COOKIE_DE_INDICACAO, normalizarCodigoDeIndicacao, OPCOES_DO_COOKIE_DE_INDICACAO } from "@/lib/indicacoes/codigo";

export const dynamic = "force-dynamic";

/**
 * O link curto do "indique e ganhe" (0247, 29/10/2026): `/i/<codigo>`.
 *
 * Grava o cookie `astro_indicacao` por 30 dias e leva à página de vendas,
 * nos planos. Não consulta o banco: quem confere se o código existe é o
 * registro da indicação, quando a conta nasce (`registrarIndicacao`). Código
 * fora do formato não vira cookie, mas a pessoa chega à página do mesmo
 * jeito (link indicado nunca termina em erro).
 *
 * O cookie é lido no teste grátis (`src/lib/plataforma/testeGratis.ts`), e a
 * página de contratação também aceita `?indicacao=<codigo>`, que o
 * `proxy.ts` transforma no mesmo cookie. O "Fale com a Astro" (pedido sem
 * teste) precisa gravar o código no pedido: ver o cabeçalho da 0247.
 *
 * `/i` mora fora do site das imobiliárias (`FORA_DO_SITE`, `proxy.ts`):
 * sem isso o proxy o reescreveria para `/s/<host>/i/...`.
 */
export async function GET(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo: bruto } = await params;
  let decodificado = bruto;
  try {
    decodificado = decodeURIComponent(bruto);
  } catch {
    // `%` solto no endereço: segue com o texto cru, que o formato recusa.
  }
  const codigo = normalizarCodigoDeIndicacao(decodificado);
  const resposta = NextResponse.redirect(new URL("/astro#planos", req.url), 307);
  if (codigo) resposta.cookies.set(COOKIE_DE_INDICACAO, codigo, OPCOES_DO_COOKIE_DE_INDICACAO);
  // O redirecionamento leva o cookie de quem clicou: nada de cache compartilhado.
  resposta.headers.set("Cache-Control", "private, no-store");
  return resposta;
}
