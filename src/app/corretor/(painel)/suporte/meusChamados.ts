import "server-only";

import { getCorretorLogado } from "@/lib/corretorSessao";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/types";

/**
 * Os chamados que o PRÓPRIO usuário abriu com a Astro (0240, 29/10/2026),
 * para a lista de `/corretor/suporte`.
 *
 * A tabela é global e não tem grant para o `authenticated`: a leitura é pela
 * chave, e por isso o corretor sai da sessão AQUI (não de parâmetro) e toda
 * leitura filtra `corretor_origem_id` por ele. Nem o gestor vê os chamados
 * dos colegas: cada um acompanha o seu. A resposta interna da Astro não sai
 * daqui (é anotação da equipe, não resposta ao cliente).
 */

type Linha = Database["public"]["Tables"]["chamados_de_suporte"]["Row"];
export type MeuChamado = Pick<Linha, "id" | "criado_em" | "assunto" | "mensagem" | "status" | "atualizado_em">;

const LIMITE = 30;

export async function listarMeusChamados(): Promise<MeuChamado[]> {
  const corretor = await getCorretorLogado();
  if (!corretor) return [];
  const servico = createServiceClient();
  const { data, error } = await servico
    .from("chamados_de_suporte")
    .select("id, criado_em, assunto, mensagem, status, atualizado_em")
    .eq("corretor_origem_id", corretor.id)
    .order("criado_em", { ascending: false })
    .limit(LIMITE);
  if (error) {
    console.error(`[suporte] chamados de ${corretor.id} não lidos: ${error.message}`);
    return [];
  }
  return data ?? [];
}
