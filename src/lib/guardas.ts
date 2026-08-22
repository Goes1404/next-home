import "server-only";

import { notFound } from "next/navigation";
import { getCorretorLogado, type CorretorSessao } from "@/lib/corretorSessao";

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
