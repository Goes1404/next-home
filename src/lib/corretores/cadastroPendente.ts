/**
 * Uma ficha administrativa provisória precisa satisfazer as colunas NOT NULL
 * de `corretores`, mas não pode fingir que os dados foram informados. O
 * marcador fica no CRECI porque ele não é editável pelo perfil comum; a tela
 * exclusiva de conclusão o troca uma única vez.
 */
const PREFIXO = "PENDENTE-";

export function creciPendenteDoCadastro(identificador: string): string {
  return `${PREFIXO}${identificador}`.slice(0, 120);
}

export function cadastroEstaPendente(creci: string): boolean {
  return creci.startsWith(PREFIXO);
}

/**
 * O CRECI que pode aparecer para o CLIENTE: nulo quando é marcador de
 * cadastro incompleto (`PENDENTE-…` desta ficha provisória, ou o
 * `PREENCHER-…` que a carga da Aretz usou em 23/10/2026) ou não tem número.
 * Achado no site da Aretz (26/10/2026): os cartões da equipe mostravam
 * "CRECI PREENCHER-ARETZ-ANDR" para o visitante.
 */
export function creciParaExibir(creci: string | null | undefined): string | null {
  const limpo = creci?.trim();
  if (!limpo) return null;
  if (cadastroEstaPendente(limpo) || /^PREENCHER-/i.test(limpo)) return null;
  return /[0-9]/.test(limpo) ? limpo : null;
}
