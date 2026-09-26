/**
 * Links que o corretor manda ao cliente (26/09/2026): a seleção
 * personalizada e o envio de documentos do financiamento.
 *
 * O token (uuid aleatório) é a credencial: quem tem o link vê a seleção ou
 * envia documentos. Por isso ele expira em 30 dias, a página é `noindex`, e
 * nada do CRM aparece nela além do primeiro nome do cliente.
 */

export type TipoDeLink = "documentos" | "selecao" | "proposta" | "portal";

/** A lista padrão do financiamento — o que o banco pede em quase todo caso. */
export const DOCUMENTOS_PADRAO = [
  "RG ou CNH",
  "CPF (se não estiver no RG/CNH)",
  "Comprovante de residência",
  "Comprovante de estado civil (certidão de nascimento ou casamento)",
  "3 últimos holerites ou comprovante de renda",
  "Extrato do FGTS",
  "Declaração do Imposto de Renda (com recibo)",
] as const;

/**
 * A lista muda com a forma de ganhar dinheiro, e pedir a errada custa uma
 * volta: o autônomo não tem holerite, e o banco de um casal pede os
 * documentos dos dois. Três perfis cobrem quase todo caso; o resto o
 * corretor pede na conversa.
 */
export const PERFIS_DE_DOCUMENTO = ["clt", "autonomo", "casal"] as const;
export type PerfilDeDocumento = (typeof PERFIS_DE_DOCUMENTO)[number];
export const PERFIL_DE_DOCUMENTO_LABEL: Record<PerfilDeDocumento, string> = {
  clt: "Registrado (CLT)",
  autonomo: "Autônomo ou empresário",
  casal: "Casal (compra a dois)",
};

export function documentosDoPerfil(perfil: PerfilDeDocumento): string[] {
  if (perfil === "autonomo") {
    return [
      "RG ou CNH",
      "CPF (se não estiver no RG/CNH)",
      "Comprovante de residência",
      "Comprovante de estado civil (certidão de nascimento ou casamento)",
      "Extratos bancários dos últimos 6 meses",
      "Declaração do Imposto de Renda (com recibo)",
      "Pró-labore ou DECORE (se tiver empresa)",
      "Extrato do FGTS (se tiver)",
    ];
  }
  if (perfil === "casal") {
    return [
      "RG ou CNH dos dois",
      "CPF dos dois (se não estiver no RG/CNH)",
      "Certidão de casamento ou declaração de união estável",
      "Comprovante de residência",
      "3 últimos holerites ou comprovante de renda de cada um",
      "Extrato do FGTS de cada um",
      "Declaração do Imposto de Renda de cada um (com recibo)",
    ];
  }
  return [...DOCUMENTOS_PADRAO];
}

/** Abaixo disto, foto de documento costuma sair ilegível para o banco. */
export const LADO_MINIMO_LEGIVEL = 900;

/** O aviso para o corretor, ou `null` se a foto tem resolução para ler. */
export function alertaDeResolucao(largura: number | undefined, altura: number | undefined): string | null {
  if (!largura || !altura) return null;
  const menor = Math.min(largura, altura);
  if (menor >= LADO_MINIMO_LEGIVEL) return null;
  return `Foto pequena (${largura}×${altura}): pode estar ilegível para o banco. Confira antes de mandar.`;
}

/** Itens da lista que ainda não têm nenhum arquivo. */
export function documentosQueFaltam(itens: string[], recebidos: string[]): string[] {
  const tem = new Set(recebidos);
  return itens.filter((i) => !tem.has(i));
}

export const TETO_DOCUMENTO_BYTES = 10 * 1024 * 1024;
export const TETO_DOCUMENTOS_POR_LINK = 40;
export const MIMES_ACEITOS = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;
export const IMOVEIS_NA_SELECAO = 3;

export function caminhoDoLink(tipo: TipoDeLink, token: string): string {
  return `/${tipo}/${token}`;
}

export function mensagemParaCliente(p: {
  tipo: TipoDeLink;
  primeiroNome: string | null;
  url: string;
}): string {
  const oi = p.primeiroNome ? `Oi, ${p.primeiroNome}!` : "Oi!";
  if (p.tipo === "selecao") {
    return `${oi} Separei os imóveis que mais combinam com o que você me contou, com a simulação do financiamento: ${p.url}`;
  }
  if (p.tipo === "portal") {
    return `${oi} Criei a sua página de acompanhamento: o andamento da obra, os documentos que você já mandou e os próximos passos até as chaves. Guarde este link: ${p.url}`;
  }
  if (p.tipo === "proposta") {
    return `${oi} Preparei a proposta que conversamos. Dá uma olhada com calma e me diz por ali mesmo: ${p.url}`;
  }
  return `${oi} Para darmos entrada no financiamento, envie os documentos por este link, direto do celular: ${p.url}`;
}

/** Nome de arquivo seguro para o Storage: sem acento, sem barra, curto. */
export function nomeSeguro(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-80);
  return base || "arquivo";
}

export function problemaDoArquivo(arquivo: { size: number; type: string }): string | null {
  if (arquivo.size <= 0) return "O arquivo está vazio.";
  if (arquivo.size > TETO_DOCUMENTO_BYTES) return "O arquivo passa de 10 MB. Tire uma foto ou mande o PDF menor.";
  if (!(MIMES_ACEITOS as readonly string[]).includes(arquivo.type)) {
    return "Formato não aceito. Envie PDF ou foto (JPG, PNG, WEBP ou HEIC).";
  }
  return null;
}

export function linkValido(link: { expira_em: string } | null, agora = new Date()): boolean {
  return Boolean(link) && new Date(link!.expira_em).getTime() > agora.getTime();
}

export type TipoDeEventoDoLink =
  | "abriu"
  | "clicou"
  | "documento"
  | "documentos_completos"
  | "aceitou"
  | "quer_conversar";

/**
 * O aviso que chega no WhatsApp do corretor quando o cliente age no link.
 * `null` para o que não vira aviso (clique em imóvel e documento do meio da
 * lista ficam só na ficha). O nome é o do CRM — o aviso vai para o corretor,
 * não para o cliente, então aqui ele pode aparecer inteiro.
 */
export function textoDoAvisoDoLink(p: {
  tipo: TipoDeEventoDoLink;
  nome: string | null;
  detalhe: string | null;
  fichaUrl: string;
}): string | null {
  const quem = p.nome?.trim() || "Seu cliente";
  if (p.tipo === "abriu") {
    return `👀 ${quem} abriu agora ${p.detalhe ?? "a seleção de imóveis que você mandou"}. É um bom momento para puxar conversa.\n${p.fichaUrl}`;
  }
  if (p.tipo === "documento") {
    return `📄 ${quem} começou a mandar os documentos${p.detalhe ? ` (${p.detalhe})` : ""}.\n${p.fichaUrl}`;
  }
  if (p.tipo === "aceitou") {
    return `🎉 ${quem} ACEITOU a proposta${p.detalhe ? ` (${p.detalhe})` : ""}. Hora de preparar a documentação.\n${p.fichaUrl}`;
  }
  if (p.tipo === "quer_conversar") {
    return `💬 ${quem} viu a proposta e quer conversar antes de decidir. Ligue enquanto ela está fresca.\n${p.fichaUrl}`;
  }
  if (p.tipo === "documentos_completos") {
    return `✅ ${quem} mandou todos os documentos pedidos. Confira na ficha antes de levar ao banco.\n${p.fichaUrl}`;
  }
  return null;
}
