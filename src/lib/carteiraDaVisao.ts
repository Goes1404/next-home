/**
 * De QUEM é a carteira que uma tela de trabalho mostra (hotfix de 19/10/2026).
 *
 * Relatado em produção: "está misturando os leads de todos os corretores na
 * conta do ADM, aí o ADM não consegue usar como corretor". As telas de
 * trabalho (Início, Pessoas, Lista, Funil, Visitas, tarefas…) confiavam na
 * RLS para recortar — "a policy decide se 'os meus' são sete leads ou
 * setecentos". Para o corretor comum isso dá certo; para o gestor a policy
 * abre a equipe inteira, e a tela em que ele trabalha virava a carteira de
 * todo mundo.
 *
 * A régua agora: tela de trabalho mostra os leads do PRÓPRIO usuário, para
 * qualquer papel. A visão da equipe mora em /corretor/admin. A única porta
 * para outra carteira é o gestor pedir EXPLICITAMENTE pela URL — é assim que
 * os números clicáveis da Administração continuam caindo na lista filtrada:
 *
 *   - `?corretor=<id>`    a carteira daquele corretor (só para o gestor);
 *   - `?corretor=equipe`  a equipe inteira (só para o gestor).
 *
 * Para o corretor comum o parâmetro não faz nada além do que a RLS já faz:
 * ele vê os dele, sempre. Módulo PURO (sem `server-only`, sem Supabase) para
 * a decisão ser testável sem banco — quem lê a sessão é `getCarteiraDaVisao`,
 * em `corretorSessao.ts`.
 */

/** Valor de `?corretor=` que pede a equipe inteira. */
export const CARTEIRA_EQUIPE = "equipe";

/**
 * Corretor que não existe: sem sessão a consulta ainda precisa de um recorte,
 * e um UUID válido que não casa com ninguém devolve lista vazia em vez de
 * erro de sintaxe do PostgREST.
 */
export const CORRETOR_NENHUM = "00000000-0000-0000-0000-000000000000";

export type Carteira =
  /** Os leads do próprio usuário — o padrão de toda tela de trabalho. */
  | { tipo: "minha"; corretorId: string }
  /** O gestor pediu a carteira de um corretor específico. */
  | { tipo: "de_outro"; corretorId: string }
  /** O gestor pediu a equipe inteira (`?corretor=equipe`). */
  | { tipo: "equipe" }
  /** Sem sessão: nada. */
  | { tipo: "nenhuma" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decidirCarteira(
  logado: { id: string; papel: string } | null,
  pedido?: string | null,
): Carteira {
  if (!logado) return { tipo: "nenhuma" };
  const minha: Carteira = { tipo: "minha", corretorId: logado.id };

  // Corretor comum: o parâmetro é ignorado. Não é segurança (a RLS já
  // garante), é coerência: a tela não pode prometer uma carteira que não
  // mostra.
  if (logado.papel !== "gestor") return minha;

  const p = (pedido ?? "").trim();
  if (!p) return minha;
  if (p === CARTEIRA_EQUIPE) return { tipo: "equipe" };
  // Lixo na URL não vira erro de UUID no banco: vira "os meus".
  if (!UUID.test(p)) return minha;
  if (p.toLowerCase() === logado.id.toLowerCase()) return minha;
  return { tipo: "de_outro", corretorId: p };
}

/**
 * O `corretor_id` que a consulta deve exigir, ou `null` quando não há recorte
 * (só a equipe pedida pelo gestor). Sem sessão devolve um id que não casa com
 * ninguém — nunca `null`, que abriria a consulta inteira.
 */
export function corretorDoRecorte(carteira: Carteira): string | null {
  switch (carteira.tipo) {
    case "minha":
    case "de_outro":
      return carteira.corretorId;
    case "equipe":
      return null;
    case "nenhuma":
      return CORRETOR_NENHUM;
  }
}
