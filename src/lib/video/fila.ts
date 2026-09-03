import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { createServiceClient } from "@/lib/supabase/service";
import type { Plano } from "./roteiro";
import {
  MAX_TENTATIVAS,
  TRAVA_MINUTOS,
  saldoDisponivel,
  type SaldoDeVideo,
  type StatusJob,
  type VideoJob,
} from "./videoTipos";

/**
 * A fila de render, no Postgres.
 *
 * ## Quem escreve é o servidor
 *
 * `authenticated` só tem SELECT (e DELETE do próprio vídeo). Toda escrita
 * passa pela service key, senão o teto de cota se forja por chamada direta à
 * API — a mesma razão de `imagens_geradas` não dar INSERT ao corretor.
 *
 * ## O crédito é debitado ANTES do trabalho
 *
 * É o que evita a corrida entre dois pedidos simultâneos. O preço disso é que
 * uma falha nossa cobraria um vídeo que não existiu — por isso `falharJob`
 * devolve. Mesmo desenho de `reservarCotaCampanha` / `devolver_cota_campanha`.
 */

type LinhaJob = {
  id: string;
  status: StatusJob;
  briefing: unknown;
  url: string | null;
  duracao_s: number | null;
  erro_motivo: string | null;
  created_at: string;
  empreendimentos?: { nome: string } | null;
};

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function paraJob(l: LinhaJob): VideoJob {
  const b = (l.briefing ?? {}) as Record<string, unknown>;
  return {
    id: l.id,
    status: l.status,
    empreendimentoNome: l.empreendimentos?.nome ?? texto(b.imovelNome),
    objetivo: texto(b.objetivo),
    canal: texto(b.canal),
    titulo: texto(b.titulo),
    url: l.url,
    duracaoS: l.duracao_s === null ? null : Number(l.duracao_s),
    erroMotivo: l.erro_motivo,
    criadoEm: l.created_at,
  };
}

const SELECT_JOB =
  "id, status, briefing, url, duracao_s, erro_motivo, created_at, empreendimentos(nome)";

