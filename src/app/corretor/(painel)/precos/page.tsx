import { redirect } from "next/navigation";

/**
 * Preços mudou de endereço: agora mora em `/corretor/admin/precos`, junto com
 * as outras telas do gestor.
 *
 * Ela era a única aba de Administração fora de `/admin/`, e isso tinha um
 * custo concreto: a navegação de abas não podia morar em `admin/layout.tsx`,
 * porque o layout não envolve uma rota irmã. Cada página do segmento precisava
 * desenhar a própria barra de abas.
 *
 * O endereço antigo continua respondendo, e é regra da casa: link salvo, aba
 * aberta há semanas e favorito não podem virar 404 por uma reorganização de
 * menu. É o mesmo caminho que `/corretor/equipe` já faz.
 */
export default async function PrecosAntigo() {
  redirect("/corretor/admin/precos");
}
