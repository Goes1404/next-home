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
- menorPreco: o MENOR VALOR TOTAL de unidade DISPONÍVEL do empreendimento, em reais, como número (ex.: 608923.68). É a coluna "Total", "Valor total", "Preço" ou "Valor de venda": o preço do imóvel inteiro. Nunca use a coluna de financiamento, ato, sinal, entrada, parcelas, mensais, chaves ou valor do m², mesmo que o número dela seja menor. Se a tabela tem coluna de situação, ignore unidade vendida, reservada, bloqueada ou em negociação. Copie o número que está escrito no arquivo, sem arredondar e sem fazer conta.
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
/*
 * Seis de uma vez: o guia de parceria da RSF (13/10/2026) tem 53 páginas, e
 * com três por vez o segundo lote estourava os 60 s da página. Pedaço sem
 * nenhum valor de imóvel nem vai à IA (ver `temValorDeImovel`).
 */
const EM_PARALELO = 6;
const ORCAMENTO_POR_PEDACO_MS = 45_000;
/** Tempo total da leitura: a página tem 60 s e ainda precisa responder. */
const PRAZO_PADRAO_MS = 50_000;
/** Lote que começaria com menos que isto não começa: devolve o que já leu. */
const MINIMO_PARA_UM_LOTE_MS = 8_000;

/** Abaixo disto, o casamento da IA vira sugestão desmarcada. */
const NOME_PARECIDO = 0.5;

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

/** O trecho tem algum número que poderia ser preço de imóvel? */
export function temValorDeImovel(texto: string): boolean {
  for (const v of valoresEscritos(texto)) if (v >= PRECO_MINIMO && v <= PRECO_MAXIMO) return true;
  return false;
}

/**
 * A tabela avisa que os valores NÃO são o menor da tabela? O tabelão da RSF
 * (out/2026) diz no rodapé: "Valores das unidades de referência do tabelão
 * de outubro/2026, não o mínimo da tabela". Nesse caso o menor valor lido é
 * o de uma unidade de exemplo: serve para baixar o "a partir de" (existe
 * unidade por aquele preço), mas não para SUBIR (o Breeze tem unidade de
 * R$ 349.900 e a de referência é de R$ 381.405).
 */
export function avisaValoresDeReferencia(texto: string): boolean {
  const t = texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return /unidades? de referencia|nao (e )?o minimo da tabela|valores? de referencia/.test(t);
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
  /** O arquivo diz que os valores são de unidades de referência. */
  valoresDeReferencia?: boolean;
  /** Pedaços com valor que ficaram sem ler porque o tempo acabou. */
  naoLidos?: number;
};

/**
 * Lê o texto da tabela com a IA e devolve os itens no formato da tela de
 * conciliação, já casados com o catálogo.
 */
export async function lerTabelaDePrecosComIa(
  texto: string,
  catalogo: EmpreendimentoSimples[],
  opts?: { prazoMs?: number },
): Promise<LeituraDaTabela> {
  const limpo = texto.trim();
  if (!limpo) return { itens: [], descartados: [], falhou: false };
  const fim = Date.now() + (opts?.prazoMs ?? PRAZO_PADRAO_MS);

  const listaDoCatalogo = catalogo
    .map((e) => {
      const apelidos = (e.apelidos ?? []).filter(Boolean);
      return `- ${e.slug} | ${e.nome}${apelidos.length ? ` (também: ${apelidos.join(", ")})` : ""} | ${e.bairro} | ${e.cidade}`;
    })
    .join("\n");
  const cabecalho = limpo.slice(0, CABECALHO);
  // O primeiro pedaço vai sempre (é ele que dá o nome); dos outros, só os que
  // têm algum número com cara de preço de imóvel.
  const pedacos = dividirEmPedacos(limpo, TAMANHO_DO_PEDACO).filter((p, i) => i === 0 || temValorDeImovel(p));

  const respostas: LidoPelaIa[][] = [];
  let falhas = 0;
  let lidos = 0;
  for (let i = 0; i < pedacos.length; i += EM_PARALELO) {
    const resta = fim - Date.now();
    if (resta < MINIMO_PARA_UM_LOTE_MS) break;
    const lote = pedacos.slice(i, i + EM_PARALELO);
    lidos += lote.length;
    const resultados = await Promise.all(
      lote.map((pedaco, k) => {
        const inicio = i + k === 0 ? "" : `COMEÇO DO ARQUIVO (só para saber de qual empreendimento é o trecho):\n${cabecalho}\n\n`;
        return chamarLlmJson(
          `${PROMPT}\n\nNOSSO CATÁLOGO (slug | nome | bairro | cidade):\n${listaDoCatalogo}\n\n${inicio}TRECHO DA TABELA:\n${pedaco}`,
          { temperature: 0, orcamentoMs: Math.min(ORCAMENTO_POR_PEDACO_MS, resta) },
        );
      }),
    );
    for (const r of resultados) {
      if (r.ok) respostas.push(lerResposta(r.json));
      else falhas += 1;
    }
  }

  if (lidos === 0 || falhas === lidos) return { itens: [], descartados: [], falhou: true };
  const valoresDeReferencia = avisaValoresDeReferencia(limpo);

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
    const similaridade = emp
      ? Math.max(...[emp.nome, ...(emp.apelidos ?? [])].map((n) => calcularSimilaridade(lido.nomeNoArquivo, n)))
      : 0;
    // Valor de referência que SUBIRIA o preço não entra marcado (ver
    // `avisaValoresDeReferencia`): a tabela diz que existe unidade mais barata.
    const subiriaComReferencia = valoresDeReferencia && temAtual && precoNovo > (precoAtual ?? 0);
    const parecido = similaridade >= NOME_PARECIDO;
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
      /*
       * A IA casou e o nome se parece: entra marcado. Nome que NÃO se parece
       * (o "Acqua Park" do arquivo de exemplo de 02/10 contra o "Alpha Park
       * View" do catálogo dá 0,43) fica como sugestão desmarcada: casar
       * errado muda o preço público de OUTRO imóvel.
       */
      matchStatus: !emp ? "nao_encontrado" : parecido ? "exato" : "sugerido",
      scoreSimilaridade: similaridade,
      selecionado: emp !== null && parecido && !subiriaComReferencia,
    };
  });

  return { itens, descartados, falhou: false, valoresDeReferencia, naoLidos: pedacos.length - lidos };
}

