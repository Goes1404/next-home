/**
 * A fila de candidatos a cadastro — o que o mercado tem e o catálogo não.
 *
 * ## Por que existe uma fila, e não uma lista
 *
 * O levantamento de 01/09/2026 achou 39 lançamentos em obra em Barueri, 30
 * deles fora do catálogo. Uma lista devolve os mesmos 30 toda vez que
 * alguém abre; uma fila LEMBRA o que já foi decidido. É a diferença entre
 * trabalho que anda e trabalho que se repete — e a régua desta casa é que
 * lista que não anda vira ruído e ninguém mais abre (a mesma que limitou a
 * fila do Início a 6 itens).
 *
 * `descartado` vale tanto quanto `cadastrar`: é ele que impede o imóvel de
 * voltar à fila no próximo levantamento.
 *
 * ## A ordem é decisão de produto
 *
 * Primeiro os que precisam de CONFERÊNCIA (nome parecido com um do
 * catálogo). Não é capricho: este projeto já publicou o mesmo
 * empreendimento TRÊS vezes ("Lançamento ao Lado do Parque", despublicados
 * na 0046), e ali o estrago foi silencioso — a assistente oferecendo o
 * mesmo prédio como se fossem opções diferentes. Conferir três nomes custa
 * minutos; descobrir a duplicata depois custou uma investigação.
 *
 * Depois o resto, em ordem alfabética. Não há sinal melhor disponível: o
 * levantamento não traz preço nem VGV, e ordenar por bairro daria a falsa
 * impressão de que a fila tem prioridade geográfica que ninguém definiu.
 *
 * Módulo PURO de propósito: sem `supabase`, sem `server-only`. Quem carrega
 * é `candidatosDoCatalogo.ts`; aqui só mora a regra, que é o que se testa.
 */

import { STATUS_LABEL, type StatusObra } from "@/lib/types";

export type DecisaoCandidato = "pendente" | "cadastrar" | "descartado" | "ja_temos";

export interface Candidato {
  id: string;
  refExterna: string;
  nome: string;
  bairro: string | null;
  statusObra: string | null;
  dormitorios: string | null;
  area: string | null;
  link: string | null;
  decisao: DecisaoCandidato;
  motivo: string | null;
}

/** O aviso que a carga inicial grava nos nomes parecidos com os do catálogo. */
const MARCA_DE_CONFERENCIA = "PARECIDO";

/**
 * Candidato pendente que carrega aviso de semelhança com o catálogo.
 *
 * A marca vem do `motivo` gravado pelo levantamento — não é recalculada
 * aqui de propósito: comparar nomes de novo, em outro lugar, com outra
 * régua, é como duas contas do mesmo número passam a divergir.
 */
export function precisaConferir(c: Candidato): boolean {
  return c.decisao === "pendente" && (c.motivo ?? "").includes(MARCA_DE_CONFERENCIA);
}

function porNome(a: Candidato, b: Candidato): number {
  return a.nome.localeCompare(b.nome, "pt-BR");
}

export interface FilaDeCandidatos {
  /** Aguardando decisão, conferências na frente. */
  pendentes: Candidato[];
  /** Já decididos como "vamos cadastrar" — a lista de trabalho de verdade. */
  paraCadastrar: Candidato[];
  /** Fora da fila: descartados e os que já temos. Ficam para consulta. */
  resolvidos: Candidato[];
}

export function organizarFila(candidatos: readonly Candidato[]): FilaDeCandidatos {
  const pendentes = candidatos.filter((c) => c.decisao === "pendente");

  return {
    pendentes: [
      ...pendentes.filter(precisaConferir).sort(porNome),
      ...pendentes.filter((c) => !precisaConferir(c)).sort(porNome),
    ],
    paraCadastrar: candidatos.filter((c) => c.decisao === "cadastrar").sort(porNome),
    resolvidos: candidatos
      .filter((c) => c.decisao === "descartado" || c.decisao === "ja_temos")
      .sort(porNome),
  };
}

/**
 * A frase de uma linha da fila, sem repetir o que já está no título.
 *
 * Bairro e tipologia entram porque o nome sozinho às vezes não diz qual
 * imóvel é — a mesma razão que fez a lista de pendências do catálogo
 * mostrar bairro e construtora ao lado do nome.
 */
export function resumoDoCandidato(c: Candidato): string {
  return [c.bairro, c.statusObra, c.dormitorios, c.area].filter(Boolean).join(" · ");
}

/**
 * Quantos ainda esperam decisão. É o número do cartão da tela de Imóveis, e
 * ele só aparece quando é maior que zero: contador que vive em zero ensina
 * a ignorar o contador.
 */
export function contarPendentes(candidatos: readonly Candidato[]): number {
  return candidatos.filter((c) => c.decisao === "pendente").length;
}

/**
 * O `status_obra` da fonte virado no enum do nosso cadastro.
 *
 * A fonte escreve em português de gente ("Em construção", "Lançamento"), e
 * é o mesmo texto que `STATUS_LABEL` produz — então a tradução é o rótulo
 * ao contrário, sem tabela paralela. Comparação sem acento e sem caixa
 * porque o levantamento não promete grafia.
 *
 * Sem correspondência, cai em `lancamento`, que é o default da coluna. O
 * erro aqui é barato e visível: o formulário mostra o estágio num select e
 * o corretor corrige antes de criar. Chutar "pronto para morar" é que seria
 * caro — foi assim que a assistente afirmou a um cliente que um imóvel em
 * obra estava pronto.
 */
export function statusDoCandidato(bruto: string | null): StatusObra {
  const chave = (t: string) =>
    t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  if (!bruto) return "lancamento";
  const alvo = chave(bruto);

  const achado = (Object.entries(STATUS_LABEL) as [StatusObra, string][]).find(
    ([, rotulo]) => chave(rotulo) === alvo,
  );

  return achado?.[0] ?? "lancamento";
}

/**
 * Os bairros que a fonte listou. O apto.vc devolve "Aldeia, Nova Aldeinha"
 * numa string só — nosso cadastro tem UM bairro, porque é ele que a busca
 * e o mapa usam. Quem escolhe é o corretor, no formulário.
 */
export function bairrosDoCandidato(c: Candidato): string[] {
  return (c.bairro ?? "")
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
}
