import type { Empreendimento } from "@/lib/types";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import { tetoPelaRenda } from "@/lib/crm/compatibilidade";
import { normalizar } from "./normalizarFala";

/**
 * O que cabe no bolso do cliente, CALCULADO a partir da renda.
 *
 * Decisão do usuário, 29/09/2026: não se pergunta "qual faixa de valor você
 * tem em mente?". Pergunta-se a renda (ou, se ele não quiser dizer, a
 * profissão), e a faixa sai da conta. Quem faz a conta é o mesmo simulador
 * do site e do consultor (`tetoPelaRenda` → `simularFinanciamento`): duas
 * contas do mesmo financiamento divergiriam, e o cliente ouviria um número
 * no site e outro no WhatsApp.
 *
 * A profissão sozinha NÃO vira renda (regra 4b do prompt): deduzir salário
 * pelo cargo é chute, e o chute aqui indicaria um imóvel que ele não compra.
 *
 * Módulo puro: sem rede, sem banco, testável.
 */

/** A fala menciona renda, ou responde a uma pergunta de renda. */
const CONTEXTO_DE_RENDA =
  /\b(renda|ganho|ganha|ganhamos|ganham|recebo|recebe|recebemos|salario|salarios|por mes|mensal|mensais|liquido|bruto|somando|juntos)\b/;

/**
 * A renda mensal que o cliente disse, ou null.
 *
 * Só lê número quando a fala fala de renda, ou quando a IA acabou de
 * perguntar a renda: "pago 900 de aluguel" e "vi um de 400 mil" não são
 * renda. Aceita "2.500", "5 mil", "5,5 mil", "8k", "6000". Fora de 500 a
 * 200 mil por mês, não é renda mensal (é o preço do imóvel, ou digitação).
 */
export function rendaDaFala(texto: string, perguntouRenda: boolean): number | null {
  const n = normalizar(texto ?? "");
  if (/\baluguel\b/.test(n) && !/\b(renda|ganho|salario)\b/.test(n)) return null;
  if (!perguntouRenda && !CONTEXTO_DE_RENDA.test(n)) return null;

  const achados: number[] = [];
  for (const m of n.matchAll(/(\d{1,3}(?:[.\s]\d{3})+|\d+(?:,\d+)?)\s*(mil|k)?\b/g)) {
    const bruto = m[1];
    let valor = bruto.includes(",")
      ? Number(bruto.replace(",", "."))
      : Number(bruto.replace(/[.\s]/g, ""));
    if (m[2]) valor *= 1000;
    if (Number.isFinite(valor) && valor >= 500 && valor <= 200000) achados.push(valor);
  }
  if (achados.length === 0) return null;
  // "eu ganho 3 mil e minha esposa 2 mil, somando": soma quando ele diz que soma.
  if (achados.length > 1 && /\b(somando|juntos|soma|cada)\b/.test(n)) {
    return achados.reduce((a, b) => a + b, 0);
  }
  return achados[0];
}

/** A última renda que o cliente disse na conversa, lendo o histórico em ordem. */
export function rendaNaConversa(
  historico: readonly { remetente: string; texto: string }[],
  mensagemAtual: string,
): number | null {
  let renda: number | null = null;
  let ultimaDoBot = "";
  for (const fala of [...historico, { remetente: "cliente", texto: mensagemAtual }]) {
    if (fala.remetente === "bot") {
      ultimaDoBot = fala.texto;
      continue;
    }
    if (fala.remetente !== "cliente") continue;
    const perguntou = CONTEXTO_DE_RENDA.test(normalizar(ultimaDoBot)) && ultimaDoBot.includes("?");
    renda = rendaDaFala(fala.texto, perguntou) ?? renda;
  }
  return renda;
}

export type TetoDeCompra = { valor: number; origem: "renda" | "orcamento"; renda: number | null };

/**
 * O teto de imóvel: o orçamento que ELE disse vence (é a decisão dele); sem
 * orçamento, sai da renda pela conta do simulador, sem entrada nem FGTS — a
 * leitura conservadora, a mesma da compatibilidade do CRM.
 */
export function tetoDeCompra(
  perfil: { rendaMensal?: number | null; orcamentoMax?: number | null },
  params: ParametrosCredito,
): TetoDeCompra | null {
  if (perfil.orcamentoMax && perfil.orcamentoMax > 0) {
    return { valor: perfil.orcamentoMax, origem: "orcamento", renda: perfil.rendaMensal ?? null };
  }
  const teto = tetoPelaRenda(perfil.rendaMensal, params);
  return teto ? { valor: teto, origem: "renda", renda: perfil.rendaMensal ?? null } : null;
}

/** Os imóveis cujo "a partir de" cabe no teto. Sem piso cadastrado não entra. */
export function imoveisQueCabem(catalogo: readonly Empreendimento[], teto: number): Empreendimento[] {
  return catalogo.filter((e) => typeof e.precoAPartir === "number" && e.precoAPartir > 0 && e.precoAPartir <= teto);
}

/**
 * O bloco do prompt. O número do teto NÃO vai para o cliente: é estimativa
 * de crédito, e a IA não promete financiamento (a mesma regra de não falar
 * valor). Ela usa o teto para ESCOLHER o imóvel; quem mostra a simulação é o
 * corretor.
 */
export function blocoDeCapacidade(teto: TetoDeCompra, catalogo: readonly Empreendimento[]): string {
  const cabem = imoveisQueCabem(catalogo, teto.valor).map((e) => e.nome);
  const origem =
    teto.origem === "orcamento"
      ? "pelo valor que ELE disse que quer investir"
      : `pela renda de ${teto.renda?.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })} que ele informou, na conta do simulador de financiamento (sem entrada nem FGTS, a leitura conservadora)`;
  return [
    `CAPACIDADE DE COMPRA (calculada pelo código, ${origem}): imóveis de até cerca de ${teto.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}.`,
    cabem.length > 0
      ? `Do catálogo abaixo, CABEM: ${cabem.join(", ")}. Indique entre ESSES o que combina com a região e os dormitórios que ele pediu; se nenhum dos que cabem combina, diga com franqueza o que não bate (a cidade, os dormitórios) antes de oferecer.`
      : "NENHUM imóvel do catálogo abaixo cabe nesse valor. Não indique um que não cabe como se coubesse: diga com cuidado que as opções de agora ficam acima, e que com entrada ou FGTS a conta muda — o corretor faz a simulação com ele.",
    "NÃO diga esse valor ao cliente nem faça conta de financiamento na conversa: é estimativa, e quem mostra a simulação é o corretor. Use o número para ESCOLHER o imóvel certo.",
  ].join("\n");
}