export async function getMeusVideos(limite = 24): Promise<VideoJob[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("video_jobs")
    .select(SELECT_JOB)
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Falha ao ler os vídeos: ${error.message}`);
  return (data as unknown as LinhaJob[]).map(paraJob);
}

export async function getSaldo(corretorId: string): Promise<SaldoDeVideo> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("video_creditos")
    .select("cota_mensal, usados_no_ciclo, creditos_avulsos, ciclo_inicio")
    .eq("corretor_id", corretorId)
    .maybeSingle();

  // Sem linha ainda: o corretor tem a cota padrão inteira. A linha nasce na
  // primeira reserva — criar aqui só para ler seria escrita numa leitura.
  const base = data
    ? {
        cotaMensal: data.cota_mensal,
        // Ciclo de mês passado ainda não foi zerado no banco (só a reserva
        // zera). Mostrar o consumo velho faria a tela dizer que não há saldo
        // quando há — a conta de exibição precisa fazer a mesma virada.
        usadosNoCiclo: mesmoMes(data.ciclo_inicio) ? data.usados_no_ciclo : 0,
        creditosAvulsos: data.creditos_avulsos,
      }
    : { cotaMensal: 5, usadosNoCiclo: 0, creditosAvulsos: 0 };

  return { ...base, disponiveis: saldoDisponivel(base) };
}

/** O mês corrente em São Paulo — o servidor roda em UTC e viraria cedo. */
function mesEmSaoPaulo(quando: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).format(quando);
}

function mesmoMes(cicloInicio: string): boolean {
  return cicloInicio.slice(0, 7) === mesEmSaoPaulo();
}

export type ResultadoEnfileirar =
  | { ok: true; jobId: string; cobranca: "cota" | "credito" }
  | { ok: false; motivo: "sem_saldo" | "falha"; detalhe?: string };

/**
 * Reserva o crédito e enfileira. Nesta ordem, sempre.
 *
 * Enfileirar primeiro e cobrar depois abriria a janela em que dois pedidos
 * simultâneos viram dois renders com um crédito só — que é exatamente a
 * corrida que este desenho existe para fechar.
 */
export async function enfileirarVideo(params: {
  corretorId: string;
  empreendimentoId: string | null;
  briefing: Record<string, Json>;
  roteiro: Plano[];
}): Promise<ResultadoEnfileirar> {
  const supabase = createServiceClient();

  const { data: cobranca, error: erroCredito } = await supabase.rpc("reservar_credito_video", {
    p_corretor: params.corretorId,
  });
  if (erroCredito) return { ok: false, motivo: "falha", detalhe: erroCredito.message };
  if (!cobranca) return { ok: false, motivo: "sem_saldo" };

  const { data, error } = await supabase
    .from("video_jobs")
    .insert({
      corretor_id: params.corretorId,
      empreendimento_id: params.empreendimentoId,
      briefing: params.briefing as Json,
      // Só o que o worker precisa para repetir o render. A `Midia` inteira
      // traria blur e medidas que não servem para nada aqui.
      roteiro: params.roteiro.map((p) => ({
        url: p.foto.url,
        alt: p.foto.alt,
        tipo: p.tipo,
        movimento: p.movimento,
        duracao: p.duracao,
        legenda: p.legenda,
      })),
      cobranca,
    })
    .select("id")
    .single();

  if (error || !data) {
    // O crédito já saiu. Devolver aqui é o que impede de cobrar por um job
    // que não chegou a existir.
    await supabase.rpc("devolver_credito_video", {
      p_corretor: params.corretorId,
      p_cobranca: cobranca,
    });
    return { ok: false, motivo: "falha", detalhe: error?.message };
  }
  return { ok: true, jobId: data.id, cobranca: cobranca as "cota" | "credito" };
}

/**
 * O worker pega o próximo job.
 *
 * A trava é um UPDATE condicional que só afeta a linha se ela ainda estiver
 * livre — dois workers correndo, um leva e o outro recebe zero linhas. Sem
 * `travado_ate`, um worker que morre no meio deixa o job preso para sempre.
 */
export async function pegarProximoJob(worker: string): Promise<{ id: string; roteiro: unknown; briefing: unknown } | null> {
  const supabase = createServiceClient();
  const agora = new Date();
  const limite = new Date(agora.getTime() + TRAVA_MINUTOS * 60_000).toISOString();

  const { data: candidatos } = await supabase
    .from("video_jobs")
    .select("id")
    .eq("status", "pendente")
    .lt("tentativas", MAX_TENTATIVAS)
    .order("created_at", { ascending: true })
    .limit(5);

  for (const candidato of candidatos ?? []) {
    const { data } = await supabase
      .from("video_jobs")
      .update({ status: "renderizando", travado_por: worker, travado_ate: limite })
      .eq("id", candidato.id)
      .eq("status", "pendente")
      .select("id, roteiro, briefing")
      .maybeSingle();
    if (data) return { id: data.id, roteiro: data.roteiro, briefing: data.briefing };
  }
  return null;
}

/** Devolve à fila o que um worker morto deixou travado. */
export async function soltarTravasVencidas(): Promise<number> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("video_jobs")
    .update({ status: "pendente", travado_por: null, travado_ate: null })
    .eq("status", "renderizando")
    .lt("travado_ate", new Date().toISOString())
    .select("id");
  return data?.length ?? 0;
}

export async function concluirJob(params: {
  jobId: string;
  url: string;
  duracaoS: number;
  largura: number;
  altura: number;
  renderMs: number;
}): Promise<void> {
  const supabase = createServiceClient();
  await supabase
    .from("video_jobs")
    .update({
      status: "pronto",
      url: params.url,
      duracao_s: params.duracaoS,
      largura: params.largura,
      altura: params.altura,
      render_ms: params.renderMs,
      travado_por: null,
      travado_ate: null,
      concluido_em: new Date().toISOString(),
    })
    .eq("id", params.jobId);
}

/**
 * Falha do render devolve o crédito — sempre.
 *
 * Reservar antes do trabalho é o que fecha a corrida; sem esta devolução, uma
 * falha nossa cobraria do corretor um vídeo que nunca existiu. É a mesma
 * lição de `devolver_cota_campanha`, onde 15 disparos foram consumidos para
 * entregar 3.
 */
export async function falharJob(params: {
  jobId: string;
  motivo: string;
  definitivo?: boolean;
}): Promise<void> {
  const supabase = createServiceClient();
  const { data: job } = await supabase
    .from("video_jobs")
    .select("corretor_id, cobranca, tentativas")
    .eq("id", params.jobId)
    .maybeSingle();
  if (!job) return;

  const tentativas = job.tentativas + 1;
  const acabou = params.definitivo || tentativas >= MAX_TENTATIVAS;

  await supabase
    .from("video_jobs")
    .update({
      status: acabou ? "erro" : "pendente",
      erro_motivo: params.motivo.slice(0, 300),
      tentativas,
      travado_por: null,
      travado_ate: null,
      concluido_em: acabou ? new Date().toISOString() : null,
    })
    .eq("id", params.jobId);

  if (acabou) {
    await supabase.rpc("devolver_credito_video", {
      p_corretor: job.corretor_id,
      p_cobranca: job.cobranca,
    });
  }
}
