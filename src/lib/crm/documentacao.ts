/**
 * A documentação do lead (0179, 16/10/2026): o que falta, o que chegou, o que
 * foi conferido e o que voltou para o cliente refazer.
 *
 * Módulo PURO: sem banco e sem rede. A ficha, a página pública do cliente e o
 * aviso ao corretor fazem a MESMA conta por aqui — duas contas de "o que
 * falta" divergem, e aí a ficha diz completo enquanto o cliente vê pendência.
 */
import { chegouEm, type EtapaFunil } from "@/lib/types";
import { documentosDoPerfil, PERFIS_DE_DOCUMENTO, type PerfilDeDocumento } from "./linksDoCliente";

/**
 * Duas listas por lead. A do financiamento é a que o banco pede; a do
 * contrato é a da construtora, depois da aprovação. Itens com o mesmo nome
 * nas duas não se confundem porque cada arquivo guarda a fase.
 */
export const FASES_DOCUMENTO = ["financiamento", "contrato"] as const;
export type FaseDocumento = (typeof FASES_DOCUMENTO)[number];
export const FASE_DOCUMENTO_LABEL: Record<FaseDocumento, string> = {
  financiamento: "Financiamento",
  contrato: "Contrato",
};

/** O ponto de partida da lista do contrato. O corretor tira e põe o que a construtora pedir. */
export const DOCUMENTOS_DO_CONTRATO = [
  "Proposta assinada",
  "Comprovante do sinal",
  "Ficha cadastral da construtora",
  "Certidão de estado civil atualizada (até 90 dias)",
  "Carta de aprovação do crédito",
  "Contrato de compra e venda assinado",
] as const;

export function itensIniciais(fase: FaseDocumento, perfil?: string | null): string[] {
  if (fase === "contrato") return [...DOCUMENTOS_DO_CONTRATO];
  const p = (PERFIS_DE_DOCUMENTO as readonly string[]).includes(perfil ?? "") ? (perfil as PerfilDeDocumento) : "clt";
  return documentosDoPerfil(p);
}

export function ehFase(valor: unknown): valor is FaseDocumento {
  return typeof valor === "string" && (FASES_DOCUMENTO as readonly string[]).includes(valor);
}

export const SITUACOES_DOCUMENTO = ["recebido", "conferido", "recusado"] as const;
export type SituacaoDocumento = (typeof SITUACOES_DOCUMENTO)[number];

/** Motivos de um toque. O corretor também pode escrever o dele. */
export const MOTIVOS_DE_RECUSA = [
  "Ilegível",
  "Vencido",
  "Falta o verso",
  "Documento errado",
  "Cortado na foto",
] as const;

export const TETO_ITEM = 120;
export const TETO_MOTIVO = 200;
export const TETO_ITENS_NA_LISTA = 30;

/** Item digitado pelo corretor: sem espaço sobrando e com teto. `null` se vazio. */
export function normalizarItem(texto: string): string | null {
  const limpo = texto.replace(/\s+/g, " ").trim().slice(0, TETO_ITEM);
  return limpo || null;
}

export function normalizarMotivo(texto: string): string | null {
  const limpo = texto.replace(/\s+/g, " ").trim().slice(0, TETO_MOTIVO);
  return limpo || null;
}

/** Comparar item ignorando caixa e acento: "rg ou cnh" e "RG ou CNH" são o mesmo pedido. */
export function mesmoItem(a: string, b: string): boolean {
  const chave = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  return chave(a) === chave(b);
}

/**
 * A lista que vale para o lead naquela fase. A gravada no lead ganha; sem
 * ela, os itens do último link de documentos (o jeito antigo, quando a lista
 * morava só no link) — senão nenhum documento de antes da 0179 teria lista.
 */
export function listaEfetiva(p: { gravada: string[] | null; doLink: string[] | null }): string[] {
  if (p.gravada) return p.gravada;
  return p.doLink ?? [];
}

export type DocumentoDaLista = {
  id: string;
  item: string;
  situacao: SituacaoDocumento;
  motivoRecusa: string | null;
  criadoEm: string;
};

export type SituacaoDoItem = "falta" | "recebido" | "conferido" | "recusado";

/**
 * A situação do item pelos arquivos dele. Um conferido basta; recusado só
 * quando TODOS os arquivos do item foram recusados — se o cliente mandou de
 * novo depois da recusa, o item volta a "recebido", esperando conferência.
 */
export function situacaoDoItem(arquivos: Pick<DocumentoDaLista, "situacao">[]): SituacaoDoItem {
  if (arquivos.length === 0) return "falta";
  if (arquivos.some((a) => a.situacao === "conferido")) return "conferido";
  if (arquivos.some((a) => a.situacao === "recebido")) return "recebido";
  return "recusado";
}

export type ItemComSituacao = {
  item: string;
  situacao: SituacaoDoItem;
  arquivos: DocumentoDaLista[];
  /** O motivo da recusa mais recente, quando o item está recusado. */
  motivo: string | null;
};

