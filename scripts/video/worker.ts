/**
 * O worker de render — pega um job da fila, renderiza, guarda e conclui.
 *
 * ## Por que ele existe fora da Vercel
 *
 * Medido duas vezes em 4 CPUs: 86,9 s no protótipo e 174 s pelo motor de
 * produção, contra o teto de 60 s por função do plano Hobby. A rota enfileira;
 * quem renderiza é isto, num host que pode demorar.
 *
 * ## Por que ele processa um lote pequeno e sai
 *
 * Mesmo desenho do disparador de campanhas: cada chamada leva poucos itens e
 * termina. Worker que roda para sempre precisa de supervisão, reinício e
 * observabilidade próprios — três coisas que este projeto não tem. Rodar curto
 * e voltar é mais barato de operar e falha melhor.
 *
 *   npx tsx --conditions=react-server scripts/video/worker.ts [quantos]
 *
 * Precisa de: ffmpeg no PATH, SUPABASE_SECRET_KEY e NEXT_PUBLIC_SUPABASE_URL.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { concluirJob, falharJob, pegarProximoJob, soltarTravasVencidas } from "@/lib/video/fila";
import { renderizarVideo } from "@/lib/video/render";
import type { Plano } from "@/lib/video/roteiro";
import type { ChaveCanal, Copy } from "@/lib/imagens/marketing";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const BUCKET = "empreendimentos";
const QUANTOS = Number(process.argv[2] ?? 3);
/** Identidade desta execução — é ela que aparece em `travado_por`. */
const WORKER = process.env.GITHUB_RUN_ID
  ? `gha-${process.env.GITHUB_RUN_ID}`
  : `local-${process.pid}`;

/** O roteiro volta do jsonb sem forma. Linha torta não derruba o worker. */
function planosDoJson(v: unknown): Plano[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const o = item as Record<string, unknown>;
    if (typeof o.url !== "string" || !o.url) return [];
    return [
      {
        foto: { tipo: "foto" as const, url: o.url, alt: String(o.alt ?? ""), largura: 0, altura: 0, blurDataUrl: null },
        tipo: (o.tipo ?? "interior") as Plano["tipo"],
        movimento: (o.movimento ?? "push") as Plano["movimento"],
        duracao: Number(o.duracao) || 4,
        legenda: String(o.legenda ?? ""),
      },
    ];
  });
}

async function main() {
  const soltos = await soltarTravasVencidas();
  if (soltos > 0) console.log(`${soltos} job(s) de worker morto devolvidos à fila`);

  const supabase = createServiceClient();
  let logo: Buffer | null = null;
  try {
    logo = await readFile(join(process.cwd(), "public", "marca", "logo-original.png"));
  } catch {
    /* sem logo, a marca sai em texto */
  }

  let feitos = 0;
  for (let i = 0; i < QUANTOS; i++) {
    const job = await pegarProximoJob(WORKER);
    if (!job) break;

    const b = (job.briefing ?? {}) as Record<string, unknown>;
    const planos = planosDoJson(job.roteiro);
    if (planos.length === 0) {
      // Job sem roteiro nunca vai render. Falha DEFINITIVA: repetir três vezes
      // só atrasaria a fila e devolveria o crédito mais tarde.
      await falharJob({ jobId: job.id, motivo: "roteiro vazio", definitivo: true });
      console.log(`${job.id}: roteiro vazio, descartado`);
      continue;
    }

    const copy: Copy = {
      titulo: String(b.titulo ?? b.imovelNome ?? "Conheça este imóvel"),
      apoio: String(b.apoio ?? ""),
      cta: String(b.cta ?? "Agende uma visita"),
    };

    console.log(`${job.id}: renderizando ${planos.length} planos…`);
    const r = await renderizarVideo({
      planos,
      copy,
      canal: (b.canal ?? "story") as ChaveCanal,
      rodape: String(b.rodape ?? "Next Home"),
      logo,
    });

    if (!r.ok) {
      // `sem_ffmpeg` é ambiente errado, não job ruim: definitivo, senão o job
      // volta à fila e queima as três tentativas num host mal configurado.
      await falharJob({ jobId: job.id, motivo: `${r.motivo}: ${r.detalhe ?? ""}`, definitivo: r.motivo === "sem_ffmpeg" });
      console.error(`${job.id}: FALHOU (${r.motivo}) ${r.detalhe ?? ""}`);
      continue;
    }

    // Hash do conteúdo no nome, como `registrarMidia`: torna o upload
    // idempotente se o worker morrer entre subir e concluir.
    const hash = createHash("sha256").update(r.bytes).digest("hex").slice(0, 16);
    const caminho = `corretores/${b.corretorId ?? "sem-corretor"}/videos/${hash}.mp4`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(caminho, r.bytes, { contentType: "video/mp4", upsert: true });
    if (error) {
      await falharJob({ jobId: job.id, motivo: `upload: ${error.message}` });
      console.error(`${job.id}: upload falhou — ${error.message}`);
      continue;
    }

    await concluirJob({
      jobId: job.id,
      url: supabase.storage.from(BUCKET).getPublicUrl(caminho).data.publicUrl,
      duracaoS: r.duracaoS,
      largura: r.largura,
      altura: r.altura,
      renderMs: r.renderMs,
    });
    feitos += 1;
    console.log(`${job.id}: pronto em ${r.renderMs} ms · ${Math.round(r.bytes.length / 1024)} KB`);
  }

  console.log(`worker ${WORKER}: ${feitos} vídeo(s) concluído(s)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
