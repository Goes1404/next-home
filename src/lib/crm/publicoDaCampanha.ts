import type { Lead } from "@/lib/types";
import { canalDaOrigem, ROTULO_DO_CANAL, type Canal } from "@/lib/graficos/calculos";

/**
 * Quem entra numa campanha, por público escolhido.
 *
 * ## Por que mora aqui, e não na action
 *
 * `campanhas/acoes.ts` é `"use server"`: todo export precisa ser função
 * async, então uma regra pura exportada de lá QUEBRA O BUILD. Foi o que
 * aconteceu ao tentar testar `elegivel` no lugar antigo — e é a razão pela
 * qual a casa mantém a régua em módulo próprio: aqui ela é importável,
 * testável e não arrasta o grafo do servidor.
 */

export type FiltroLeadsCampanha =
  | "parados_15d"
  | "novos_sem_contato"
  | "sem_resposta"
  | "todos"
  | "selecionados"
  | "compradores";

const DIAS_PARADO = 15;

/**
 * A partir de quantas tentativas sem resposta a insistência para.
 *
 * `tentativas_sem_resposta` (0060) conta quantas vezes NÓS falamos desde a
 * última fala do cliente, e zera quando ele responde. Três seguidas sem
 * retorno é onde a ficha do lead já sugere parar: a quarta não converte e
 * alimenta denúncia, que é o sinal mais forte que existe contra o número —
 * a mesma razão de existir a janela comercial.
 *
 * O teto é do FILTRO, não do sistema: quem quiser insistir mais escolhe o
 * lead a dedo em "Escolher um por um". Automático é que não empurra.
 *
 * Medido na base em 01/09: **26 leads** entram no filtro e **15** ficam de
 * fora por já terem passado do teto — quinze que uma campanha "todos"
 * teria queimado com a quarta mensagem.
 */
export const TETO_DE_INSISTENCIA = 3;

/** Fechado e perdido nunca entram — reativar quem já comprou ou já disse não é o oposto do objetivo. */
export function elegivel(
  lead: Lead,
  filtro: FiltroLeadsCampanha,
  contexto: { imovelSlug?: string | null } = {},
): boolean {
  if (!lead.telefone) return false;
  /*
   * Quem PEDIU para não ser procurado não entra em campanha nenhuma, e
   * isto vem antes de qualquer filtro.
   *
   * A etapa `perdido` abaixo não cobre este caso, e é aí que está a
   * armadilha: etapa ANDA E VOLTA. Bastaria alguém arrastar o cartão de
   * volta para "Novo" — coisa que se faz sem pensar, ao revisar o funil —
   * para o número de quem pediu para sair voltar à lista de transmissão.
   * Disparar para ele de novo é o caminho curto para a denúncia, que é o
   * sinal mais forte que existe contra o número.
   */
  if (lead.naoContatarEm) return false;

  /*
   * Compradores de UM imóvel (26/09/2026): o avanço da obra até a entrega
   * das chaves. É a única exceção à regra de que fechado não entra — e só
   * vale com o imóvel da campanha: "todos os que já compraram" seria
   * propaganda para quem acabou de comprar, o oposto do objetivo.
   */
  if (filtro === "compradores") {
    return lead.etapa === "fechado" && Boolean(contexto.imovelSlug) && lead.empreendimento?.slug === contexto.imovelSlug;
  }

  if (lead.etapa === "fechado" || lead.etapa === "perdido") return false;

  if (filtro === "novos_sem_contato") return lead.etapa === "novo";

  if (filtro === "parados_15d") {
    const dias = (Date.now() - new Date(lead.etapaAlteradaEm).getTime()) / 86_400_000;
    return dias >= DIAS_PARADO;
  }

  /*
   * Abordado e calado — o público que não existia e é o maior da base.
   * Medido em 01/09: 46 dos 112 leads ativos estão em "primeiro contato",
   * receberam disparo e nunca responderam. `novos_sem_contato` não os
   * alcança (não são "novo"), `parados_15d` também não (a etapa mudou há 5
   * dias) e `todos` incluiria quem JÁ respondeu — mensagem repetida cansa
   * justamente quem está conversando.
   */
  if (filtro === "sem_resposta") {
    return lead.tentativasSemResposta >= 1 && lead.tentativasSemResposta < TETO_DE_INSISTENCIA;
  }

  // "todos" e "selecionados" usam só as regras de base: quem recorta a
  // seleção manual é a lista de ids, na action.
  return true;
}

/**
 * O RECORTE POR ORIGEM (Fase 3 do plano das listas, 03/10/2026): além do
 * público, de onde o lead veio. "Quem chegou pelo anúncio do Dom Parque e
 * parou" é outra conversa que "quem chegou por portal".
 *
 * O canal sai de `canalDaOrigem`, a MESMA régua dos gráficos de origem: duas
 * contas de "de onde veio" divergiriam no primeiro ajuste, e a lista que o
 * gráfico mostra deixaria de ser a lista que a campanha alcança. O anúncio é
 * `leads.anuncio_origem` comparado sem caixa nem espaço nas pontas.
 *
 * Vazio = sem recorte. O recorte só ESTREITA: nunca põe na lista quem as
 * regras de `elegivel` tiraram.
 */
export type RecorteDeOrigem = { canal?: Canal | null; anuncio?: string | null };

function chaveDoAnuncio(nome: string | null | undefined): string {
  return (nome ?? "").trim().toLowerCase();
}

export function noRecorte(
  lead: Pick<Lead, "origem" | "anuncioOrigem">,
  recorte: RecorteDeOrigem | null | undefined,
): boolean {
  if (recorte?.canal && canalDaOrigem(lead.origem) !== recorte.canal) return false;
  const anuncio = chaveDoAnuncio(recorte?.anuncio);
  if (anuncio && chaveDoAnuncio(lead.anuncioOrigem) !== anuncio) return false;
  return true;
}

export type OpcoesDeRecorte = {
  canais: { canal: Canal; rotulo: string; total: number }[];
  anuncios: { nome: string; total: number }[];
};

/** Só oferece canal e anúncio que EXISTEM na carteira: opção que leva a lista vazia é a primeira frustração da tela. */
export function opcoesDeRecorte(leads: Pick<Lead, "origem" | "anuncioOrigem">[]): OpcoesDeRecorte {
  const canais = new Map<Canal, number>();
  const anuncios = new Map<string, { nome: string; total: number }>();
  for (const lead of leads) {
    const canal = canalDaOrigem(lead.origem);
    canais.set(canal, (canais.get(canal) ?? 0) + 1);
    const chave = chaveDoAnuncio(lead.anuncioOrigem);
    if (chave) {
      const atual = anuncios.get(chave);
      anuncios.set(chave, { nome: atual?.nome ?? lead.anuncioOrigem!.trim(), total: (atual?.total ?? 0) + 1 });
    }
  }
  return {
    canais: [...canais.entries()]
      .map(([canal, total]) => ({ canal, rotulo: ROTULO_DO_CANAL[canal], total }))
      .sort((a, b) => b.total - a.total),
    anuncios: [...anuncios.values()].sort((a, b) => b.total - a.total),
  };
}
