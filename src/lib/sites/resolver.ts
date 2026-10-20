import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { comRetentativa } from "@/lib/supabase/retentativa";
import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { site as siteDaCasa } from "@/lib/site";
import { ENDERECOS_DA_NEXT_HOME, ehHostDeDesenvolvimento, normalizarHost } from "./endereco";
import { marcaDoGrupo, type MarcaDoSite } from "./marca";
import { SEGMENTO_SEM_ENDERECO } from "./segmento";

/** Etiqueta do cache de endereços: limpa ao ligar ou trocar um domínio. */
export const TAG_ENDERECOS = "enderecos-do-site";

/** O site público servido num endereço: de que grupo é e com que marca. */
export type SiteDoGrupo = {
  grupoId: string;
  /** O host da requisição, normalizado. */
  host: string;
  marca: MarcaDoSite;
};

/**
 * O domínio da plataforma, para o endereço gratuito `<slug>.<domínio>`.
 * Variável de servidor; sem ela (o padrão até o dono comprar o domínio,
 * decisão de 19/10) só vale o domínio próprio cadastrado.
 */
export function dominioDaPlataforma(): string | null {
  return normalizarHost(process.env.DOMINIO_DA_PLATAFORMA);
}

/**
 * Endereços que servem o site da Next Home sem perguntar ao banco: os três
 * dela, o de `NEXT_PUBLIC_SITE_URL` (o projeto de testes da Vercel tem o
 * próprio), a máquina de quem desenvolve e os previews da Vercel deste
 * projeto (protegidos por login da Vercel).
 */
export function ehEnderecoDaNextHome(host: string): boolean {
  if (ENDERECOS_DA_NEXT_HOME.includes(host)) return true;
  if (ehHostDeDesenvolvimento(host)) return true;
  if (host === normalizarHost(urlHost(siteDaCasa.url))) return true;
  if (process.env.VERCEL_ENV === "preview" && host.endsWith(".vercel.app")) return true;
  return false;
}

function urlHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

type LinhaDoSite = { grupoId: string; nome: string; hostPrincipal: string };

/**
 * Pergunta ao banco de que grupo é o host, com cache de dados por host (o
 * `unstable_cache` põe os argumentos na chave). Pela chave de SERVIÇO: a
 * função recebe o domínio da plataforma como parâmetro, e com a chave
 * publicável qualquer um inventaria um domínio e descobriria os grupos pelo
 * slug (revisão da fase 3) — por isso só a chave de serviço a executa, e o
 * domínio vem da variável de servidor, nunca da requisição. Erro do banco LANÇA: um erro
 * de leitura não pode virar "endereço desconhecido" e servir a página neutra
 * no lugar do site de um cliente (a lição do porteiro, 19/10) — a página sai
 * 500 e o cache de rota segue servindo a versão anterior.
 */
const consultarEndereco = unstable_cache(
  async (host: string, dominio: string | null): Promise<LinhaDoSite | null> => {
    const supabase = createServiceClient();
    const { data, error } = await comRetentativa("site do endereço", () =>
      supabase.rpc("site_do_endereco", { p_host: host, p_dominio_da_plataforma: dominio }),
    );
    if (error) throw new Error(`Falha ao resolver o site de ${host}: ${error.message}`);
    const linha = data?.[0];
    return linha ? { grupoId: linha.grupo_id, nome: linha.nome, hostPrincipal: linha.host_principal } : null;
  },
  ["site-do-endereco"],
  { tags: [TAG_ENDERECOS], revalidate: 300 },
);

/**
 * O site do endereço, ou nulo (página neutra) para host que não é de nenhum
 * grupo — ou de grupo encerrado. `cache` do React: uma resolução por
 * requisição, por mais que layout, página e metadados perguntem.
 */
export const resolverSite = cache(async (hostCru: string | null | undefined): Promise<SiteDoGrupo | null> => {
  const host = normalizarHost(hostCru);
  if (!host || host === SEGMENTO_SEM_ENDERECO) return null;

  if (ehEnderecoDaNextHome(host)) {
    return {
      grupoId: GRUPO_NEXT_HOME_ID,
      host,
      marca: marcaDoGrupo({ grupoId: GRUPO_NEXT_HOME_ID, nome: siteDaCasa.nome, url: siteDaCasa.url }),
    };
  }

  const linha = await consultarEndereco(host, dominioDaPlataforma());
  if (!linha) return null;
  return {
    grupoId: linha.grupoId,
    host,
    marca: marcaDoGrupo({ grupoId: linha.grupoId, nome: linha.nome, url: `https://${linha.hostPrincipal}` }),
  };
});
