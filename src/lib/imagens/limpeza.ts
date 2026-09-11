import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

const BUCKET = "empreendimentos";
const LIMITE_POR_EXECUCAO = 100;

type ArteExpirada = { id: string; url: string; arte_url: string | null };

/** Aceita somente URLs públicas de artes dentro da pasta descartável. */
export function caminhoDaArteGerada(url: string): string | null {
  try {
    const pathname = new URL(url).pathname;
    const marcador = "/storage/v1/object/public/empreendimentos/";
    const indice = pathname.indexOf(marcador);
    if (indice < 0) return null;
    const caminho = decodeURIComponent(pathname.slice(indice + marcador.length));
    return /^corretores\/[0-9a-f-]{36}\/criacoes\/[^/]+$/i.test(caminho) ? caminho : null;
  } catch {
    return null;
  }
}

export type ResultadoDaLimpeza = { encontradas: number; removidas: number; pendentes: number };

/**
 * Libera artes cujo prazo chegou. Se o Storage falhar, preserva a linha para
 * nova tentativa; apagar o banco antes criaria arquivo órfão sem rastreio.
 */
export async function limparArtesExpiradas(agora = new Date()): Promise<ResultadoDaLimpeza> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("imagens_geradas")
    .select("id, url, arte_url")
    .lte("expira_em", agora.toISOString())
    .order("expira_em", { ascending: true })
    .limit(LIMITE_POR_EXECUCAO)
    .returns<ArteExpirada[]>();
  if (error) throw new Error(`Falha ao localizar artes expiradas: ${error.message}`);

  let removidas = 0;
  let pendentes = 0;
  for (const arte of data ?? []) {
    const candidatos = [arte.url, arte.arte_url]
      .filter((url): url is string => Boolean(url))
      .map(caminhoDaArteGerada);
    if (candidatos.length === 0 || candidatos.some((caminho) => caminho === null)) {
      console.error("[imagens] arte expirada com URL de Storage inválida", { imagemId: arte.id });
      pendentes++;
      continue;
    }
    const caminhos = [...new Set(candidatos.filter((caminho): caminho is string => caminho !== null))];

    const { error: erroNoStorage } = await supabase.storage.from(BUCKET).remove(caminhos);
    if (erroNoStorage) {
      console.error("[imagens] não foi possível remover arte expirada do Storage", { imagemId: arte.id, mensagem: erroNoStorage.message });
      pendentes++;
      continue;
    }

    const { error: erroNoBanco } = await supabase.from("imagens_geradas").delete().eq("id", arte.id);
    if (erroNoBanco) {
      console.error("[imagens] arte expirada removida do Storage mas não do banco", { imagemId: arte.id, mensagem: erroNoBanco.message });
      pendentes++;
      continue;
    }
    removidas++;
  }
  return { encontradas: data?.length ?? 0, removidas, pendentes };
}
