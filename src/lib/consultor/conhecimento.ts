import { STATUS_LABEL, type Empreendimento } from "@/lib/types";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import { diasDesdeConferencia, estaEnvelhecido } from "@/lib/credito/idade";
import type { CartaoDeImovel } from "./contrato";

/**
 * Os três blocos determinísticos que o consultor enxerga — módulo PURO.
 *
 * O que separa este chat de um chat genérico não é uma instrução longa: é o
 * que o CÓDIGO injeta. Catálogo real (para nunca inventar imóvel), parâmetros
 * de crédito com data (para nunca citar número velho) e as objeções que de
 * fato funcionaram nesta casa.
 *
 * O ponto de troca quando o catálogo crescer — acima de ~150 imóveis, quando
 * RAG passa a valer — é ESTE arquivo, e só ele.
 */

const reais = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Uma linha com o que a ficha tem de tipologia — o que a IA pode afirmar. */
export function resumoDaFicha(e: Empreendimento): string {
  if (!e.tipologias?.length) return "sem tipologia cadastrada";
  return e.tipologias
    .map((t) =>
      [
        t.nome,
        t.areaPrivativa ? `${t.areaPrivativa}m²` : null,
        `${t.dormitorios} dorm`,
        t.suites ? `${t.suites} suíte(s)` : null,
        t.banheiros ? `${t.banheiros} banheiro(s)` : null,
        t.vagas ? `${t.vagas} vaga(s)` : null,
      ]
        .filter(Boolean)
        .join(", "),
    )
    .join(" | ");
}

/** O retrato que vai para a mensagem. Sai do catálogo, nunca do modelo. */
export function cartaoDoImovel(e: Empreendimento): CartaoDeImovel {
  return {
    slug: e.slug,
    nome: e.nome,
    bairro: e.bairro,
    cidade: e.cidade,
    // Rótulo humano, não o enum cru: com "em_construcao" na ficha o modelo
    // afirmou ao cliente que o imóvel estava "pronto para morar".
    situacao: STATUS_LABEL[e.status] ?? e.status,
    precoAPartir: e.precoAPartir,
    resumoFicha: resumoDaFicha(e),
    capaUrl: e.capa?.url ?? e.galeria?.[0]?.url ?? null,
  };
}

/**
 * O catálogo INTEIRO, ficha completa.
 *
 * Duas diferenças em relação ao catálogo do atendimento ao cliente:
 *
 * 1. **O preço entra.** Quem lê aqui é o corretor. `semValores.ts` protege a
 *    conversa com o CLIENTE e não tem nada a fazer nesta superfície — está
 *    escrito aqui e em teste para ninguém "consertar" depois.
 * 2. **A ausência é dita em voz alta.** Listar só o que existe faz o modelo
 *    preencher o resto: com "3 dorm/110m²" ele respondeu "1 suíte" para um
 *    cadastro com 3, e com o enum cru afirmou "pronto para morar" para um
 *    imóvel em obra. O que não está aqui, a IA inventa.
 */
export function blocoDoCatalogo(imoveis: Empreendimento[]): string {
  if (imoveis.length === 0) {
    return "CATÁLOGO: nenhum imóvel publicado no momento. Diga isso ao corretor em vez de sugerir qualquer coisa.";
  }

  const fichas = imoveis
    .map((e) => {
      const apelidos = e.nomesAlternativos?.length
        ? ` (também conhecido como: ${e.nomesAlternativos.join(", ")})`
        : "";
      const midia = [
        (e.galeria?.length ?? 0) > 0 ? `${e.galeria.length} foto(s)` : "SEM foto",
        (e.plantas?.length ?? 0) > 0 ? `${e.plantas.length} planta(s)` : "SEM planta",
      ].join(", ");

      return [
        `- ${e.nome}${apelidos} [slug: ${e.slug}]`,
        `  Onde: ${e.bairro}, ${e.cidade}. Situação: ${STATUS_LABEL[e.status] ?? e.status}. Tipo: ${e.tipo}.`,
        e.precoAPartir
          ? `  A partir de: ${reais(e.precoAPartir)} (piso de tabela — valor de unidade, condição e desconto você NÃO tem)`
          : "  A partir de: SEM piso cadastrado",
        `  Ficha: ${resumoDaFicha(e)}`,
        e.construtora ? `  Construtora: ${e.construtora}` : null,
        e.entregaPrevista
          ? `  Entrega prevista: ${e.entregaPrevista}`
          : "  Entrega: sem prazo de entrega cadastrado — não afirme data",
        e.lazer?.length ? `  Lazer: ${e.lazer.join(", ")}` : "  Lazer: SEM itens cadastrados",
        `  Material: ${midia}`,
        `  Sobre: ${e.tagline || e.descricao.slice(0, 140)}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  return `CATÁLOGO COMPLETO (${imoveis.length} imóveis publicados). Só existe o que está aqui — imóvel que não está nesta lista, nós não temos:\n\n${fichas}`;
}

/**
 * Os números de crédito, com data.
 *
 * A dupla defesa do preço e do prazo, aplicada aqui: o bloco avisa ANTES
 * (dizendo o que ela PODE citar) e o guardrail corta DEPOIS. Bloco que só
 * proíbe empurra a IA para o silêncio, e silêncio sobre crédito também perde
 * negócio — a mesma lição do `blocoSemPrazoCadastrado`.
 */
export function blocoDeCredito(params: ParametrosCredito, hoje: Date): string {
  const faixas = params.faixas
    .map(
      (f) =>
        `  - ${f.nome}: renda familiar até ${reais(f.rendaMax)}, taxa ${(f.taxaAnual * 100).toFixed(2)}% a.a.` +
        (f.subsidioMaximo > 0 ? `, subsídio de até ${reais(f.subsidioMaximo)}` : ", sem subsídio"),
    )
    .join("\n");

  const itbi = Object.entries(params.itbiPorCidade)
    .map(([cidade, aliquota]) => `${cidade} ${(aliquota * 100).toFixed(1)}%`)
    .join(", ");

  const dias = diasDesdeConferencia(params.conferidoEm, hoje);
  const idade =
    estaEnvelhecido(params.conferidoEm, hoje)
      ? `\nATENÇÃO: estes números foram conferidos há ${dias} dias e podem estar DESATUALIZADOS. Diga isso ao corretor e mande conferir na fonte antes de repassar ao cliente.`
      : "";

  return `PARÂMETROS DE CRÉDITO (conferidos em ${params.conferidoEm}):
${faixas}
  - Teto de valor do imóvel para usar FGTS na compra: ${reais(params.tetoFgtsImovel)}
  - Taxa de referência do SBPE (fora do MCMV): ${(params.taxaSbpeAnual * 100).toFixed(2)}% a.a.
  - Prazo máximo: ${params.prazoMaximoMeses} meses
  - Comprometimento máximo da renda com a parcela: ${(params.comprometimentoMaximo * 100).toFixed(0)}%
  - ITBI: ${itbi}${idade}

REGRA DURA: número de crédito que não está neste bloco você NÃO cita e não inventa — pergunta ao corretor ou manda conferir na fonte (Caixa, prefeitura, cartório). Os números ACIMA você pode citar à vontade, dizendo a data da conferência.`;
}

/** O corpus real. Vazio some inteiro — cabeçalho órfão é ruído no prompt. */
export function blocoDeObjecoes(exemplos: string): string {
  const limpo = exemplos.trim();
  if (!limpo) return "";
  return `COMO ESTA CASA JÁ RESPONDEU (conversas reais que converteram — imite o argumento e o tom, nunca copie literalmente):\n${limpo}`;
}
