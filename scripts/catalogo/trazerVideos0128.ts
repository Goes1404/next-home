/**
 * Vídeos e tours dos rascunhos da 0128 que a primeira leitura não achou.
 *
 * Tour 360 é LINK: mora na plataforma da construtora (tourmkr, Tour Brasil
 * 360, Instacasa) e a página embeda, como faz `adicionarMidiaExterna`.
 * Arquivo .mp4 do site da construtora SOBE para o nosso Storage (`subir`):
 * link direto para o arquivo dela quebra no dia em que ela trocar o site.
 *
 * Roda no GitHub Actions pelo mesmo motivo das fotos: a chave de serviço
 * está nos secrets. Idempotente: mídia com a mesma URL não entra de novo, e
 * o arquivo sobe com o hash no nome. Pula imóvel já publicado.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createServiceClient } from "@/lib/supabase/service";
import { buscarSeguro } from "@/lib/imoveis/site/buscarSeguro";
import { validarUrlMidiaExterna } from "@/lib/embedMidia";

type Item = { tipo: "video" | "tour360"; url: string; titulo: string; subir?: boolean };

/** O bucket aceita até 50 MB por arquivo no plano atual. */
const TETO_VIDEO = 50 * 1024 * 1024;

async function main() {
  const selecao: Record<string, Item[]> = JSON.parse(
    readFileSync(join(process.cwd(), "scripts/catalogo/videos-0128.json"), "utf8"),
  );
  const supabase = createServiceClient();
  let novas = 0;
  let falhas = 0;

  for (const [slug, itens] of Object.entries(selecao)) {
    const { data: imovel } = await supabase
      .from("empreendimentos")
      .select("id, publicado")
      .eq("slug", slug)
      .maybeSingle();
    if (!imovel) {
      console.error(`[${slug}] imóvel não encontrado`);
      falhas += itens.length;
      continue;
    }
    if (imovel.publicado) {
      console.log(`[${slug}] já publicado — pulei`);
      continue;
    }

    for (const item of itens) {
      let url = item.url;
      if (item.subir) {
        const busca = await buscarSeguro(item.url, {
          tetoBytes: TETO_VIDEO,
          prazoMs: 120_000,
          aceitar: (tipo) => tipo.startsWith("video/mp4"),
        });
        if (!busca.ok) {
          console.warn(`[${slug}] falhou ao baixar ${item.url}: ${busca.mensagem}`);
          falhas++;
          continue;
        }
        const hash = createHash("sha256").update(busca.bytes).digest("hex");
        const caminho = `${imovel.id}/video-${hash.slice(0, 16)}.mp4`;
        const { error } = await supabase.storage
          .from("empreendimentos")
          .upload(caminho, busca.bytes, { contentType: "video/mp4", upsert: true });
        if (error) {
          console.warn(`[${slug}] falhou ao subir ${item.url}: ${error.message}`);
          falhas++;
          continue;
        }
        url = supabase.storage.from("empreendimentos").getPublicUrl(caminho).data.publicUrl;
      }

      const validacao = validarUrlMidiaExterna(item.tipo, url);
      if (!validacao.ok) {
        console.warn(`[${slug}] link recusado ${url}: ${validacao.erro}`);
        falhas++;
        continue;
      }

      const { data: existente } = await supabase
        .from("midias")
        .select("id")
        .eq("empreendimento_id", imovel.id)
        .eq("url", validacao.url)
        .maybeSingle();
      if (existente) continue;

      const { error } = await supabase.from("midias").insert({
        empreendimento_id: imovel.id,
        tipo: item.tipo,
        url: validacao.url,
        alt: item.titulo,
        ordem: 50,
      });
      if (error) {
        console.warn(`[${slug}] falhou ao gravar ${url}: ${error.message}`);
        falhas++;
        continue;
      }
      novas++;
      console.log(`[${slug}] + ${item.tipo}: ${item.titulo}`);
    }
  }

  console.log(`fim: ${novas} novas, ${falhas} falhas`);
  if (falhas > 0) process.exit(1);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
