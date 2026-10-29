import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { CHAVE_SENHA_TROCADA_EM, senhaTrocadaEm, senhaVencida } from "./politicaDeSenha";

/**
 * O lado do servidor da troca de senha a cada 90 dias (29/10/2026). As
 * regras puras estão em `politicaDeSenha.ts`; aqui, onde a data mora e quem
 * a lê.
 */

/** Para onde mandar quem está com a senha vencida. */
export const DESTINO_SENHA_VENCIDA = "/corretor/senha?motivo=vencida";

/**
 * Grava "a senha foi trocada agora" no `app_metadata` do usuário. Só a chave
 * de serviço escreve `app_metadata` (é o que impede o usuário de adiar a
 * própria troca). O `app_metadata` atual vai junto para nada se perder
 * (`provider`, `usuario`…). Nunca lança: a troca de senha já aconteceu, e o
 * pior caso de falhar aqui é o prazo não reiniciar.
 */
export async function registrarSenhaTrocada(
  userId: string,
  appMetadata: Record<string, unknown> | undefined,
  agora: Date = new Date(),
): Promise<void> {
  try {
    const servico = createServiceClient();
    const { error } = await servico.auth.admin.updateUserById(userId, {
      app_metadata: { ...(appMetadata ?? {}), [CHAVE_SENHA_TROCADA_EM]: agora.toISOString() },
    });
    if (error) console.error(`[senha] não registrou a data da troca: ${error.message}`);
  } catch (e) {
    console.error("[senha] não registrou a data da troca:", e);
  }
}

/**
 * A senha da sessão atual venceu? Lê o `app_metadata` do JWT (`getClaims`,
 * local, sem ida ao Auth) — o layout do painel e o da plataforma perguntam
 * isto a cada tela. Sem data (conta anterior à regra) = não vencida: quem
 * começa a contar é o login (`entrar`).
 *
 * O JWT pode estar até 1 h atrasado em relação ao Auth; por isso a troca de
 * senha renova a sessão logo depois de gravar a data, senão o painel
 * mandaria de volta para a troca quem acabou de trocar.
 */
export const senhaDaSessaoVencida = cache(async function senhaDaSessaoVencida(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const trocada = senhaTrocadaEm(data?.claims?.app_metadata as Record<string, unknown> | undefined);
  return trocada ? senhaVencida(trocada) : false;
});
