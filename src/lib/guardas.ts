import "server-only";

import { notFound } from "next/navigation";
import { getCorretorLogado, type CorretorSessao } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";

/**
 * Guardas de papel para as áreas de gestão.
 *
 * Existem em dois sabores porque página e Server Action falham de formas
 * diferentes, e misturar as duas dá tela branca ou erro sem mensagem:
 *
 * - Página: `notFound()`. 404 em vez de 403 de propósito — uma rota
 *   administrativa não precisa confirmar a própria existência para quem não
 *   deveria alcançá-la.
 * - Action: devolve erro em texto, porque a UI precisa ter o que mostrar.
 *
 * Isto NÃO substitui as policies: quem é dono de qual dado é decidido no
 * banco (ver `eh_gestor()`/`corretor_atual()`, migration 0007). A guarda
 * evita que a tela abra e que a ação rode — a RLS é a que impede o dado de
 * sair. Uma sozinha nunca basta.
 *
 * `souGestor()` (corretorSessao.ts) continua existindo para ligar e desligar
 * item de menu: falhar lá esconde um link, falhar aqui abre uma porta.
 */

/**
 * Para `page.tsx`/`layout.tsx` de área restrita.
 *
 * Precisa estar em CADA página do segmento, não só no layout: layouts não
 * re-executam ao navegar entre rotas irmãs, então o layout sozinho protege a
 * primeira entrada e não as seguintes.
 */
export async function exigirGestorNaPagina(): Promise<CorretorSessao> {
  const corretor = await getCorretorLogado();
  if (!corretor || corretor.papel !== "gestor") notFound();
  return corretor;
}

export type ResultadoGuarda =
  | { corretor: CorretorSessao; erro?: undefined }
  | { corretor?: undefined; erro: string };

/** Para Server Actions — o proxy não cobre POST de action (ver proxy.ts). */
export async function exigirGestorNaAcao(): Promise<ResultadoGuarda> {
  const corretor = await getCorretorLogado();
  if (!corretor) return { erro: "Sessão expirada. Entre novamente." };
  if (corretor.papel !== "gestor") {
    return { erro: "Esta ação é restrita a quem administra a imobiliária." };
  }
  return { corretor };
}

/**
 * O administrador da PLATAFORMA (área `/plataforma`), não o gestor de um grupo.
 *
 * Decide pela SESSÃO: `eh_admin_da_plataforma()` lê
 * `administradores_da_plataforma` com o `auth.uid()` do JWT (0181). Nunca
 * pela chave de serviço, que ignora quem chama e diria "sim" a qualquer um.
 *
 * Não passa por `getCorretorLogado()`: o administrador da plataforma pode não
 * ter ficha em `corretores`, e aí a sessão do painel seria `null` para ele.
 *
 * Erro do banco recusa: numa guarda, "não sei se é administrador" vale "não é".
 *
 * O resultado (`{ userId }`) é a PROVA que as leituras da plataforma pedem
 * por parâmetro (`src/lib/plataforma/`): quem chama não tem como pular a guarda.
 */
async function adminDaPlataformaDaSessao(): Promise<{ userId: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;
  const { data: ehAdmin, error } = await supabase.rpc("eh_admin_da_plataforma");
  if (error || ehAdmin !== true) return null;
  return { userId };
}

/** Para `page.tsx`/`layout.tsx` de `/plataforma`. Em CADA página (ver acima). */
export async function exigirAdminDaPlataformaNaPagina(): Promise<{ userId: string }> {
  const admin = await adminDaPlataformaDaSessao();
  if (!admin) notFound();
  return admin;
}

/** Para Server Actions de `/plataforma`. */
export async function exigirAdminDaPlataformaNaAcao(): Promise<{ userId: string } | { erro: string }> {
  const admin = await adminDaPlataformaDaSessao();
  if (!admin) return { erro: "Esta ação é restrita a quem administra a plataforma." };
  return admin;
}
