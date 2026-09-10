/**
 * O imóvel do catálogo virando fatos que podem entrar num prompt pago.
 *
 * ## Por que este módulo existe
 *
 * Em 09/09/2026 uma geração real levou ao provedor, literalmente:
 *
 *     Apartamento chamado "." em ., Barueri no estágio "Lançamento"
 *
 * O nome e o bairro do cadastro eram um ponto final, e o montador de prompt os
 * interpolou sem olhar. Custou uma imagem paga e devolveu um prédio genérico —
 * e o pior é que ninguém teria notado, porque a imagem SAIU.
 *
 * A regra é uma só e vale para todo campo: **o que não tem conteúdo não
 * entra**. Nem vazio, nem só espaço, nem pontuação solta. Módulo PURO para
 * isso ser testável sem rede, que é onde esta classe de defeito se pega.
 *
 * ## Rótulo humano, nunca o enum
 *
 * A mesma lição que a Sofia já pagou: com `em_construcao` na ficha, o modelo
 * afirmou ao cliente que o imóvel estava "pronto para morar" — informação que
 * ele conferiria na visita. `STATUS_LABEL` resolve, e status desconhecido
 * simplesmente não vira fato: enum novo não pode vazar cru para dentro de uma
 * imagem.
 */
import { STATUS_LABEL } from "@/lib/types";

export type ImovelParaPrompt = {
  nome: string | null;
  bairro: string | null;
  cidade: string | null;
  status: string | null;
  construtora: string | null;
  tipologias: { areaPrivativa: number | null; dormitorios: number | null; vagas: number | null }[];
  lazer: string[];
};

/**
 * Só passa o que é conteúdo.
 *
 * O recorte de letra-ou-número existe por causa do caso real: `"."` é uma
 * string não vazia e teria passado por qualquer checagem de `!!valor` ou de
 * `.trim().length > 0`.
 */
function vale(v: string | null | undefined): v is string {
  const t = (v ?? "").trim();
  return t.length > 0 && /[\p{L}\p{N}]/u.test(t);
}

function numero(n: number | null | undefined): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

export function fatosDoImovel(imovel: ImovelParaPrompt): string[] {
  const fatos: string[] = [];

  if (vale(imovel.nome)) fatos.push(`Empreendimento: ${imovel.nome.trim()}`);

  const local = [imovel.bairro, imovel.cidade].filter(vale).map((s) => s.trim());
  if (local.length > 0) fatos.push(`Local: ${local.join(", ")}`);

  if (vale(imovel.status)) {
    const rotulo = STATUS_LABEL[imovel.status as keyof typeof STATUS_LABEL];
    if (vale(rotulo)) fatos.push(`Estágio: ${rotulo}`);
  }

  if (vale(imovel.construtora)) fatos.push(`Construtora: ${imovel.construtora.trim()}`);

  const tipologias = imovel.tipologias
    .map((t) => {
      const partes: string[] = [];
      if (numero(t.areaPrivativa)) partes.push(`${t.areaPrivativa} m²`);
      if (numero(t.dormitorios)) partes.push(`${t.dormitorios} dorm.`);
      if (numero(t.vagas)) partes.push(`${t.vagas} vaga(s)`);
      return partes.join(" · ");
    })
    .filter((s) => s.length > 0);
  if (tipologias.length > 0) fatos.push(`Tipologias: ${tipologias.join(" | ")}`);

  const lazer = imovel.lazer.filter(vale).map((s) => s.trim());
  if (lazer.length > 0) fatos.push(`Lazer que EXISTE: ${lazer.join(", ")}`);

  return fatos;
}
