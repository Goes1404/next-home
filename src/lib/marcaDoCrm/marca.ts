// A marca de cada imobiliária DENTRO do CRM (21/10/2026).
//
// Módulo PURO. O cliente que entra pelo CRM (astroimob.vercel.app) não pode
// ver "Next Home" nem `nexthomeimoveis.com` depois do login. O grupo 1 (a
// Next Home) continua EXATAMENTE como era: as mesmas palavras, os mesmos
// links (`marca.test.ts` trava isso). Outro grupo tem:
//
//   nome  = `grupos.ia_nome_da_casa` se preenchido, senão `grupos.nome`;
//   logo  = `grupos.logo_url` se houver, senão o nome escrito.
//
// O endereço do painel e o dos links do cliente também saem daqui:
// `enderecoDoPainel` leva o CORRETOR ao painel (aviso no WhatsApp, e-mail,
// notificação), `enderecoDoCliente` leva o CLIENTE do grupo a uma página
// pública de token (seleção, documentos, agenda).

import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { site } from "@/lib/site";
import { limparCampoDaCasa, TAMANHO_MAXIMO } from "@/lib/whatsapp/casa";

/** O painel das imobiliárias clientes, até existir o domínio da plataforma. */
export const PAINEL_URL_PADRAO = "https://astroimob.vercel.app";

/** O nome quando a leitura do grupo falha: nunca o da Next Home. */
export const NOME_SEM_LEITURA = "Imobiliária";

export type MarcaDoCrm = {
  grupoId: string;
  /** A Next Home: texto e logo de sempre (`site.ts`). */
  ehNextHome: boolean;
  /** "Next Home" / o nome do grupo: avisos, títulos, mensagens ao corretor. */
  nome: string;
  nomeCompleto: string;
  /** As duas partes do nome escrito (a segunda sai em destaque). */
  wordmark: [string, string];
  /** A imagem da logo; nulo = o nome escrito. Só outro grupo tem. */
  logoUrl: string | null;
};

/** As colunas de `grupos` que a marca lê. */
export type LinhaDaMarca = {
  nome: string | null;
  ia_nome_da_casa: string | null;
  logo_url: string | null;
};

export const MARCA_NEXT_HOME: MarcaDoCrm = {
  grupoId: GRUPO_NEXT_HOME_ID,
  ehNextHome: true,
  nome: site.nome,
  nomeCompleto: site.nomeCompleto,
  wordmark: site.wordmark,
  logoUrl: null,
};

/** Só `https://` entra como imagem: a coluna é pública, mas a tela não confia nela. */
function logoValida(url: string | null | undefined): string | null {
  const limpa = (url ?? "").trim();
  return /^https:\/\/\S+$/.test(limpa) && limpa.length <= 500 ? limpa : null;
}

/**
 * A marca de um grupo a partir da linha de `grupos`. Linha nula (leitura que
 * falhou) também tem resposta: o nome genérico — para outro grupo nunca a
 * Next Home.
 */
export function marcaDoCrm(grupoId: string, linha: LinhaDaMarca | null): MarcaDoCrm {
  if (grupoId === GRUPO_NEXT_HOME_ID) return MARCA_NEXT_HOME;
  const nome =
    limparCampoDaCasa(linha?.ia_nome_da_casa, TAMANHO_MAXIMO.nomeDaCasa) ??
    limparCampoDaCasa(linha?.nome, TAMANHO_MAXIMO.nomeDaCasa) ??
    NOME_SEM_LEITURA;
  return {
    grupoId,
    ehNextHome: false,
    nome,
    nomeCompleto: nome,
    wordmark: [nome, ""],
    logoUrl: logoValida(linha?.logo_url),
  };
}

function semBarra(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * O endereço do PAINEL para o corretor do grupo. Grupo 1: `site.url`, como
 * sempre. Os outros: `PAINEL_URL` (variável de servidor; padrão o endereço só
 * do CRM). Sem barra no fim.
 */
export function enderecoDoPainel(grupoId: string, painelUrl: string | undefined = process.env.PAINEL_URL): string {
  if (grupoId === GRUPO_NEXT_HOME_ID) return semBarra(site.url);
  const configurado = (painelUrl ?? "").trim();
  return semBarra(/^https?:\/\/\S+$/.test(configurado) ? configurado : PAINEL_URL_PADRAO);
}

/** `enderecoDoPainel` + o caminho (que começa com `/`). */
export function linkDoPainel(grupoId: string, caminho: string, painelUrl?: string): string {
  return `${enderecoDoPainel(grupoId, painelUrl)}${caminho}`;
}

/**
 * O endereço para onde vai o link que o CLIENTE do grupo recebe (seleção,
 * documentos, agenda, link pessoal). Grupo 1: `site.url`. Outro grupo: o
 * endereço principal do site dele (`enderecos_do_site`, fase 3) se existir;
 * senão o do painel — as rotas de token abrem lá (`proxy.ts`).
 */
export function enderecoDoCliente(
  grupoId: string,
  hostPrincipal: string | null | undefined,
  painelUrl?: string,
): string {
  if (grupoId === GRUPO_NEXT_HOME_ID) return semBarra(site.url);
  const host = (hostPrincipal ?? "").trim().toLowerCase();
  if (host && /^[a-z0-9.-]+$/.test(host)) return `https://${host}`;
  return enderecoDoPainel(grupoId, painelUrl);
}

/** O host de um endereço (`https://x.com/a` -> `x.com`), para o domínio do calendário. */
export function hostDoEndereco(endereco: string): string {
  try {
    return new URL(endereco).hostname;
  } catch {
    return endereco;
  }
}
