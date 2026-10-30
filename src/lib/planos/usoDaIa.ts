import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { mesEmSaoPaulo, situacaoDaCota, tetoDeRespostasDaIa, type SituacaoDaCota } from "./cotaDaIa";
import {
  COLUNA_DO_TETO,
  COLUNA_DO_USO,
  RECURSOS,
  cabeNoLimite,
  mensagemDeRecusa,
  situacaoDoRecurso,
  situacaoLivre,
  tetoDoRecurso,
  type Recurso,
  type SituacaoDoRecurso,
} from "./limitesDoPlano";
import type { FinalidadeDaIa } from "./custoDaIa";
import { inicioDoDiaEmSaoPaulo, tetoDeTranscricoesDoDia } from "@/lib/whatsapp/transcricaoNoGrupo";

/**
 * Quanto da cota de respostas da IA o grupo já usou neste mês (0197).
 *
 * Pela chave de serviço: `uso_da_ia` não tem grant para ninguém, e o teto
 * ajustado (`grupos.teto_respostas_ia`) também não. Toda leitura leva o
 * grupo no filtro; o grupo vem de quem chama, que já o validou (a instância
 * do webhook, a sessão do painel, a guarda da plataforma).
 *
 * Falha de leitura NÃO cala a IA: devolve `livre` (com log). "Não sei se a
 * cota acabou" calaria todos os clientes do grupo por uma piscada do banco,
 * e isso é pior que uma resposta a mais. É a decisão oposta à da trava
 * anti-ban, de propósito: lá o lado errado de errar queima o número; aqui
 * custa centavos.
 */
export async function lerCotaDaIa(grupoId: string, agora: Date = new Date()): Promise<SituacaoDaCota> {
  const servico = createServiceClient();
  const mes = mesEmSaoPaulo(agora);
  const [grupo, uso, assentos] = await Promise.all([
    servico.from("grupos").select("plano, teto_respostas_ia").eq("id", grupoId).maybeSingle(),
    servico.from("uso_da_ia").select("respostas").eq("grupo_id", grupoId).eq("mes", mes).maybeSingle(),
    servico
      .from("corretor_whatsapp_instancias")
      .select("id", { count: "exact", head: true })
      .eq("grupo_id", grupoId),
  ]);

  const erro = grupo.error ?? uso.error ?? assentos.error;
  if (erro || !grupo.data) {
    console.error(`[cota da IA] grupo ${grupoId}: leitura falhou, a IA segue respondendo: ${erro?.message ?? "grupo não encontrado"}`);
    return situacaoDaCota({ respostas: uso.data?.respostas ?? 0, teto: null });
  }

  const teto = tetoDeRespostasDaIa({
    plano: grupo.data.plano,
    tetoAjustado: grupo.data.teto_respostas_ia,
    assentos: assentos.count ?? 0,
  });
  return situacaoDaCota({ respostas: uso.data?.respostas ?? 0, teto });
}

export type LimitesDoGrupo = Record<Recurso, SituacaoDoRecurso>;

/** O que a área da plataforma precisa além do uso: o ajuste digitado e o padrão do plano. */
export type LimitesDetalhados = {
  limites: LimitesDoGrupo;
  /** O teto que a plataforma digitou; `null` = vale o do plano. */
  ajustados: Record<Recurso, number | null>;
  /** O teto do plano, já com os assentos; `null` = sem limite. */
  padroes: Record<Recurso, number | null>;
};

const LIVRES: LimitesDetalhados = {
  limites: { arte: situacaoLivre("arte"), video: situacaoLivre("video"), lista: situacaoLivre("lista") },
  ajustados: { arte: null, video: null, lista: null },
  padroes: { arte: null, video: null, lista: null },
};

/**
 * Os três usos do mês (artes, vídeos, mensagens de lista) contra o teto do
 * plano, na mesma linha de `uso_da_ia` das respostas da IA (0214).
 *
 * Falha de leitura NÃO bloqueia (como `lerCotaDaIa`): devolve `sem_teto` com
 * log. "Não sei se acabou" travaria a equipe inteira por uma piscada do banco;
 * custa centavos a mais, não um cliente parado. A plataforma, que prefere o
 * erro em voz alta, passa `{ estrito: true }`.
 */
