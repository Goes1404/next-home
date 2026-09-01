import { motivoDeUrgencia, type MotivoUrgencia } from "./apelidoPendente";

/**
 * O que falta em cada imóvel para a assistente conseguir atender bem.
 *
 * ## Por que estas três coisas, e não outras
 *
 * Foram escolhidas pelo que a IA SENTE na conversa, medido em produção
 * (01/09/2026, sobre os 25 publicados):
 *
 * - **sem planta (16 de 25)** — o cliente pede a planta e ela não tem o que
 *   mandar. O guardrail bloqueia o anexo inexistente, mas o texto já
 *   prometeu, e o cliente fica esperando um arquivo que nunca chega. É a
 *   pendência que mais aparece numa conversa real.
 * - **sem tipologia (3 de 25)** — sem ela a ficha do prompt não tem
 *   metragem nem dormitórios, e "o que não está no prompt, a IA inventa"
 *   (foi assim que ela respondeu "1 suíte" para um imóvel com 3).
 * - **sem apelido (23 de 25)** — o cliente chama o imóvel pelo nome do
 *   anúncio, e sem `nomes_alternativos` a IA trata um imóvel NOSSO como se
 *   fosse de outra imobiliária.
 *
 * Foto não entra: os 25 publicados têm foto, então um degrau que vive em
 * zero só ensinaria a ignorar a lista.
 *
 * ## A ordem é a do estrago
 *
 * Nome que é título de anúncio vem primeiro porque o imóvel fica invisível
 * para o bot — o cliente não tem como acertar um nome que não existe.
 * Depois planta, que é o pedido mais comum. Depois tipologia, e por último
 * o apelido de um imóvel que já tem nome de verdade.
 */

export type TipoDePendencia = "apelido_invisivel" | "sem_planta" | "sem_tipologia" | "sem_apelido";

export interface PendenciaDoImovel {
  tipo: TipoDePendencia;
  /** O que dizer ao corretor, em uma linha, sobre o custo de não ter isso. */
  explicacao: string;
}

export const PESO: Record<TipoDePendencia, number> = {
  apelido_invisivel: 0,
  sem_planta: 1,
  sem_tipologia: 2,
  sem_apelido: 3,
};

const EXPLICACAO: Record<TipoDePendencia, string> = {
  apelido_invisivel:
    "o nome cadastrado é um título de anúncio — sem apelido, não há nome que o cliente possa acertar",
  sem_planta: "o cliente pede a planta e a assistente não tem o que mandar",
  sem_tipologia: "sem metragem e dormitórios na ficha, a assistente inventa",
  sem_apelido: "o cliente pode chamar por outro nome e a assistente não reconhecer",
};

export interface ImovelDoCatalogo {
  slug: string;
  nome: string;
  bairro?: string | null;
  construtora?: string | null;
  nomesAlternativos?: string[];
  plantas?: { id?: string }[];
  tipologias?: { id?: string }[];
}

export interface ImovelComPendencias<T> {
  imovel: T;
  pendencias: PendenciaDoImovel[];
  /** A mais grave, que decide a posição na lista. */
  peso: number;
}

function pendenciasDe(imovel: ImovelDoCatalogo): PendenciaDoImovel[] {
  const tipos: TipoDePendencia[] = [];

  const semApelido = (imovel.nomesAlternativos?.length ?? 0) === 0;
  if (semApelido) {
    // Nome que é título de anúncio é caso próprio: não é "seria bom ter
    // apelido", é "sem apelido este imóvel não existe para o bot".
    tipos.push(motivoDeUrgencia(imovel.nome) ? "apelido_invisivel" : "sem_apelido");
  }
  if ((imovel.plantas?.length ?? 0) === 0) tipos.push("sem_planta");
  if ((imovel.tipologias?.length ?? 0) === 0) tipos.push("sem_tipologia");

  return tipos
    .sort((a, b) => PESO[a] - PESO[b])
    .map((tipo) => ({ tipo, explicacao: EXPLICACAO[tipo] }));
}

/**
 * Os imóveis com algo faltando, do mais grave para o menos.
 *
 * Dentro do mesmo peso a ordem é alfabética: previsível é melhor que
 * esperta numa lista que a pessoa percorre marcando o que já fez.
 */
export function pendenciasDoCatalogo<T extends ImovelDoCatalogo>(
  imoveis: readonly T[],
): ImovelComPendencias<T>[] {
  return imoveis
    .map((imovel) => ({ imovel, pendencias: pendenciasDe(imovel) }))
    .filter((x) => x.pendencias.length > 0)
    .map((x) => ({ ...x, peso: PESO[x.pendencias[0].tipo] }))
    .sort((a, b) => a.peso - b.peso || a.imovel.nome.localeCompare(b.imovel.nome, "pt-BR"));
}

/** Quantos imóveis têm cada tipo de pendência. Para o resumo da tela. */
export function contarPorTipo(
  lista: readonly ImovelComPendencias<unknown>[],
): Record<TipoDePendencia, number> {
  const zerado: Record<TipoDePendencia, number> = {
    apelido_invisivel: 0,
    sem_planta: 0,
    sem_tipologia: 0,
    sem_apelido: 0,
  };

  for (const item of lista) {
    for (const p of item.pendencias) zerado[p.tipo]++;
  }
  return zerado;
}

export { EXPLICACAO as EXPLICACAO_PENDENCIA };
