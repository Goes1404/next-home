import { chamarLlmJson } from "@/lib/whatsapp/llm";
import { dividirEmPedacos } from "@/lib/leads/leituraPorIa";
import { calcularSimilaridade } from "./matchingEngine";
import type { EmpreendimentoSimples, ItemConciliado } from "./types";

/**
 * Tabela de preços lida pela IA (02/10/2026).
 *
 * Relatado: "o upload das tabelas de preços não está funcionando de forma
 * certa". O leitor antigo (`spreadsheetParser`) espera uma linha por imóvel,
 * "Nome do Imóvel  Preço", que é o formato de uma planilha montada por nós.
 * A tabela que a construtora manda é outra coisa: UM empreendimento no
 * cabeçalho e dezenas de unidades embaixo (torre, final, área, valor, fluxo
 * de pagamento). O nome não está em nenhuma linha de preço, e o "a partir de"
 * é o MENOR valor de unidade, não um número escrito em lugar nenhum.
 *
 * Quem lê isso bem é um modelo: ele acha o empreendimento, casa com o nosso
 * catálogo e aponta o menor valor de unidade. O que torna seguro:
 *   - o imóvel tem de ser um slug do catálogo (não inventa cadastro);
 *   - o valor tem de estar ESCRITO no arquivo (preço adivinhado iria para o
 *     site, e quem compara a tabela com o site descobre);
 *   - o gestor revisa tudo na tela antes de aplicar, e o lote tem Desfazer.
 */

/** O que o modelo devolve por empreendimento, antes da conferência. */
type LidoPelaIa = {
  slug: string | null;
  nomeNoArquivo: string;
  menorPreco: number;
  unidades: number | null;
};

const PROMPT = `Você lê tabelas de preços de imóveis enviadas por construtoras e incorporadoras.
Uma tabela costuma ter o nome do empreendimento no cabeçalho e, embaixo, uma linha por UNIDADE (torre, final ou número, andar, metragem, valor total, às vezes o fluxo de pagamento: sinal, mensais, chaves, financiamento).
O arquivo pode trazer mais de um empreendimento.

Para CADA empreendimento que aparece no trecho:
- nomeNoArquivo: o nome como está no arquivo.
- slug: o slug do empreendimento do NOSSO CATÁLOGO (lista abaixo) que é o mesmo imóvel. Compare nome, apelido, bairro e cidade. Se não for nenhum do catálogo, ou se tiver dúvida, null. Nunca invente um slug.
- menorPreco: o MENOR VALOR TOTAL de unidade do empreendimento, em reais, como número (ex.: 457000). É o preço do imóvel inteiro, não a parcela, o sinal, o valor do m², a entrada nem o valor financiado. Copie o número que está escrito no arquivo, sem arredondar e sem fazer conta.
- unidades: quantas unidades com preço você contou para esse empreendimento no trecho, ou null.

Se o trecho não tiver nenhum valor de unidade, devolva lista vazia.

Responda EXCLUSIVAMENTE um JSON válido, sem crases e sem texto em volta:
{"imoveis":[{"nomeNoArquivo":"...","slug":"...","menorPreco":457000,"unidades":12}]}`;

/**
 * Tabela grande vira pedaços, mas cada pedaço leva o COMEÇO do arquivo junto:
 * o nome do empreendimento costuma estar só no cabeçalho da primeira página, e
 * as unidades da página 5 ficariam sem dono.
 */
const TAMANHO_DO_PEDACO = 12_000;
const CABECALHO = 1_200;
const EM_PARALELO = 3;
const ORCAMENTO_POR_PEDACO_MS = 45_000;

/** Preço plausível de um imóvel inteiro (não é parcela nem m²). */
const PRECO_MINIMO = 50_000;
const PRECO_MAXIMO = 50_000_000;

/**
 * Todos os valores em reais escritos no texto, como número. Aceita
 * "457.000,00", "457.000", "457000", "R$ 457.000" e "457 mil".
 */
export function valoresEscritos(texto: string): Set<number> {
  const valores = new Set<number>();
  const t = texto.replace(/ /g, " ");
  for (const m of t.matchAll(/\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:,\d{1,2})?/g)) {
    const bruto = m[0];
    const [inteiro] = bruto.split(",");
    const valor = Number(inteiro.replace(/\./g, ""));
    if (Number.isFinite(valor) && valor > 0) valores.add(valor);
  }
  for (const m of t.matchAll(/(\d+(?:[.,]\d+)?)\s*mil\b/gi)) {
    const valor = Math.round(Number(m[1].replace(",", ".")) * 1000);
    if (Number.isFinite(valor)) valores.add(valor);
  }
  return valores;
}

/** O valor que a IA apontou está escrito no arquivo? */
export function precoEstaNoTexto(preco: number, escritos: Set<number>): boolean {
  return escritos.has(Math.round(preco));
}

function lerResposta(json: unknown): LidoPelaIa[] {
  const lista = (json as { imoveis?: unknown })?.imoveis;
  if (!Array.isArray(lista)) return [];
  const lidos: LidoPelaIa[] = [];
  for (const item of lista) {
    const i = item as Record<string, unknown>;
    const preco = typeof i.menorPreco === "number" ? i.menorPreco : Number(String(i.menorPreco ?? "").replace(/\D/g, ""));
    const nome = typeof i.nomeNoArquivo === "string" ? i.nomeNoArquivo.trim() : "";
    if (!nome || !Number.isFinite(preco) || preco <= 0) continue;
    lidos.push({
      nomeNoArquivo: nome.slice(0, 120),
      slug: typeof i.slug === "string" && i.slug.trim() ? i.slug.trim() : null,
      menorPreco: Math.round(preco),
      unidades: typeof i.unidades === "number" ? i.unidades : null,
    });
  }
  return lidos;
}

