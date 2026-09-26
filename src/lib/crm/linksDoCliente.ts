/**
 * Links que o corretor manda ao cliente (26/09/2026): a seleção
 * personalizada e o envio de documentos do financiamento.
 *
 * O token (uuid aleatório) é a credencial: quem tem o link vê a seleção ou
 * envia documentos. Por isso ele expira em 30 dias, a página é `noindex`, e
 * nada do CRM aparece nela além do primeiro nome do cliente.
 */

export type TipoDeLink = "documentos" | "selecao";

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
  return `/${tipo === "selecao" ? "selecao" : "documentos"}/${token}`;
}

export function mensagemParaCliente(p: {
  tipo: TipoDeLink;
  primeiroNome: string | null;
  url: string;
}): string {
  const oi = p.primeiroNome ? `Oi, ${p.primeiroNome}!` : "Oi!";
  return p.tipo === "selecao"
    ? `${oi} Separei os imóveis que mais combinam com o que você me contou, com a simulação do financiamento: ${p.url}`
    : `${oi} Para darmos entrada no financiamento, envie os documentos por este link, direto do celular: ${p.url}`;
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