export async function lerLimitesDetalhados(
  grupoId: string,
  opcoes: { agora?: Date; estrito?: boolean } = {},
): Promise<LimitesDetalhados> {
  const servico = createServiceClient();
  const mes = mesEmSaoPaulo(opcoes.agora ?? new Date());
  const [grupo, uso, assentos] = await Promise.all([
    servico
      .from("grupos")
      .select("plano, teto_artes, teto_videos, teto_mensagens_lista")
      .eq("id", grupoId)
      .maybeSingle(),
    servico
      .from("uso_da_ia")
      .select("artes, videos, mensagens_lista")
      .eq("grupo_id", grupoId)
      .eq("mes", mes)
      .maybeSingle(),
    servico.from("corretor_whatsapp_instancias").select("id", { count: "exact", head: true }).eq("grupo_id", grupoId),
  ]);

  const erro = grupo.error ?? uso.error ?? assentos.error;
  if (erro || !grupo.data) {
    const motivo = erro?.message ?? "grupo não encontrado";
    if (opcoes.estrito) throw new Error(`Falha ao ler os limites do plano: ${motivo}`);
    console.error(`[limites do plano] grupo ${grupoId}: leitura falhou, a geração segue liberada: ${motivo}`);
    return LIVRES;
  }

  const linha = grupo.data;
  const usado = uso.data;
  const resultado = { limites: {}, ajustados: {}, padroes: {} } as {
    limites: Partial<LimitesDoGrupo>;
    ajustados: Partial<Record<Recurso, number | null>>;
    padroes: Partial<Record<Recurso, number | null>>;
  };
  for (const recurso of RECURSOS) {
    const ajustado = linha[COLUNA_DO_TETO[recurso]] ?? null;
    const base = { recurso, plano: linha.plano, assentos: assentos.count ?? 0 };
    resultado.ajustados[recurso] = ajustado;
    resultado.padroes[recurso] = tetoDoRecurso({ ...base, tetoAjustado: null });
    resultado.limites[recurso] = situacaoDoRecurso({
      recurso,
      usados: usado?.[COLUNA_DO_USO[recurso]] ?? 0,
      teto: tetoDoRecurso({ ...base, tetoAjustado: ajustado }),
    });
  }
  return resultado as LimitesDetalhados;
}

export async function lerLimitesDoGrupo(
  grupoId: string,
  opcoes: { agora?: Date; estrito?: boolean } = {},
): Promise<LimitesDoGrupo> {
  return (await lerLimitesDetalhados(grupoId, opcoes)).limites;
}

export type ConferenciaDeLimite = { ok: true; situacao: SituacaoDoRecurso } | { ok: false; erro: string; situacao: SituacaoDoRecurso };

/**
 * Pode gastar `pedido` unidades de `recurso` este mês? Chamar ANTES da chamada
 * cara (a IA, o render, o envio). Esgotado: a recusa em português. Lista maior
 * que o restante: recusa a lista inteira, com a conta. Falha de leitura:
 * libera (ver `lerLimitesDoGrupo`). Grupo suspenso é outra regra (2C).
 */
export async function conferirLimite(
  grupoId: string,
  recurso: Recurso,
  pedido = 1,
  agora?: Date,
): Promise<ConferenciaDeLimite> {
  const situacao = (await lerLimitesDoGrupo(grupoId, { agora }))[recurso];
  if (cabeNoLimite(situacao, pedido)) return { ok: true, situacao };
  return { ok: false, erro: mensagemDeRecusa(situacao, pedido) ?? "O limite do mês acabou.", situacao };
}

/**
 * Quantas chamadas pagas de uma finalidade o grupo fez HOJE (dia de São
 * Paulo), pelo livro do consumo (0233). É a base dos tetos diários da IA no
 * atendimento (30/10/2026): transcrição com a IA calada e resumo da conversa.
 *
 * Conta LINHAS do livro: a transcrição que passou por dois motores conta
 * duas — erra para o lado de parar antes, que é o lado barato.
 *
 * Falha de leitura devolve 0 (com log), a mesma régua de `lerCotaDaIa`.
 */
export async function contarUsoDaIaDeHoje(grupoId: string, finalidade: FinalidadeDaIa, agora: Date = new Date()): Promise<number> {
  const { count, error } = await createServiceClient()
    .from("ia_consumo")
    .select("id", { count: "exact", head: true })
    .eq("grupo_id", grupoId)
    .eq("finalidade", finalidade)
    .gte("criado_em", inicioDoDiaEmSaoPaulo(agora).toISOString());
  if (error) {
    console.error(`[uso do dia] grupo ${grupoId} (${finalidade}): leitura falhou, segue liberado: ${error.message}`);
    return 0;
  }
  return count ?? 0;
}

/**
 * O teto de transcrições do dia do grupo (plano e assentos, como a cota).
 * Falha de leitura: sem teto, com log.
 */
export async function lerTetoDeTranscricoes(grupoId: string): Promise<number | null> {
  const servico = createServiceClient();
  const [grupo, assentos] = await Promise.all([
    servico.from("grupos").select("plano").eq("id", grupoId).maybeSingle(),
    servico.from("corretor_whatsapp_instancias").select("id", { count: "exact", head: true }).eq("grupo_id", grupoId),
  ]);
  if (grupo.error || !grupo.data) {
    console.error(`[teto de transcrições] grupo ${grupoId}: leitura falhou, sem teto: ${grupo.error?.message ?? "grupo não encontrado"}`);
    return null;
  }
  return tetoDeTranscricoesDoDia({ plano: grupo.data.plano, assentos: assentos.count ?? 0 });
}
