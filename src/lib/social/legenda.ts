import type { Empreendimento } from "@/lib/types";
import { STATUS_LABEL } from "@/lib/types";
import { resumoDeTipologias } from "./carrossel";

/**
 * A legenda do post e as hashtags.
 *
 * ## Sem valor, e a razão é a permanência
 *
 * A regra da casa liberou o PISO na conversa (v28) porque lá o corretor
 * acompanha e corrige. Um post é diferente: fica no ar, a tabela muda, e a
 * imagem não se edita depois de publicada. Valor desatualizado numa peça
 * pública vira reclamação meses depois — e a promessa que o cliente guarda
 * é sempre a que ele leu primeiro.
 *
 * É decisão reversível: se a imobiliária quiser anunciar o piso, o lugar é
 * aqui, com a mesma validação contra o catálogo que `semValores` faz.
 *
 * ## Sem prazo que não esteja cadastrado
 *
 * Mesma regra do atendimento, e aqui ela pesa mais: prazo de entrega é a
 * promessa mais cara do negócio, e num post ela fica escrita.
 */

/** Hashtags que não mudam — a marca e o mercado onde ela atua. */
const FIXAS = ["#nexthome", "#lancamento", "#imoveisalphaville", "#barueri"];

function comoHashtag(texto: string): string {
  const limpo = texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return limpo ? `#${limpo}` : "";
}

/**
 * As hashtags do post: as fixas mais bairro, cidade e construtora.
 *
 * Sem repetição e sem vazia — hashtag duplicada é o tipo de detalhe que
 * denuncia post gerado por máquina.
 */
export function hashtagsDe(imovel: Empreendimento): string[] {
  const derivadas = [imovel.bairro, imovel.cidade, imovel.construtora ?? ""]
    .map(comoHashtag)
    .filter(Boolean);

  return [...new Set([...FIXAS, ...derivadas])];
}

export function legendaDoPost(params: {
  imovel: Empreendimento;
  linkDaChamada: string;
  nomeCorretor: string;
}): string {
  const { imovel } = params;

  const linhas: string[] = [`${imovel.nome} — ${imovel.bairro}, ${imovel.cidade}`, ""];

  const tipologias = resumoDeTipologias(imovel);
  if (tipologias) linhas.push(tipologias);

  linhas.push(STATUS_LABEL[imovel.status]);

  /*
   * A data só entra quando está cadastrada. Sem ela o post fala do ESTÁGIO
   * ("Em construção"), que é verdade e não promete mês nenhum.
   */
  if (imovel.entregaPrevista) linhas.push(`Entrega prevista: ${imovel.entregaPrevista}`);

  if (imovel.tagline?.trim()) linhas.push("", imovel.tagline.trim());

  linhas.push(
    "",
    `Quer conhecer? Fale comigo — ${params.nomeCorretor}`,
    params.linkDaChamada,
    "",
    hashtagsDe(imovel).join(" "),
  );

  return linhas.join("\n");
}
