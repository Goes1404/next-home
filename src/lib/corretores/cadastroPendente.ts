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
