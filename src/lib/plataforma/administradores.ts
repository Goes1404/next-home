import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * Quem administra a plataforma (`administradores_da_plataforma`, 0190), para
 * a tela `/plataforma/administradores` (29/10/2026).
 *
 * A tabela não tem acesso pela API (só `eh_admin_da_plataforma()` lê a linha
 * de quem está logado): a lista vai pela chave de serviço, e a função pede a
 * PROVA da guarda no parâmetro, como as leituras de `grupos.ts`. O e-mail vem
 * do Auth, um login por vez — são poucas pessoas.
 */

export type AdministradorDaPlataforma = {
  userId: string;
  /** `null` quando o Auth não respondeu: a linha aparece mesmo assim, pelo id. */
  email: string | null;
  desde: string;
  ultimoAcesso: string | null;
};

export async function lerAdministradores(_prova: { userId: string }): Promise<AdministradorDaPlataforma[]> {
  const servico = createServiceClient();
  const { data, error } = await servico
    .from("administradores_da_plataforma")
    .select("user_id, criado_em")
    .order("criado_em", { ascending: true });
  if (error) throw new Error(`Falha ao ler os administradores da plataforma: ${error.message}`);

  return Promise.all(
    (data ?? []).map(async (linha) => {
      const { data: auth, error: erroDoAuth } = await servico.auth.admin.getUserById(linha.user_id);
      if (erroDoAuth) console.error(`[plataforma] login ${linha.user_id} não lido no Auth: ${erroDoAuth.message}`);
      return {
        userId: linha.user_id,
        email: auth?.user?.email ?? null,
        desde: linha.criado_em,
        ultimoAcesso: auth?.user?.last_sign_in_at ?? null,
      };
    }),
  );
}