/**
 * Print da tabela (13/10/2026): o tabelão da RSF chega como foto da tela do
 * celular, e foto não tem texto dentro para ler de graça.
 *
 * São DOIS passos de propósito. Primeiro a IA só TRANSCREVE o que vê, uma
 * linha por unidade com o nome do empreendimento repetido; depois a mesma
 * leitura do PDF (`lerTabelaDePrecosComIa`) roda sobre essa transcrição. Assim
 * a trava "o valor está escrito no arquivo" continua valendo, agora contra a
 * transcrição, e o texto aparece na tela para o gestor conferir com o print.
 */
const PROMPT_DA_TRANSCRICAO = `Esta imagem é um print de uma tabela de preços de imóveis (uma ou mais tabelas, às vezes cortadas em cima ou embaixo).
Transcreva TODAS as linhas de unidade que aparecem, uma por linha, neste formato:
Empreendimento | descrição da unidade (dormitórios, suítes, metragem) | vagas | valor | código da unidade

Regras:
- Na imagem o nome do empreendimento aparece só na primeira linha do grupo, com a entrega embaixo. Repita o nome em TODAS as linhas do grupo. Se o grupo começa cortado e o nome não aparece, use "(nome cortado)".
- Copie o valor exatamente como está escrito, com R$, pontos e vírgula (ex.: R$ 381.405,62). Se estiver escrito "Indisponível", escreva Indisponível.
- Linhas de condição (desconto, voucher, documentação grátis) entram como "Obs: <empreendimento> | <texto>".
- Notas de rodapé sobre os valores entram como "Nota: <texto>".
- Não invente nem complete nada. Número que você não consegue ler: [ilegível].
- Se a imagem não tiver tabela de preços, devolva a lista vazia.

Responda EXCLUSIVAMENTE um JSON válido, sem crases e sem texto em volta:
{"linhas":["Breeze Home Clube | 2 dorms 49 m² | 1 | R$ 381.405,62 | B-107"]}`;

export async function transcreverPrintDaTabela(
  imagemDataUrl: string,
  opts?: { orcamentoMs?: number },
): Promise<{ ok: true; texto: string } | { ok: false }> {
  const r = await chamarLlmJson(PROMPT_DA_TRANSCRICAO, {
    temperature: 0,
    orcamentoMs: opts?.orcamentoMs ?? 30_000,
    fatia: 1,
    imagens: [imagemDataUrl],
    // Aqui se lê dígito: em "low" a imagem vira 512 px e o centavo some.
    detalheImagem: "high",
  });
  if (!r.ok) return { ok: false };
  const linhas = (r.json as { linhas?: unknown })?.linhas;
  if (!Array.isArray(linhas)) return { ok: true, texto: "" };
  const texto = linhas
    .filter((l): l is string => typeof l === "string")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
  return { ok: true, texto };
}
