import type { Empreendimento } from "@/lib/types";
import type { DossieClienteIA } from "./types";

/**
 * Ranking do catálogo para o prompt da IA.
 *
 * O prompt tem espaço para ~10 empreendimentos, e o corte anterior era
 * `slice(0, 10)` na ordem do banco: com um catálogo de 27, os outros 17
 * simplesmente não existiam para a IA — ela dizia "não temos" para imóvel
 * publicado no site. Este ranking usa o que a conversa e o dossiê já
 * revelaram para escolher QUAIS 10 entram.
 *
 * Léxico e simples de propósito: com dezenas de itens, embeddings seriam
 * infraestrutura sem retorno (ver plano). Reavaliar só em outra ordem de
 * grandeza de catálogo.
 */

const LIMITE_PADRAO = 10;

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Quanto acima do teto declarado ainda vale mostrar. Ninguém decide
 * orçamento com régua: quem diz "600 mil" costuma olhar 650 sem reclamar.
 */
const TOLERANCIA_ORCAMENTO = 1.2;

/**
 * Tira do catálogo o que está claramente fora do bolso do cliente.
 *
 * Existe por causa de um caso que o eval expôs e que a regra de negócio
 * tornava insolúvel: o cliente diz duas vezes "só tenho 600 mil" e a IA
 * responde oferecendo um imóvel de 1,28 milhão. Ela não estava
 * desobedecendo — o catálogo do prompt NÃO TEM PREÇO (é a primeira defesa
 * do "a IA não fala valores"), então ela não tinha como saber que aquilo
 * não cabia. Pontuar não bastava: o ranking dava -10 ao que estoura a
 * faixa, mas com 10 vagas e poucos imóveis ele entrava assim mesmo.
 *
 * O filtro resolve por CONSTRUÇÃO, que é o padrão desta base: o que a IA
 * não vê, ela não oferece — mesma lógica de `resolverMidia`.
 *
 * Duas guardas importam:
 * - imóvel sem `precoAPartir` (sob consulta) NUNCA é cortado: preço
 *   desconhecido não é preço alto, e sumir com ele seria esconder opção
 *   por falta de cadastro;
 * - se o filtro esvaziar a lista, ele se desfaz. Catálogo vazio deixaria a
 *   IA sem nada concreto para dizer, e é aí que modelo inventa. Melhor
 *   mostrar o que existe e deixá-la avisar que está acima da faixa.
 */
export function filtrarPorOrcamento(
  catalogo: Empreendimento[],
  orcamentoMax: number | null | undefined,
): Empreendimento[] {
  if (!orcamentoMax || orcamentoMax <= 0) return catalogo;

  const teto = orcamentoMax * TOLERANCIA_ORCAMENTO;
  const cabem = catalogo.filter((e) => !e.precoAPartir || e.precoAPartir <= teto);

  return cabem.length > 0 ? cabem : catalogo;
}

/**
 * Estágios de obra em que NÃO dá para entrar agora. `ultimas_unidades` fica
 * de fora da lista de propósito: é o próprio prédio pronto vendendo o que
 * sobrou.
 */
const ESTAGIOS_NAO_PRONTOS = new Set(["breve_lancamento", "pre_lancamento", "lancamento", "em_construcao"]);

/** Urgências em que esperar obra não é opção. */
const URGENCIAS_IMEDIATAS = new Set(["imediata", "3_meses"]);

/**
 * Tira do catálogo o que não fica pronto a tempo, quando o cliente tem
 * pressa.
 *
 * Irmão de `filtrarPorOrcamento`, e pelo mesmo motivo: o eval flagrou a IA
 * oferecendo um imóvel EM CONSTRUÇÃO a quem acabou de dizer "meu contrato
 * de aluguel vence mês que vem, não dá pra esperar obra" — e, pior,
 * inventando que a "entrega estava prevista para breve", data que não
 * existe no cadastro. O prompt já proíbe as duas coisas (regras 14 e 22) e
 * mesmo assim aconteceu, porque instrução é probabilística.
 *
 * Resolver por construção também evita o segundo defeito: sem o imóvel em
 * obra no prompt, não há prazo de entrega para inventar.
 *
 * As mesmas duas guardas do filtro de orçamento: se esvaziar a lista, ele
 * se desfaz — catálogo vazio é onde o modelo inventa —, e sem urgência
 * conhecida no dossiê nada é cortado.
 */
