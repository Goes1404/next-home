/**
 * Renderiza um vídeo de verdade a partir de um imóvel do catálogo.
 *
 * É a prova de que o motor funciona ponta a ponta, e é onde se mede o tempo
 * real de render — o número que decide o host, já que os 60 s da Vercel não
 * comportam isto.
 *
 *   npx tsx --conditions=react-server scripts/video/renderizar.ts <slug> [objetivo] [canal]
 *
 * Precisa de ffmpeg no PATH:
 *   apt-get update -qq && apt-get install -y --no-install-recommends ffmpeg
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { montarBriefing, problemasDaCopy, type ChaveCanal, type ChaveObjetivo } from "@/lib/imagens/marketing";
import { montarRoteiro, duracaoTotal } from "@/lib/video/roteiro";
import { renderizarVideo } from "@/lib/video/render";
import { mapEmpreendimento, type LinhaEmpreendimento } from "@/lib/supabase/mappers";
import { SELECT_EMPREENDIMENTO } from "@/lib/queries";
import { createClient } from "@supabase/supabase-js";

const [slug, objetivo = "lancamento", canal = "story"] = process.argv.slice(2);
if (!slug) {
  console.error("uso: renderizar.ts <slug> [objetivo] [canal]");
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !chave) throw new Error("NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórias");

  const sb = createClient(url, chave);
  const { data, error } = await sb.from("empreendimentos").select(SELECT_EMPREENDIMENTO).eq("slug", slug).maybeSingle();
  if (error || !data) throw new Error(`imóvel não encontrado: ${slug} ${error?.message ?? ""}`);
  const imovel = mapEmpreendimento(data as unknown as LinhaEmpreendimento);

  const briefing = montarBriefing({
    imovel,
    objetivo: objetivo as ChaveObjetivo,
    canal: canal as ChaveCanal,
    publico: "familia",
  });
  const copy = {
    titulo: imovel.nome,
    apoio: `${imovel.bairro}, ${imovel.cidade}`,
    cta: briefing.objetivo.ctas[0],
  };
  const problemas = problemasDaCopy(copy);
  if (problemas.length > 0) throw new Error(`copy fora da régua: ${problemas.join("; ")}`);

  const planos = montarRoteiro({ fotos: imovel.galeria, objetivo: objetivo as ChaveObjetivo });
  console.log(`IMÓVEL: ${imovel.nome} · ${imovel.bairro} · ${imovel.galeria.length} fotos`);
  console.log(`ROTEIRO (${objetivo} / ${canal}): ${duracaoTotal(planos)} s em ${planos.length} planos`);
  for (const p of planos) console.log(`  ${p.movimento.padEnd(5)} ${p.duracao}s  ${p.tipo.padEnd(11)} "${p.legenda}"`);

  let logo: Buffer | null = null;
  try {
    logo = await readFile(join(process.cwd(), "public", "marca", "logo-original.png"));
  } catch {
    console.log("  (sem logo — a marca sai em texto)");
  }

  const r = await renderizarVideo({ planos, copy, canal: canal as ChaveCanal, rodape: "Next Home · next-home-drab.vercel.app", logo });
  if (!r.ok) {
    console.error(`FALHOU: ${r.motivo} ${r.detalhe ?? ""}`);
    process.exit(1);
  }
  const saida = join(process.cwd(), `video-${slug}-${objetivo}-${canal}.mp4`);
  await writeFile(saida, r.bytes);
  console.log(`\nRENDER: ${r.renderMs} ms · ${Math.round(r.bytes.length / 1024)} KB · ${r.largura}x${r.altura} · ${r.duracaoS}s`);
  console.log(saida);
}
main().catch((e) => { console.error(e); process.exit(1); });
