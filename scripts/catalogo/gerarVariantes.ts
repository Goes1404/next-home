/**
 * Backfill das variantes responsivas (0177) para as mídias que já estavam no
 * Storage antes de `registrarMidia` passar a gerá-las. Uso:
 *
 *   npx tsx --conditions=react-server scripts/catalogo/gerarVariantes.ts [--limite=N] [--so-publicados]
 *
 * Para cada linha de `midias` com `variantes` NULA e arquivo no nosso bucket:
 * baixa o original, gera as WebP menores que ele (480/960/1440, ver
 * `lib/imagens/variantes.ts`), sobe cada uma ao lado do arquivo e grava na
 * linha SÓ as larguras que de fato subiram. Linha sem variante possível
 * (original menor que 480px, SVG, GIF, arquivo que o sharp não lê) recebe
 * `{}` — conferida, não "pendente" — para não ser varrida de novo.
 *
 * Idempotente: `upsert` no Storage, e a linha já conferida sai do recorte.
 * Rodar duas vezes custa só a consulta. Nunca apaga nem substitui o original.
 *
 * Roda no GitHub Actions (`variantes-de-imagem.yml`), onde a chave de serviço
 * mora nos secrets. O log imprime só contagens e o id da linha que falhou —
 * o repositório é público.
 *
 * Mídia que NÃO é do nosso Storage (URL externa) fica fora: não há como subir
 * variante ao lado dela. Recebe `{}` também, para a lista de pendentes não
 * ficar eternamente com essas linhas.
 */
import { createServiceClient } from "@/lib/supabase/service";
import { gerarVariantes, medirImagem } from "@/lib/imoveis/imagemDerivada";
import { caminhoDaVariante, largurasParaGerar } from "@/lib/imagens/variantes";

const BUCKET = "empreendimentos";
const PARALELO = 4;

function lerArgs() {
  const args = new Map<string, string>();
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (m) args.set(m[1], m[2] ?? "true");
  }
  return {
    limite: Number(args.get("limite") ?? 5000),
    soPublicados: args.has("so-publicados"),
  };
}

type Linha = { id: string; url: string; largura: number | null; empreendimento_id: string };

function caminhoNoBucket(url: string, base: string): string | null {
  const prefixo = `${base}/storage/v1/object/public/${BUCKET}/`;
  return url.startsWith(prefixo) ? decodeURIComponent(url.slice(prefixo.length)) : null;
}

async function main() {
  const { limite, soPublicados } = lerArgs();
  const supabase = createServiceClient();
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  if (!base) throw new Error("NEXT_PUBLIC_SUPABASE_URL ausente");

  let consulta = supabase
    .from("midias")
    .select("id, url, largura, empreendimento_id, empreendimentos!inner(publicado)")
    .is("variantes", null)
    .order("ordem", { ascending: true })
    .limit(limite);
  if (soPublicados) consulta = consulta.eq("empreendimentos.publicado", true);

  const { data, error } = await consulta;
  if (error) throw new Error(`consulta falhou: ${error.message}`);
  const linhas = (data ?? []) as unknown as Linha[];
  console.log(`[variantes] ${linhas.length} mídia(s) sem variante conferida`);

  const totais = { comVariante: 0, semVariantePossivel: 0, externas: 0, falhas: 0, arquivos: 0 };

  async function tratar(linha: Linha) {
    const caminho = caminhoNoBucket(linha.url, base);
    if (!caminho) {
      totais.externas += 1;
      await supabase.from("midias").update({ variantes: [] }).eq("id", linha.id);
      return;
    }

    const baixado = await supabase.storage.from(BUCKET).download(caminho);
    if (baixado.error || !baixado.data) {
      totais.falhas += 1;
      console.error(`[variantes] ${linha.id}: download falhou (${baixado.error?.message ?? "sem corpo"})`);
      return;
    }
    const bytes = Buffer.from(await baixado.data.arrayBuffer());

    // A medida gravada pode estar nula (53 linhas em 12/10): mede de novo e
    // aproveita para gravar largura e altura, que a vitrine lê.
    const medidaNova = linha.largura ? null : await medirImagem(bytes);
    const larguras = largurasParaGerar(linha.largura ?? medidaNova?.largura ?? null);
    const geradas = await gerarVariantes(bytes, larguras);

    const subidas: number[] = [];
    for (const v of geradas) {
      const { error: erroUpload } = await supabase.storage
        .from(BUCKET)
        .upload(caminhoDaVariante(caminho, v.largura), v.bytes, { contentType: "image/webp", upsert: true });
      if (erroUpload) {
        console.error(`[variantes] ${linha.id}: variante ${v.largura}px não subiu (${erroUpload.message})`);
        continue;
      }
      subidas.push(v.largura);
    }

    // Falhou alguma? Não carimba: fica nula para a próxima rodada tentar.
    if (subidas.length !== geradas.length) {
      totais.falhas += 1;
      return;
    }

    const atualizacao: { variantes: number[]; largura?: number; altura?: number } = { variantes: subidas };
    if (medidaNova) {
      atualizacao.largura = medidaNova.largura;
      atualizacao.altura = medidaNova.altura;
    }
    const { error: erroUpdate } = await supabase.from("midias").update(atualizacao).eq("id", linha.id);
    if (erroUpdate) {
      totais.falhas += 1;
      console.error(`[variantes] ${linha.id}: update falhou (${erroUpdate.message})`);
      return;
    }
    totais.arquivos += subidas.length;
    if (subidas.length > 0) totais.comVariante += 1;
    else totais.semVariantePossivel += 1;
  }

  // Pool simples: PARALELO linhas por vez. Mais que isso disputa CPU do
  // runner com o sharp sem ganhar tempo de rede.
  let indice = 0;
  await Promise.all(
    Array.from({ length: PARALELO }, async () => {
      while (indice < linhas.length) {
        const linha = linhas[indice++];
        try {
          await tratar(linha);
        } catch (erro) {
          totais.falhas += 1;
          console.error(`[variantes] ${linha.id}: ${erro instanceof Error ? erro.message : String(erro)}`);
        }
      }
    }),
  );

  console.log(
    `[variantes] com variante: ${totais.comVariante} · sem variante possível: ${totais.semVariantePossivel} · externas: ${totais.externas} · falhas: ${totais.falhas} · arquivos subidos: ${totais.arquivos}`,
  );
  if (totais.falhas > 0) process.exitCode = 1;
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
