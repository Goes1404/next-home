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

/** Outra pessoa da casa cuja renda entra na conta. */
const OUTRA_PESSOA =
  /\b(marido|esposo|esposa|mulher|companheir[oa]|namorad[oa]|noiv[oa]|conjuge|pai|mae|filh[oa]|irma|irmao|socio|socia)\b/;

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
  /*
   * "eu ganho 3 mil e minha esposa 2 mil, somando": soma quando ele diz que
   * soma, ou quando cita OUTRA pessoa da casa. Produção, 01/10/2026: "1500 do
   * meu marido e 2644 meu" virava renda de 1500 (o primeiro número), e a IA
   * calculava o teto com pouco mais de um terço da renda da família.
   */
  if (achados.length > 1 && (/\b(somando|juntos|junto|soma|somado|cada)\b/.test(n) || OUTRA_PESSOA.test(n))) {
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

/** O que o cliente já disse que procura, para escolher entre os que cabem. */
export type PreferenciaDoCliente = { regiao?: string | null; dormitorios?: number | null };

export type EscolhaPorCapacidade = {
  /** Cabem no teto e combinam com a região e os dormitórios (quando ditos). */
  cabem: Empreendimento[];
  /** Cabem no teto, mas fora da região ou dos dormitórios que ele pediu. */
  cabemForaDoPedido: Empreendimento[];
  /** Nenhum cabe: os mais baratos acima do teto, dentro do pedido quando houver. */
  maisPerto: Empreendimento[];
  /** Quantos imóveis do pedido não têm "a partir de" cadastrado. */
  semPreco: number;
};

const MAX_POR_GRUPO = 3;

function casaComRegiao(e: Empreendimento, regiao: string): boolean {
  const r = normalizar(regiao);
  if (r.length < 4) return true;
  return [e.cidade, e.bairro].some((lugar) => {
    const l = normalizar(lugar ?? "");
    return l.length >= 4 && (r.includes(l) || l.includes(r));
  });
}

function casaComDormitorios(e: Empreendimento, dormitorios: number): boolean {
  // Sem planta cadastrada não dá para afirmar que não serve.
  if (!e.tipologias || e.tipologias.length === 0) return true;
  return e.tipologias.some((t) => t.dormitorios === dormitorios);
}

/**
 * Os imóveis que a renda alcança, escolhidos sobre o catálogo INTEIRO.
 *
 * Produção, 01/10/2026: com renda de R$ 4.144 (teto de ~R$ 251 mil), a IA
 * indicou um imóvel de R$ 457 mil como "o que chega mais perto" e, quando a
 * cliente pediu um mais em conta, outro de R$ 480 mil, com o Breeze (R$ 349,9
 * mil, mesma cidade, 2 dormitórios) fora do prompt. A conta corria só sobre os
 * imóveis que já estavam no prompt, e o bloco dizia "nenhum cabe" sem nomear o
 * mais próximo, então o modelo escolhia de cabeça.
 */
export function escolherPorCapacidade(
  catalogo: readonly Empreendimento[],
  teto: number,
  preferencia: PreferenciaDoCliente = {},
): EscolhaPorCapacidade {
  const combina = (e: Empreendimento) =>
    (!preferencia.regiao || casaComRegiao(e, preferencia.regiao)) &&
    (!preferencia.dormitorios || casaComDormitorios(e, preferencia.dormitorios));
  const comPreco = catalogo.filter((e) => typeof e.precoAPartir === "number" && e.precoAPartir > 0);
  const porPreco = (a: Empreendimento, b: Empreendimento) => (a.precoAPartir ?? 0) - (b.precoAPartir ?? 0);

  // Os que cabem saem do MAIS CARO para o mais barato: o mais caro que cabe é
  // o que tem mais imóvel pelo dinheiro dele.
  const todosQueCabem = comPreco.filter((e) => (e.precoAPartir ?? 0) <= teto).sort((a, b) => porPreco(b, a));
  const cabem = todosQueCabem.filter(combina).slice(0, MAX_POR_GRUPO);
  const cabemForaDoPedido = cabem.length > 0 ? [] : todosQueCabem.filter((e) => !combina(e)).slice(0, MAX_POR_GRUPO);

  let maisPerto: Empreendimento[] = [];
  if (cabem.length === 0) {
    const acima = comPreco.filter((e) => (e.precoAPartir ?? 0) > teto).sort(porPreco);
    const dentroDoPedido = acima.filter(combina);
    maisPerto = (dentroDoPedido.length > 0 ? dentroDoPedido : acima).slice(0, 2);
  }

  return {
    cabem,
    cabemForaDoPedido,
    maisPerto,
    semPreco: catalogo.filter((e) => !(typeof e.precoAPartir === "number" && e.precoAPartir > 0) && combina(e)).length,
  };
}

/** Os imóveis que o bloco nomeia: precisam estar no prompt com a ficha. */
export function imoveisDaEscolha(escolha: EscolhaPorCapacidade): Empreendimento[] {
  return [...escolha.cabem, ...escolha.cabemForaDoPedido, ...escolha.maisPerto];
}

const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * O bloco do prompt. O número do teto NÃO vai para o cliente: é estimativa
 * de crédito, e a IA não promete financiamento (a mesma regra de não falar
 * valor). Ela usa o teto para ESCOLHER o imóvel; quem mostra a simulação é o
 * corretor.
 */
export function blocoDeCapacidade(teto: TetoDeCompra, escolha: EscolhaPorCapacidade): string {
  const origem =
    teto.origem === "orcamento"
      ? "pelo valor que ELE disse que quer investir"
      : `pela renda de ${reais(teto.renda ?? 0)} que ele informou, na conta do simulador de financiamento (sem entrada nem FGTS, a leitura conservadora)`;
  const nomes = (lista: Empreendimento[]) => lista.map((e) => e.nome).join(", ");

  let escolhaTexto: string;
  if (escolha.cabem.length > 0) {
    escolhaTexto = `CABEM e combinam com o que ele pediu: ${nomes(escolha.cabem)}. Indique UM destes, começando pelo primeiro. Não indique imóvel fora desta lista como se coubesse.`;
  } else if (escolha.cabemForaDoPedido.length > 0) {
    escolhaTexto = `Na região e nos dormitórios que ele pediu, nenhum cabe. CABEM, mas fora do pedido: ${nomes(escolha.cabemForaDoPedido)}. Diga com franqueza o que não bate (a cidade, os dormitórios) e ofereça UM destes.`;
  } else if (escolha.maisPerto.length > 0) {
    escolhaTexto = `NENHUM imóvel do catálogo cabe nesse valor. Os MAIS PERTO são: ${nomes(escolha.maisPerto)}, nessa ordem. Se for indicar, indique o primeiro, dizendo com cuidado que ele fica acima e que com entrada ou FGTS a conta muda (o corretor faz a simulação). Nunca chame de "mais perto" outro imóvel que não seja um destes.`;
  } else {
    escolhaTexto =
      "Não há imóvel com valor cadastrado para comparar. Não diga que algum cabe: o corretor faz a simulação com ele.";
  }

  return [
    `CAPACIDADE DE COMPRA (calculada pelo código, ${origem}): imóveis de até cerca de ${reais(teto.valor)}.`,
    escolhaTexto,
    escolha.semPreco > 0
      ? `${escolha.semPreco} imóvel(is) do que ele pediu estão sem valor cadastrado: não dá para dizer se cabem, então não os indique como opção que cabe no bolso.`
      : "",
    "NÃO diga esse valor ao cliente nem faça conta de financiamento na conversa: é estimativa, e quem mostra a simulação é o corretor. Use o número para ESCOLHER o imóvel certo.",
  ]
    .filter(Boolean)
    .join("\n");
}
