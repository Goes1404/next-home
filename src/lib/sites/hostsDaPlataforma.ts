import { site as siteDaCasa } from "@/lib/site";
import { ENDERECOS_DA_NEXT_HOME, ehHostDeDesenvolvimento, normalizarHost } from "./endereco";

// Os hosts que a plataforma reconhece sem perguntar ao banco. Num módulo à
// parte (puro, sem chave de serviço) para a área da plataforma validar um
// endereço sem importar o resolvedor, que é do site público.

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
