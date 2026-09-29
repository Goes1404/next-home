/**
 * Traz as fotos e plantas dos 14 rascunhos da 0128, do site de cada
 * construtora para o nosso Storage.
 *
 * Por que um script, e não a aba Importar: foram ~450 imagens em 14 imóveis,
 * e a seleção (`fotos-0128.json`) já é a curadoria feita — sem banner, foto
 * de obra, imagem de outro empreendimento da construtora nem foto da região.
 *
 * Por que no GitHub Actions: escrever no Storage exige a chave de serviço, e
 * ela mora nos secrets do repositório (a mesma do worker de vídeo). A chave
 * nunca passa pela sessão de quem escreveu isto.
 *
 * O caminho é o MESMO da aba Importar: `buscarSeguro` para baixar,
 * `registrarMidia` para medida, blur e dedup por hash, e `origem_url`
 * carimbada à parte. Rodar de novo não duplica nada: o índice de hash recusa,
 * e isso conta como sucesso.
 *
 * Só age em imóvel ainda NÃO publicado: foto nova num imóvel no ar mudaria a
 * vitrine sem ninguém conferir.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createServiceClient } from "@/lib/supabase/service";
import { buscarSeguro } from "@/lib/imoveis/site/buscarSeguro";
import { registrarMidia, type LinhaMidiaNova } from "@/lib/imoveis/registrarMidia";
import { chaveDaFoto } from "@/lib/imoveis/site/lerPagina";

type Item = { url: string; legenda: string; tipo: "foto" | "planta"; capa: boolean };

const TETO_IMAGEM = 15 * 1024 * 1024;

function legendaLegivel(legenda: string, tipo: Item["tipo"]): string {
  const limpa = legenda
    .replace(/[_]+/g, " ")
    .replace(/\b(HR|LR|REV|EF|F|v2|t0\d|compress|scaled|full)\b/gi, " ")
    .replace(/\b\d{6,}\b|\b\d{2}\.\d{2}\.\d{4}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (limpa || (tipo === "planta" ? "Planta do empreendimento" : "Foto do empreendimento")).slice(0, 200);
}

async function main() {
  const selecao: Record<string, Item[]> = JSON.parse(
    readFileSync(join(process.cwd(), "scripts/catalogo/fotos-0128.json"), "utf8"),
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
      .select("id, publicado")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !imovel) {
      console.error(`[${slug}] imóvel não encontrado`, error?.message ?? "");
      falhas += itens.length;
      continue;
    }
    if (imovel.publicado) {
      console.log(`[${slug}] já publicado — pulei (foto nova no ar precisa de conferência)`);
      continue;
    }

    let n = 0;
    for (const [i, item] of itens.entries()) {
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
        alt: legendaLegivel(item.legenda, item.tipo),
        // Capa primeiro; o resto na ordem da página da construtora.
        ordem: item.capa ? 0 : 10 + i,
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
