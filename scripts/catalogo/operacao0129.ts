/**
 * Apaga o `serenne-barueri-2` (duplicata do Serenne criada pelo painel a
 * partir de um site de corretor) e publica os rascunhos da fila de cadastro.
 *
 * Apagar segue `excluirImovel`: só imóvel DESPUBLICADO, arquivos do Storage
 * removidos depois da linha (o cascade leva `midias`, e sem ler as URLs
 * antes não haveria como saber o que apagar). Os arquivos moram na pasta do
 * próprio imóvel (`<id>/…`), então nenhum outro imóvel perde foto.
 *
 * Roda no GitHub Actions pela chave de serviço. Idempotente: imóvel já
 * apagado ou já publicado é pulado.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createServiceClient } from "@/lib/supabase/service";

async function main() {
  const op: { apagar: string[]; publicar: string[] } = JSON.parse(
    readFileSync(join(process.cwd(), "scripts/catalogo/operacao-0129.json"), "utf8"),
  );
  const supabase = createServiceClient();
  let falhas = 0;

  for (const slug of op.apagar) {
    const { data: imovel } = await supabase
      .from("empreendimentos")
      .select("id, publicado")
      .eq("slug", slug)
      .maybeSingle();
    if (!imovel) {
      console.log(`[apagar] ${slug}: já não existe`);
      continue;
    }
    if (imovel.publicado) {
      console.error(`[apagar] ${slug}: está publicado — não apago imóvel no ar`);
      falhas++;
      continue;
    }
    const { data: midias } = await supabase.from("midias").select("url").eq("empreendimento_id", imovel.id);
    const { error } = await supabase.from("empreendimentos").delete().eq("id", imovel.id).eq("publicado", false);
    if (error) {
      console.error(`[apagar] ${slug}: ${error.message}`);
      falhas++;
      continue;
    }
    const caminhos = (midias ?? [])
      .map((m) => m.url?.split("/empreendimentos/")[1])
      .filter((c): c is string => Boolean(c) && c.startsWith(`${imovel.id}/`));
    if (caminhos.length > 0) {
      const { error: erroArquivos } = await supabase.storage.from("empreendimentos").remove(caminhos);
      if (erroArquivos) console.error(`[apagar] ${slug}: arquivos órfãos: ${erroArquivos.message}`);
    }
    console.log(`[apagar] ${slug}: apagado, ${caminhos.length} arquivos removidos do Storage`);
  }

  const { data: publicados, error } = await supabase
    .from("empreendimentos")
    .update({ publicado: true })
    .in("slug", op.publicar)
    .eq("publicado", false)
    .select("slug");
  if (error) {
    console.error(`[publicar] ${error.message}`);
    falhas++;
  } else {
    console.log(`[publicar] ${publicados?.length ?? 0} publicados: ${(publicados ?? []).map((p) => p.slug).join(", ")}`);
  }

  if (falhas > 0) process.exit(1);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
