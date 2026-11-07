/**
 * De qual número é a roleta que o gestor vê na aba Roleta (07/11/2026).
 *
 * A roleta age no número para onde o anúncio manda o cliente. Na Aretz esse
 * número é o da conta oculta de administração ("Aretz"). O Bruno, gestor com
 * conta oculta própria e SEM número de WhatsApp, abria a aba na roleta do
 * próprio número: vazia e desligada. A que valia (André, Martines, Moisés e
 * Gediel) só aparecia logado como "Aretz", e do lado dele parecia que "a IA
 * distribui os leads como quer".
 *
 * A regra, em ordem:
 *   1. o próprio número, se já tem roleta salva (quem configurou vê a sua);
 *   2. senão, a roleta LIGADA de outro gestor do grupo — primeiro a do número
 *      central —, porque é ela que está decidindo quem recebe;
 *   3. senão, o próprio número, se ele tem WhatsApp (para criar a roleta dele);
 *   4. senão, o número central, se o dono dele é gestor (para criar a dele);
 *   5. senão, o próprio, como antes (a aba mostra a roleta vazia).
 *
 * Pura: a tela só passa o que leu do banco.
 */
export function numeroDaRoleta(p: {
  quemId: string;
  /** O gestor logado tem número de WhatsApp (conectado ou não). */
  temNumeroProprio: boolean;
  roletas: ReadonlyArray<{ corretorId: string; ligada: boolean }>;
  /** Ids dos gestores ativos do grupo, contas ocultas inclusive. */
  gestores: ReadonlyArray<string>;
  /** Dono do número central do grupo (`grupos.envio_grupo_leads_instancia`). */
  donoDoNumeroCentral: string | null;
}): string {
  const { quemId, roletas, donoDoNumeroCentral: central } = p;
  if (roletas.some((r) => r.corretorId === quemId)) return quemId;

  const gestores = new Set(p.gestores);
  const ligadasDeOutroGestor = roletas.filter((r) => r.ligada && r.corretorId !== quemId && gestores.has(r.corretorId));
  if (central && ligadasDeOutroGestor.some((r) => r.corretorId === central)) return central;
  if (ligadasDeOutroGestor.length > 0) return ligadasDeOutroGestor[0].corretorId;

  if (p.temNumeroProprio) return quemId;
  if (central && gestores.has(central)) return central;
  return quemId;
}
