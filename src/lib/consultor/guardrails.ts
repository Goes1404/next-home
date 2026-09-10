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
  /**
   * O que o CORRETOR acabou de informar (renda, entrada, FGTS, valor).
   *
   * Repetir o número que ele deu é o contrário de inventar — é o que faz a
   * resposta parecer que ouviu. Sem isto, a sonda com API de 09/09/2026
   * mostrou a frase "com R$ 40.000 de entrada e R$ 30.000 de FGTS" sendo
   * cortada inteira: a rede de segurança reprovando o comportamento CERTO,
   * que é o defeito mais antigo desta base.
   */
  doCorretor?: Partial<Record<"rendaMensal" | "entrada" | "fgts" | "valorImovel", number>> | null,
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
  const dele = doCorretor ? Object.values(doCorretor) : [];
  /*
   * O saldo a financiar também é dele: sai de uma subtração entre números que
   * ele deu, e é a frase mais natural que existe ("sobra financiar X").
   */
  const saldo =
    doCorretor?.valorImovel !== undefined
      ? [
          doCorretor.valorImovel -
            (doCorretor.entrada ?? 0) -
            (doCorretor.fgts ?? 0),
        ]
      : [];

  return [...doBloco, ...daConta, ...dele, ...saldo].filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0,
  );
}

/**
 * "R$ 55.000" → 55000; "4,5%" → 4.5; **"350 mil" → 350000**.
 *
 * A escala por extenso não é detalhe: ninguém escreve "R$ 350.000,00" numa
 * conversa, escreve "350 mil" — inclusive o corretor, e a IA repete como ele
 * falou. Sem isto o extrator lia 350, comparava com os 350.000 do bloco e
 * cortava a frase CERTA. Achado lendo a transcrição de uma sonda com API,
 * não em teste: nenhum caso escrito à mão usava a forma que gente usa.
 */
function numerosDaFrase(frase: string): number[] {
  const achados =
    frase.match(
      /(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)(\s*(?:milh(?:ão|ões|ao|oes)|mil))?/gi,
    ) ?? [];

  return achados
    .map((t) => {
      const escala = /milh/i.test(t) ? 1_000_000 : /\bmil\b/i.test(t) ? 1_000 : 1;
      const so = t.replace(/\s*(?:milh(?:ão|ões|ao|oes)|mil)/i, "");
      return Number(so.replace(/\./g, "").replace(",", ".")) * escala;
    })
    .filter((n) => Number.isFinite(n));
}

/** Tolerância de 1% absorve quem arredondou "R$ 2.431,55" para "R$ 2.432". */
function estaPermitido(n: number, permitidos: number[]): boolean {
  return permitidos.some((p) => Math.abs(p - n) <= Math.max(1, p * 0.01));
}

/**
 * Exportado porque a TELEMETRIA precisa saber que houve corte: é o número que
 * responde "com que frequência a IA tenta citar crédito que não tem", e sem
 * ele não dá para distinguir prompt bom de guardrail trabalhando dobrado.
 */
export const DESVIO_DE_CREDITO =
  "Esse número eu não tenho conferido aqui — confira na fonte antes de passar pro cliente.";

/** O texto já cortado terminou no desvio? Só quem cortou o acrescenta. */
export function houveCorte(texto: string): boolean {
  return texto.endsWith(DESVIO_DE_CREDITO);
}

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

  if (cortou) saida.push(DESVIO_DE_CREDITO);
  return saida.join(" ").replace(/[ \t]+/g, " ").trim();
}