export type ResumoDaLista = {
  itens: ItemComSituacao[];
  /** Arquivos cujo item saiu da lista: continuam na ficha, não se perdem. */
  avulsos: DocumentoDaLista[];
  conferidos: number;
  /** Esperando o corretor olhar. */
  aConferir: number;
  /** Falta ou recusado: o que o cliente ainda precisa mandar. */
  pendentesDoCliente: string[];
  /** Todo item da lista com arquivo e nenhum recusado (pode faltar conferir). */
  completa: boolean;
  /** Todo item conferido. É a lista pronta para levar ao banco. */
  pronta: boolean;
};

export function resumirLista(itens: string[], documentos: DocumentoDaLista[]): ResumoDaLista {
  const porItem = itens.map((item) => {
    const arquivos = documentos
      .filter((d) => mesmoItem(d.item, item))
      .sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
    const situacao = situacaoDoItem(arquivos);
    const motivo = situacao === "recusado" ? (arquivos.find((a) => a.motivoRecusa)?.motivoRecusa ?? null) : null;
    return { item, situacao, arquivos, motivo };
  });
  const avulsos = documentos.filter((d) => !itens.some((i) => mesmoItem(i, d.item)));
  const pendentesDoCliente = porItem.filter((i) => i.situacao === "falta" || i.situacao === "recusado").map((i) => i.item);
  return {
    itens: porItem,
    avulsos,
    conferidos: porItem.filter((i) => i.situacao === "conferido").length,
    aConferir: porItem.filter((i) => i.situacao === "recebido").length,
    pendentesDoCliente,
    completa: itens.length > 0 && pendentesDoCliente.length === 0,
    pronta: itens.length > 0 && porItem.every((i) => i.situacao === "conferido"),
  };
}

/**
 * Sugerir "mover para Documentação" (item 7). Só sugere: mover é ato do
 * corretor (`etapaAutomatica.test.ts`). Faz sentido quando a lista do
 * financiamento está pronta e o lead ainda não chegou lá; lead perdido não
 * ganha sugestão — reabrir é outra decisão.
 */
export function sugereDocumentacao(etapa: EtapaFunil, financiamentoPronto: boolean): boolean {
  if (!financiamentoPronto) return false;
  if (etapa === "perdido") return false;
  return !chegouEm(etapa, "documentacao");
}

const EXTENSAO_POR_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

/** Nome sem caractere que o Windows recusa e sem acento quebrado no zip. */
function nomeDeArquivoLimpo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/**
 * Os nomes dentro do .zip (item 6): numerados na ordem da lista, com o nome
 * do item, para quem abrir no banco achar o RG sem abrir sete arquivos.
 * Dois arquivos do mesmo item ganham "(2)", "(3)".
 */
export function nomesNoZip(
  arquivos: { item: string; posicao: number; mime: string | null; nomeArquivo: string | null }[],
): string[] {
  const usados = new Map<string, number>();
  return arquivos.map((a) => {
    const ext =
      (a.mime && EXTENSAO_POR_MIME[a.mime]) ||
      a.nomeArquivo?.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase() ||
      "bin";
    const base = `${String(a.posicao).padStart(2, "0")} - ${nomeDeArquivoLimpo(a.item) || "documento"}`;
    const vez = (usados.get(base) ?? 0) + 1;
    usados.set(base, vez);
    return `${base}${vez > 1 ? ` (${vez})` : ""}.${ext}`;
  });
}

export function nomeDoZip(nomeDoLead: string, fase: FaseDocumento): string {
  const primeiro = nomeDeArquivoLimpo(nomeDoLead.trim().split(/\s+/)[0] ?? "").replace(/\s+/g, "-") || "cliente";
  return `documentos-${primeiro.toLowerCase()}-${fase}.zip`;
}

/**
 * A mensagem que o corretor manda quando recusa um documento. Não sai
 * sozinha: abre o WhatsApp dele com o texto pronto — quem fala com o
 * cliente é o corretor.
 */
export function mensagemDeRecusa(p: {
  primeiroNome: string | null;
  item: string;
  motivo: string;
  url: string | null;
}): string {
  const oi = p.primeiroNome ? `Oi, ${p.primeiroNome}!` : "Oi!";
  const como = p.url ? ` Pode mandar de novo pelo mesmo link: ${p.url}` : " Pode me mandar de novo por aqui?";
  return `${oi} O documento "${p.item}" não deu para usar (${p.motivo.toLowerCase()}).${como}`;
}

/** A frase da situação, do jeito que o CLIENTE lê na página do link. */
export function situacaoParaCliente(s: SituacaoDoItem): string {
  if (s === "conferido") return "Conferido";
  if (s === "recebido") return "Enviado — aguardando conferência";
  if (s === "recusado") return "Precisa enviar de novo";
  return "Falta enviar";
}
