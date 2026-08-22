/**
 * O que zerar quando o corretor pareia um número DIFERENTE.
 *
 * Número de WhatsApp carrega reputação própria com a Meta. Um chip novo
 * herdar a contagem e a maturidade do anterior é o cenário clássico de
 * banimento: o sistema acharia que já pode disparar em volume alto num
 * número que o WhatsApp acabou de ver pela primeira vez.
 *
 * Por isso a troca reinicia TUDO que é reputação:
 * - a cota do dia (`envios_campanha_contador` / `envios_campanha_data`),
 * - o bloqueio herdado (`bloqueado_ate`) e o disjuntor (`falhas_seguidas`),
 * - e a curva de aquecimento (`conectado_em`), que volta a contar do zero.
 *
 * Reconectar o MESMO número não zera nada — seria pior: um corretor que
 * cai da internet e volta perderia a maturidade que o número já tinha e
 * despencaria para a cota de primeiro dia.
 *
 * Módulo puro: quem grava é `repositorio.ts`.
 */

/** Só dígitos, para `5511999998888` e `+55 11 99999-8888` serem o mesmo. */
export function mesmoNumero(a: string | null | undefined, b: string | null | undefined): boolean {
  const so = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
  const x = so(a);
  const y = so(b);
  if (!x || !y) return false;
  return x === y;
}

export type ResetDeReputacao = {
  envios_campanha_contador: number;
  envios_campanha_data: null;
  bloqueado_ate: null;
  falhas_seguidas: number;
  conectado_em: string;
};

/**
 * Devolve os campos a zerar, ou `null` quando não há troca.
 *
 * `numeroNovo` vazio devolve `null` de propósito: o provedor às vezes
 * confirma a conexão sem informar o número, e tratar "não sei" como "número
 * diferente" zeraria a maturidade de um número que não mudou.
 */
export function resetPorTrocaDeNumero(
  numeroAtual: string | null | undefined,
  numeroNovo: string | null | undefined,
  agora = new Date(),
): ResetDeReputacao | null {
  const novo = (numeroNovo ?? "").replace(/\D/g, "");
  if (!novo) return null;

  const atual = (numeroAtual ?? "").replace(/\D/g, "");
  // Primeira conexão da instância: não é troca, é estreia — a curva de
  // aquecimento já começa do zero por si.
  if (!atual) return null;

  if (mesmoNumero(atual, novo)) return null;

  return {
    envios_campanha_contador: 0,
    envios_campanha_data: null,
    bloqueado_ate: null,
    falhas_seguidas: 0,
    conectado_em: agora.toISOString(),
  };
}
