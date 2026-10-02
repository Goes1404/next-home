/**
 * Traz para o catálogo uma lista CURADA de fotos (uma por linha do JSON),
 * do site da construtora para o nosso Storage. Uso:
 *
 *   npx tsx --conditions=react-server scripts/catalogo/trazerFotosCuradas.ts \
 *     scripts/catalogo/fotos-curadas/<lista>.json
 *
 * Age em imóvel publicado: cada lista é conferida antes (foto do imóvel, não
 * de outro empreendimento; sem repetir render que já está na galeria). Só
 * ACRESCENTA, nunca apaga. Nasceu da 0137 (trazerFotos0137.ts, a primeira
 * leva) para a próxima leva não precisar de script novo.
 *
 * Mesmo caminho da aba Importar: `buscarSeguro` para baixar, `registrarMidia`
 * para medida, blur e dedup por hash. Rodar de novo não duplica nada.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createServiceClient } from "@/lib/supabase/service";
import { buscarSeguro } from "@/lib/imoveis/site/buscarSeguro";
import { registrarMidia, type LinhaMidiaNova } from "@/lib/imoveis/registrarMidia";
import { chaveDaFoto } from "@/lib/imoveis/site/lerPagina";

type Item = { url: string; legenda: string; tipo: "foto" | "planta"; ordem: number };

const TETO_IMAGEM = 15 * 1024 * 1024;

async function main() {
  const lista = process.argv[2];
  if (!lista) throw new Error("informe o JSON da lista: trazerFotosCuradas.ts scripts/catalogo/fotos-curadas/<lista>.json");
  const selecao: Record<string, Item[]> = JSON.parse(
    readFileSync(join(process.cwd(), lista), "utf8"),
  );
  const supabase = createServiceClient();

  const deps = {
    async subir(caminho: string, conteudo: Buffer, contentType: string) {
      const { error } = await supabase.storage
        .from("empreendimentos")
        .upload(caminho, conteudo, { contentType, upsert: true });
      return { erro: error?.message ?? null };
    },
    urlPublica(caminho: string) {
      return supabase.storage.from("empreendimentos").getPublicUrl(caminho).data.publicUrl;
    },
    async inserir(linha: LinhaMidiaNova) {
      const { data, error } = await supabase.from("midias").insert(linha).select("id").single();
      if (error?.code === "23505") return { id: null, duplicada: true, erro: null };
      if (error) return { id: null, duplicada: false, erro: error.message };
      return { id: data.id, duplicada: false, erro: null };
    },
  };

  let novas = 0;
  let duplicadas = 0;
  let falhas = 0;

  for (const [slug, itens] of Object.entries(selecao)) {
    const { data: imovel, error } = await supabase
      .from("empreendimentos")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !imovel) {
      console.error(`[${slug}] imóvel não encontrado`, error?.message ?? "");
      falhas += itens.length;
      continue;
    }

    let n = 0;
    for (const item of itens) {
      const busca = await buscarSeguro(item.url, {
        tetoBytes: TETO_IMAGEM,
        prazoMs: 30_000,
        aceitar: (tipo) => /^image\/(jpeg|png|webp)/.test(tipo),
      });
      if (!busca.ok) {
        console.warn(`[${slug}] falhou ao baixar ${item.url}: ${busca.mensagem}`);
        falhas++;
        continue;
      }
      const r = await registrarMidia(deps, {
        empreendimentoId: imovel.id,
        bytes: busca.bytes,
        mime: busca.contentType.split(";")[0].trim(),
        tipo: item.tipo,
        alt: item.legenda,
        ordem: item.ordem,
      });
      if (!r.ok) {
        console.warn(`[${slug}] falhou ao registrar ${item.url}: ${r.erro}`);
        falhas++;
        continue;
      }
      if (r.duplicada) duplicadas++;
      else {
        novas++;
        n++;
      }
      await supabase
        .from("midias")
        .update({ origem_url: chaveDaFoto(item.url) })
        .eq("empreendimento_id", imovel.id)
        .eq("url", r.url)
        .is("origem_url", null);
    }
    console.log(`[${slug}] ${n} novas de ${itens.length}`);
  }

  console.log(`fim: ${novas} novas, ${duplicadas} já existiam, ${falhas} falhas`);
  if (falhas > 0 && novas === 0) process.exit(1);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