export type LeituraDaTabela = {
  itens: ItemConciliado[];
  /** Valores que a IA apontou e que NÃO estão no arquivo: descartados. */
  descartados: string[];
  falhou: boolean;
};

/**
 * Lê o texto da tabela com a IA e devolve os itens no formato da tela de
 * conciliação, já casados com o catálogo.
 */
export async function lerTabelaDePrecosComIa(
  texto: string,
  catalogo: EmpreendimentoSimples[],
): Promise<LeituraDaTabela> {
  const limpo = texto.trim();
  if (!limpo) return { itens: [], descartados: [], falhou: false };

  const listaDoCatalogo = catalogo
    .map((e) => `- ${e.slug} | ${e.nome} | ${e.bairro} | ${e.cidade}`)
    .join("\n");
  const cabecalho = limpo.slice(0, CABECALHO);
  const pedacos = dividirEmPedacos(limpo, TAMANHO_DO_PEDACO);

  const respostas: LidoPelaIa[][] = [];
  let falhas = 0;
  for (let i = 0; i < pedacos.length; i += EM_PARALELO) {
    const lote = pedacos.slice(i, i + EM_PARALELO);
    const resultados = await Promise.all(
      lote.map((pedaco, k) => {
        const inicio = i + k === 0 ? "" : `COMEÇO DO ARQUIVO (só para saber de qual empreendimento é o trecho):\n${cabecalho}\n\n`;
        return chamarLlmJson(
          `${PROMPT}\n\nNOSSO CATÁLOGO (slug | nome | bairro | cidade):\n${listaDoCatalogo}\n\n${inicio}TRECHO DA TABELA:\n${pedaco}`,
          { temperature: 0, orcamentoMs: ORCAMENTO_POR_PEDACO_MS },
        );
      }),
    );
    for (const r of resultados) {
      if (r.ok) respostas.push(lerResposta(r.json));
      else falhas += 1;
    }
  }

  if (falhas === pedacos.length) return { itens: [], descartados: [], falhou: true };

  const escritos = valoresEscritos(limpo);
  const porSlug = new Map(catalogo.map((e) => [e.slug, e]));

  // Um empreendimento pode aparecer em vários pedaços: fica o MENOR valor
  // conferido. A chave é o slug, ou o nome do arquivo quando não casou.
  const juntos = new Map<string, LidoPelaIa>();
  const descartados: string[] = [];
  for (const lido of respostas.flat()) {
    if (lido.menorPreco < PRECO_MINIMO || lido.menorPreco > PRECO_MAXIMO || !precoEstaNoTexto(lido.menorPreco, escritos)) {
      descartados.push(`${lido.nomeNoArquivo}: ${lido.menorPreco.toLocaleString("pt-BR")}`);
      continue;
    }
    const slug = lido.slug && porSlug.has(lido.slug) ? lido.slug : null;
    const chave = slug ?? `arquivo:${lido.nomeNoArquivo.toLowerCase()}`;
    const anterior = juntos.get(chave);
    if (!anterior || lido.menorPreco < anterior.menorPreco) {
      juntos.set(chave, { ...lido, slug, unidades: (anterior?.unidades ?? 0) + (lido.unidades ?? 0) || null });
    }
  }

  const agora = Date.now();
  const itens: ItemConciliado[] = [...juntos.values()].map((lido, indice) => {
    const emp = lido.slug ? (porSlug.get(lido.slug) ?? null) : null;
    const precoAtual = emp?.precoAtual ?? null;
    const precoNovo = lido.menorPreco;
    const temAtual = precoAtual !== null && precoAtual > 0;
    return {
      idTemp: `ia_${indice}_${agora}`,
      linhaOriginal: {
        textoNome: lido.nomeNoArquivo,
        textoPreco: `menor valor${lido.unidades ? ` de ${lido.unidades} unidades` : ""}: ${precoNovo.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`,
        precoNumerico: precoNovo,
      },
      empreendimentoId: emp?.id ?? null,
      nomeEmpreendimento: emp?.nome ?? null,
      slugEmpreendimento: emp?.slug ?? null,
      cidade: emp?.cidade ?? null,
      bairro: emp?.bairro ?? null,
      precoAtual,
      precoNovo,
      diferencaReais: temAtual ? precoNovo - precoAtual : null,
      variacaoPercentual: temAtual ? parseFloat((((precoNovo - precoAtual) / precoAtual) * 100).toFixed(2)) : null,
      // A IA casou e o valor está no arquivo: entra marcado. O gestor ainda
      // confere a tela antes de aplicar, e o lote tem Desfazer.
      matchStatus: emp ? "exato" : "nao_encontrado",
      scoreSimilaridade: emp ? Math.max(0.9, calcularSimilaridade(lido.nomeNoArquivo, emp.nome)) : 0,
      selecionado: emp !== null,
    };
  });

  return { itens, descartados, falhou: false };
}
