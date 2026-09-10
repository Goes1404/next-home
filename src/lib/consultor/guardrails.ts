import type { Empreendimento } from "@/lib/types";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import { MAX_CARTOES } from "./contrato";

/**
 * As duas redes de segurança da resposta — módulo PURO.
 *
 * Instrução de prompt é probabilística e falha justo na resposta que importa;
 * função determinística vale sempre e é testável. É a mesma lição do
 * `vozHumana`, do `resolverMidia` e do `semValores`.
 */

/** Só slug que EXISTE vira cartão. O resto some antes de chegar à tela. */
export function slugsValidos(slugs: string[], catalogo: Empreendimento[]): string[] {
  const existem = new Set(catalogo.map((e) => e.slug));
  const vistos = new Set<string>();
  const bons: string[] = [];
  for (const s of slugs) {
    const limpo = s.trim();
    if (!existem.has(limpo) || vistos.has(limpo)) continue;
    vistos.add(limpo);
    bons.push(limpo);
    if (bons.length === MAX_CARTOES) break;
  }
  return bons;
}

/** O que faz de um número um número de CRÉDITO. */
const ASSUNTO_DE_CREDITO =
  /(mcmv|minha casa|faixa|subs[ií]dio|fgts|itbi|financia|juros|taxa|parcela|entrada|renda|presta[çc][ãa]o)/i;

/** Números que a resposta pode citar sem conferência: os do bloco + os da conta. */
export function numerosPermitidos(
  params: ParametrosCredito,
  simulacao: { parcelaEstimada?: number; itbi?: number; subsidio?: number } | null,
): number[] {
  const doBloco = [
    ...params.faixas.flatMap((f) => [f.rendaMax, f.subsidioMaximo, f.taxaAnual * 100]),
    params.tetoFgtsImovel,
    params.taxaSbpeAnual * 100,
    params.prazoMaximoMeses,
    params.comprometimentoMaximo * 100,
    ...Object.values(params.itbiPorCidade).map((a) => a * 100),
  ];
  /*
   * Os números da conta daquele turno entram: sem isso o guardrail cortaria a
   * própria simulação que o código acabou de calcular — a resposta certa
   * sendo apagada pela rede de segurança, que é como quatro critérios desta
   * base já reprovaram o comportamento CERTO.
   */
  const daConta = simulacao
    ? [simulacao.parcelaEstimada ?? 0, simulacao.itbi ?? 0, simulacao.subsidio ?? 0]
    : [];
  return [...doBloco, ...daConta].filter((n) => Number.isFinite(n) && n > 0);
}

/** "R$ 55.000" → 55000; "4,5%" → 4.5. */
function numerosDaFrase(frase: string): number[] {
  const achados = frase.match(/\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?/g) ?? [];
  return achados
    .map((t) => Number(t.replace(/\./g, "").replace(",", ".")))
    .filter((n) => Number.isFinite(n));
}

/** Tolerância de 1% absorve quem arredondou "R$ 2.431,55" para "R$ 2.432". */
function estaPermitido(n: number, permitidos: number[]): boolean {
  return permitidos.some((p) => Math.abs(p - n) <= Math.max(1, p * 0.01));
}

const DESVIO =
  "Esse número eu não tenho conferido aqui — confira na fonte antes de passar pro cliente.";

/**
 * Corta a FRASE inteira quando ela afirma número de crédito que não confere.
 *
 * Frase, não o número: apagar só o algarismo deixaria "o subsídio chega a" e
 * pareceria defeito — a mesma escolha do `semValores.ts`. E só frase que fala
 * de CRÉDITO entra na régua: metragem, dormitório e ano de entrega não são
 * afetados, senão a IA perderia a capacidade de descrever o imóvel (o defeito
 * que o `afirmaPrazo` teve até a v24).
 */
export function cortarCreditoInventado(texto: string, permitidos: number[]): string {
  const frases = texto.split(/(?<=[.!?])\s+/);
  let cortou = false;

  const saida = frases.filter((frase) => {
    if (!ASSUNTO_DE_CREDITO.test(frase)) return true;
    const temPercentual = /%/.test(frase);
    // Abaixo de 100 sem percentual não é valor de crédito: "3 dormitórios",
    // "2 vagas", "prazo de 30 dias" não podem cair na régua.
    const suspeitos = numerosDaFrase(frase).filter((n) => temPercentual || n >= 100);
    if (suspeitos.length === 0) return true;
    const ok = suspeitos.every((n) => estaPermitido(n, permitidos));
    if (!ok) cortou = true;
    return ok;
  });

  if (cortou) saida.push(DESVIO);
  return saida.join(" ").replace(/[ \t]+/g, " ").trim();
}
