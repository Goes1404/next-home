import { createHash } from "node:crypto";
import { gerarBlur, medirImagem } from "./imagemDerivada";

/**
 * Único caminho de gravação de mídia de empreendimento — upload avulso do
 * editor, imagem tirada do PDF e arquivo trazido do Drive passam todos
 * por aqui.
 *
 * Existe porque o insert que havia antes gravava `largura: 1920, altura:
 * 1080` CHUMBADOS e nunca preenchia `blur_data_url`. Os dois campos são
 * lidos por oito componentes da vitrine: a dimensão errada faz o layout
 * saltar quando a imagem chega, e o blur nulo dá flash branco. O defeito
 * nunca apareceu porque nenhuma foto tinha subido por esse caminho ainda
 * (as 286 de produção vieram de seed e backfill) — e é justamente ele que a
 * importação em massa vai usar. Com três origens de entrada, o insert
 * espalhado repetiria o erro em três lugares.
 *
 * As dependências entram por parâmetro para o teste rodar sem Supabase.
 */

export type LinhaMidiaNova = {
  empreendimento_id: string;
  tipo: "foto" | "planta";
  url: string;
  alt: string;
  largura: number | null;
  altura: number | null;
  blur_data_url: string | null;
  ordem: number;
  hash_conteudo: string;
};

export type DepsMidia = {
  subir(caminho: string, bytes: Buffer, contentType: string): Promise<{ erro: string | null }>;
  urlPublica(caminho: string): string;
  /** `duplicada` = o índice único de (empreendimento, hash) recusou. */
  inserir(linha: LinhaMidiaNova): Promise<{ id: string | null; duplicada: boolean; erro: string | null }>;
};

export type EntradaMidia = {
  empreendimentoId: string;
  bytes: Buffer;
  mime: string;
  tipo: "foto" | "planta";
  alt: string;
  ordem?: number;
};

export type ResultadoRegistro =
  | {
      ok: true;
      id: string | null;
      duplicada: boolean;
      url: string;
      /** Devolvidas para a tela montar o card sem reconsultar o banco. */
      largura: number | null;
      altura: number | null;
      blurDataUrl: string | null;
    }
  | { ok: false; erro: string };

function extensaoDe(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export async function registrarMidia(deps: DepsMidia, entrada: EntradaMidia): Promise<ResultadoRegistro> {
  const hash = createHash("sha256").update(entrada.bytes).digest("hex");

  // Medida e blur não impedem a foto de entrar: arquivo exótico entra com os
  // campos nulos, que é como a vitrine já sabe se comportar.
  const [medida, blur] = await Promise.all([medirImagem(entrada.bytes), gerarBlur(entrada.bytes)]);

  // O hash no nome do arquivo faz o upload ser idempotente: reenviar o mesmo
  // conteúdo escreve por cima do mesmo caminho, em vez de encher o bucket
  // com cópias que ninguém vai apagar.
  const caminho = `empreendimentos/${entrada.empreendimentoId}/${entrada.tipo}-${hash.slice(0, 16)}.${extensaoDe(entrada.mime)}`;

  const upload = await deps.subir(caminho, entrada.bytes, entrada.mime);
  if (upload.erro) {
    console.error("Erro ao subir mídia para o Storage:", upload.erro);
    return { ok: false, erro: "Não consegui enviar o arquivo. Tente de novo." };
  }

  const url = deps.urlPublica(caminho);
  const insercao = await deps.inserir({
    empreendimento_id: entrada.empreendimentoId,
    tipo: entrada.tipo,
    url,
    alt: entrada.alt.trim(),
    largura: medida?.largura ?? null,
    altura: medida?.altura ?? null,
    blur_data_url: blur,
    ordem: entrada.ordem ?? 10,
    hash_conteudo: hash,
  });

  if (insercao.erro) {
    return { ok: false, erro: "O arquivo subiu, mas não consegui registrar no catálogo." };
  }

  return {
    ok: true,
    id: insercao.id,
    duplicada: insercao.duplicada,
    url,
    largura: medida?.largura ?? null,
    altura: medida?.altura ?? null,
    blurDataUrl: blur,
  };
}
