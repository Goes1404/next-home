import "server-only";
import type { createServiceClient } from "@/lib/supabase/service";
import { alertaDeResolucao, problemaDoArquivo } from "@/lib/crm/linksDoCliente";
import { medirImagem } from "@/lib/imoveis/imagemDerivada";

/**
 * O envio de documento em dois tempos (16/10/2026): o servidor AUTORIZA um
 * caminho, o navegador sobe o arquivo direto ao armazenamento, e o servidor
 * CONFERE o que chegou antes de registrar.
 *
 * Por quê: a função da Vercel recusa corpo acima de 4,5 MB antes de o nosso
 * código rodar (HTTP 413, medido em produção). Foto de celular e PDF
 * escaneado passam disso, e o envio pela Server Action falhava com a tela
 * prometendo 10 MB e dizendo "sem conexão".
 *
 * A conferência não confia no navegador: tamanho e formato saem do
 * armazenamento, e arquivo fora da regra é apagado. O próprio bucket já
 * recusa acima de 10 MB e formato fora da lista (0118); esta é a segunda
 * trava, e é ela que mede a resolução da foto para o alerta do corretor.
 */

type Servico = ReturnType<typeof createServiceClient>;
export const BUCKET_DOCUMENTOS = "documentos-clientes";

export async function autorizarEnvio(
  supabase: Servico,
  caminho: string,
): Promise<{ caminho: string; autorizacao: string } | { erro: string }> {
  const { data, error } = await supabase.storage.from(BUCKET_DOCUMENTOS).createSignedUploadUrl(caminho);
  if (error || !data) {
    console.error("[documentos] autorização de envio recusada:", error?.message);
    return { erro: "Não foi possível preparar o envio agora. Tente de novo em alguns instantes." };
  }
  return { caminho: data.path, autorizacao: data.token };
}

/** Quantos arquivos já existem numa pasta (até `teto`), para segurar envio sem fim. */
export async function arquivosNaPasta(supabase: Servico, pasta: string, teto: number): Promise<number> {
  const { data } = await supabase.storage.from(BUCKET_DOCUMENTOS).list(pasta, { limit: teto });
  return (data ?? []).filter((o) => o.id).length;
}

export type ArquivoConferido = { tamanho: number; mime: string; alerta: string | null };

/**
 * O que de fato chegou ao armazenamento naquele caminho. Fora da regra, o
 * arquivo é apagado ali mesmo: sem a linha em `lead_documentos` ele ficaria
 * órfão, invisível ao corretor.
 */
export async function conferirArquivoEnviado(
  supabase: Servico,
  caminho: string,
): Promise<ArquivoConferido | { erro: string }> {
  const corte = caminho.lastIndexOf("/");
  const pasta = caminho.slice(0, corte);
  const nome = caminho.slice(corte + 1);
  const { data } = await supabase.storage.from(BUCKET_DOCUMENTOS).list(pasta, { search: nome, limit: 5 });
  const objeto = (data ?? []).find((o) => o.name === nome);
  if (!objeto) return { erro: "O arquivo não chegou ao armazenamento. Toque em enviar de novo." };

  const meta = (objeto.metadata ?? {}) as { size?: number; mimetype?: string };
  const tamanho = Number(meta.size ?? 0);
  const mime = String(meta.mimetype ?? "").split(";")[0].trim().toLowerCase();
  const problema = problemaDoArquivo({ size: tamanho, type: mime, name: nome });
  if (problema) {
    await supabase.storage.from(BUCKET_DOCUMENTOS).remove([caminho]);
    return { erro: problema };
  }

  // Medida só de imagem; PDF não tem resolução para conferir aqui.
  let alerta: string | null = null;
  if (mime.startsWith("image/")) {
    const { data: blob } = await supabase.storage.from(BUCKET_DOCUMENTOS).download(caminho);
    if (blob) {
      const medida = await medirImagem(Buffer.from(await blob.arrayBuffer()));
      alerta = medida ? alertaDeResolucao(medida.largura, medida.altura) : null;
    }
  }
  return { tamanho, mime, alerta };
}
