import { compatibilidade, type ImovelParaCompatibilidade } from "./compatibilidade";

/**
 * "Me avise quando surgir" (26/09/2026): o visitante que não achou o imóvel
 * certo deixa o que procura e o WhatsApp. Quando entra no catálogo um imóvel
 * que combina, a assistente avisa ELE — não só o corretor.
 *
 * Esta parte é pura: decide qual imóvel novo avisar. O envio mora em
 * `avisoDeNovidade.ts`, que passa pelas travas de todo contato por
 * iniciativa nossa.
 */

export type CriteriosDoAlerta = {
  regiao_interesse: string | null;
  dormitorios_min: number | null;
  orcamento_max: number | string | null;
};

export type ImovelNovo = ImovelParaCompatibilidade & { id: string; nome: string; slug: string };

/** O pedido de aviso que o formulário grava em `leads.detalhes`. */
export function lerAlerta(detalhes: unknown): { ativo: boolean; avisados: string[] } {
  if (!detalhes || typeof detalhes !== "object") return { ativo: false, avisados: [] };
  const d = detalhes as { alerta?: unknown; avisados?: unknown };
  const avisados = Array.isArray(d.avisados) ? d.avisados.filter((x): x is string => typeof x === "string") : [];
  return { ativo: d.alerta === true, avisados };
}

/**
 * O primeiro imóvel novo que combina e ainda não foi avisado. Um por vez de
 * propósito: três imóveis numa mensagem é o desfile que a IA foi ensinada a
 * não fazer.
 */
export function imovelParaAvisar(
  criterios: CriteriosDoAlerta,
  novos: ImovelNovo[],
  avisados: string[],
): ImovelNovo | null {
  const orcamento = criterios.orcamento_max != null && Number(criterios.orcamento_max) > 0 ? Number(criterios.orcamento_max) : null;
  const perfil = {
    regiaoInteresse: criterios.regiao_interesse,
    dormitoriosMin: criterios.dormitorios_min,
    orcamentoMax: orcamento,
  };
  const ja = new Set(avisados);
  let melhor: { imovel: ImovelNovo; pontos: number } | null = null;
  for (const imovel of novos) {
    if (ja.has(imovel.id)) continue;
    const c = compatibilidade(perfil, imovel);
    if (!c.combina) continue;
    if (!melhor || c.pontos > melhor.pontos) melhor = { imovel, pontos: c.pontos };
  }
  return melhor?.imovel ?? null;
}

/** O que a pessoa pediu, em palavras, para a mensagem lembrar. */
export function descreverPedido(c: CriteriosDoAlerta): string {
  const partes: string[] = [];
  if (c.dormitorios_min) partes.push(`${c.dormitorios_min}+ dormitórios`);
  if (c.regiao_interesse) partes.push(`em ${c.regiao_interesse}`);
  const orc = c.orcamento_max != null ? Number(c.orcamento_max) : 0;
  if (orc > 0) partes.push(`até R$ ${Math.round(orc / 1000).toLocaleString("pt-BR")} mil`);
  return partes.join(", ") || "o imóvel que você procurava";
}

export function instrucaoDoAviso(p: { nome: string | null; pedido: string; imovel: string; link: string }): string {
  const nome = p.nome?.split(" ")[0] ?? "";
  return [
    `Esta é a PRIMEIRA mensagem para ${nome || "este cliente"}, que pediu pelo site para ser avisado quando surgisse um imóvel com ${p.pedido}.`,
    `Avise, em uma mensagem curta e natural, que acabou de entrar o ${p.imovel}, que combina com o que ele pediu, e mande o link da apresentação: ${p.link}`,
    "Lembre que foi ele quem pediu o aviso (numa frase). Termine com UMA pergunta simples: se quer ver fotos ou conhecer. Não fale valores.",
  ].join(" ");
}
