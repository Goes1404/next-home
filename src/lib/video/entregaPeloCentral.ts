import "server-only";

import { destinoPeloCentral, registrarAvisoNoHistorico } from "@/lib/central/avisos";
import { ferramenta, ONDA_ATUAL } from "@/lib/central/ferramentas";
import type { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/types";
import { enviarMensagemWhatsapp, enviarMidiaWhatsapp } from "@/lib/whatsapp/provider";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * O vídeo pedido pelo número central volta pelo central quando fica pronto
 * (spec 3.7, capacidade 32; onda 3, Frente M).
 *
 * Quem conclui o job é o worker de render, no GitHub Actions
 * (`scripts/video/worker.ts` → `concluirJob`/`falharJob`), que não tem as
 * chaves da Evolution nem roda dentro da Vercel. Por isso a entrega não sai
 * de lá: o tique dos follow-ups (pg_cron, a cada 5 min) lê os jobs que a
 * conclusão de SEMPRE marcou (`pronto`, ou `erro` definitivo com o crédito
 * devolvido) e que nasceram no central (`briefing.origem = "central"`,
 * `videoPeloCentral.ts`), e manda pelo central o texto e o vídeo.
 *
 * - Canal: o dos avisos (`destinoPeloCentral`, Frente J): central conectado,
 *   recurso ligado, pessoa ativa com WhatsApp. Sem canal agora, tenta no
 *   próximo tique, até 24 h depois da conclusão; o vídeo segue na tela de
 *   vídeos do painel de qualquer jeito.
 * - Entregue = `briefing.centralEntregueEm`, gravado DEPOIS do envio. Dois
 *   tiques no mesmo job só se sobrepõem se um passar de 5 min; o pior caso é
 *   o vídeo chegar duas vezes, não deixar de chegar.
 * - Entra no histórico da conversa como fala do central, com o vídeo como
 *   marca (nunca a URL): "manda pro João" logo depois tem contexto.
 * - Com a onda de `criar_video` desligada não lê NADA (em produção, onda 0).
 *
 * Nenhuma IA aqui: não conta na cota.
 */

const JANELA_DA_ENTREGA_MS = 24 * 60 * 60 * 1000;
const TETO_POR_TIQUE = 20;

type LinhaDoJob = { id: string; corretor_id: string; status: string; url: string | null; briefing: unknown };

export function textoDaEntrega(job: Pick<LinhaDoJob, "status" | "url">, imovel: string): string {
  return job.status === "pronto" && job.url
    ? `Ficou pronto o vídeo do ${imovel}. É só encaminhar.`
    : `Não consegui fazer o vídeo do ${imovel}, e o crédito voltou. Pode pedir de novo, ou tentar pela tela de vídeos do painel.`;
}

export async function entregarVideosPeloCentral(supabase: Supa, agora: Date = new Date(), onda: number = ONDA_ATUAL): Promise<number> {
  const daFerramenta = ferramenta("criar_video");
  if (!daFerramenta || onda < daFerramenta.onda) return 0;

  const { data, error } = await supabase
    .from("video_jobs")
    .select("id, corretor_id, status, url, briefing")
    .in("status", ["pronto", "erro"])
    .gte("concluido_em", new Date(agora.getTime() - JANELA_DA_ENTREGA_MS).toISOString())
    .order("concluido_em", { ascending: true })
    .limit(200);
  if (error) {
    console.warn("[vídeo pelo central] fila não lida:", error.message);
    return 0;
  }

  // A marca mora no briefing (jsonb): o filtro é aqui, e a janela de 24 h
  // mantém a leitura pequena (vídeos por dia, não por minuto).
  const pendentes = ((data ?? []) as LinhaDoJob[])
    .filter((j) => {
      const b = (j.briefing ?? {}) as Record<string, unknown>;
      return b.origem === "central" && !b.centralEntregueEm;
    })
    .slice(0, TETO_POR_TIQUE);

  let entregues = 0;
  for (const job of pendentes) {
    try {
      const destino = await destinoPeloCentral(supabase, job.corretor_id, onda);
      if (!destino) continue;
      const briefing = job.briefing as Record<string, unknown>;
      const imovel = typeof briefing.imovelNome === "string" && briefing.imovelNome ? briefing.imovelNome : "imóvel";
      const texto = textoDaEntrega(job, imovel);
      const envio = await enviarMensagemWhatsapp({ instanceName: destino.instanceName, telefone: destino.telefone, texto });
      if (!envio.enviado) continue;

      let comVideo = false;
      if (job.status === "pronto" && job.url) {
        const midia = await enviarMidiaWhatsapp({ instanceName: destino.instanceName, telefone: destino.telefone, tipo: "video", url: job.url });
        comVideo = midia.enviado;
        // O anexo não saiu (tamanho, provedor): o link resolve, e o texto já foi.
        if (!comVideo) await enviarMensagemWhatsapp({ instanceName: destino.instanceName, telefone: destino.telefone, texto: job.url });
      }

      await supabase
        .from("video_jobs")
        .update({ briefing: { ...briefing, centralEntregueEm: agora.toISOString() } as Json })
        .eq("id", job.id);
      await registrarAvisoNoHistorico(supabase, job.corretor_id, comVideo ? `${texto}\n[vídeo]` : texto, agora);
      entregues += 1;
    } catch (erro) {
      console.warn("[vídeo pelo central] entrega falhou; tenta no próximo tique:", job.id, erro);
    }
  }
  return entregues;
}
