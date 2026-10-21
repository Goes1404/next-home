import "server-only";

import { getCorretorLogado } from "@/lib/corretorSessao";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { lerMarcaDoCrm } from "./ler";
import { MARCA_NEXT_HOME, type MarcaDoCrm } from "./marca";

/**
 * A marca do grupo de quem está logado, para o cabeçalho, o menu e os textos
 * do painel. Sem sessão (login, conta sem vínculo), a do endereço não é
 * decidida aqui: vale a da instalação, como sempre valeu.
 */
export async function marcaDoPainel(): Promise<MarcaDoCrm> {
  const corretor = await getCorretorLogado();
  if (!corretor) return MARCA_NEXT_HOME;
  return corretor.grupoId === GRUPO_NEXT_HOME_ID ? MARCA_NEXT_HOME : lerMarcaDoCrm(corretor.grupoId);
}
