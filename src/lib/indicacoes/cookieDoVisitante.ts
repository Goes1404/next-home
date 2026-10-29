import "server-only";
import { cookies } from "next/headers";
import { COOKIE_DE_INDICACAO, normalizarCodigoDeIndicacao } from "./codigo";

/**
 * O código de indicação que o VISITANTE trouxe (cookie `astro_indicacao`,
 * gravado por `/i/<codigo>` ou por `?indicacao=` no `proxy.ts`), 0247.
 *
 * Só para o caminho público (o teste grátis do `/astro/contratar`): na
 * plataforma, o cookie seria o do administrador. Fora de uma requisição
 * (teste, script) `cookies()` lança, e aqui isso vale "sem indicação": a
 * indicação nunca derruba a contratação.
 */
export async function codigoDeIndicacaoDoVisitante(): Promise<string | null> {
  try {
    const guardados = await cookies();
    return normalizarCodigoDeIndicacao(guardados.get(COOKIE_DE_INDICACAO)?.value);
  } catch {
    return null;
  }
}