export function filtrarPorUrgencia(
  catalogo: Empreendimento[],
  urgencia: string | null | undefined,
): Empreendimento[] {
  if (!urgencia || !URGENCIAS_IMEDIATAS.has(urgencia)) return catalogo;

  const prontos = catalogo.filter((e) => !ESTAGIOS_NAO_PRONTOS.has(e.status));
  return prontos.length > 0 ? prontos : catalogo;
}

export function ranquearCatalogo(params: {
  catalogo: Empreendimento[];
  mensagemAtual: string;
  historico?: { texto: string }[];
  dossie?: Pick<
    DossieClienteIA,
    "orcamentoMin" | "orcamentoMax" | "exigenciasEspecificas" | "urgenciaMudanca"
  > | null;
  limite?: number;
}): Empreendimento[] {
  const { dossie } = params;
  const limite = params.limite ?? LIMITE_PADRAO;
  /*
   * O corte por orçamento vem ANTES do atalho de catálogo pequeno. Estava
   * depois, na prática: com 10 ou menos imóveis a função devolvia tudo sem
   * olhar o dossiê, e o imóvel fora da faixa entrava no prompt de qualquer
   * jeito. É exatamente o caso que aparecia no eval.
   */
  const catalogo = filtrarPorUrgencia(
    filtrarPorOrcamento(params.catalogo, dossie?.orcamentoMax),
    dossie?.urgenciaMudanca,
  );
  /*
   * Não há mais atalho de "cabe tudo, devolve tudo". Ele existia como
   * economia, mas descartava a ORDEM: com o catálogo pequeno — e ele ficou
   * pequeno agora que o filtro de orçamento corta antes —, o imóvel que o
   * cliente acabou de citar deixava de ir para o topo. Ordenar até dez
   * itens não custa nada e a ordenação é estável, então sem sinal nenhum o
   * resultado é idêntico à ordem editorial de antes.
   */

  // A mensagem atual pesa mais que o histórico: é o assunto de AGORA.
  const textoAtual = normalizar(params.mensagemAtual);
  const textoHistorico = normalizar((params.historico ?? []).map((m) => m.texto).join(" "));
  const exigencias = normalizar((dossie?.exigenciasEspecificas ?? []).join(" "));

  const pontuados = catalogo.map((e, indice) => {
    let pontos = 0;
    /*
     * O nome do cadastro E os apelidos (0044): o cliente escreve "Dom
     * Parque", e o cadastro se chama "Lançamento ao Lado do Parque". Sem os
     * apelidos aqui, o imóvel citado na mensagem não subia para o topo do
     * ranking — ou seja, podia nem entrar no prompt.
     */
    const rotulos = [e.nome, ...(e.nomesAlternativos ?? [])].map(normalizar).filter(Boolean);
    const bairro = normalizar(e.bairro);
    const tipo = normalizar(e.tipo);

    if (rotulos.some((r) => textoAtual.includes(r))) pontos += 100;
    if (rotulos.some((r) => textoHistorico.includes(r))) pontos += 40;
    if (textoAtual.includes(bairro)) pontos += 30;
    if (textoHistorico.includes(bairro)) pontos += 12;
    if (exigencias.includes(tipo)) pontos += 8;

    // Faixa de orçamento do dossiê: dentro dela vale mais; sem preço no
    // cadastro fica neutro (não pode sumir só por estar "sob consulta").
    if (e.precoAPartir && (dossie?.orcamentoMin || dossie?.orcamentoMax)) {
      const min = dossie?.orcamentoMin ?? 0;
      const max = dossie?.orcamentoMax ?? Number.MAX_SAFE_INTEGER;
      if (e.precoAPartir >= min * 0.8 && e.precoAPartir <= max * 1.2) pontos += 25;
      else pontos -= 10;
    }

    // Desempate estável: a ordem editorial do site (destaque/ordem) vale
    // como critério final, então sem sinal nenhum o corte é o mesmo de antes.
    return { e, pontos, indice };
  });

  pontuados.sort((a, b) => b.pontos - a.pontos || a.indice - b.indice);
  return pontuados.slice(0, limite).map((p) => p.e);
}
