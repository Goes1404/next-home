/**
 * A pergunta que a ficha do lead leva ao consultor — módulo PURO.
 *
 * ## Por que existe
 *
 * O consultor é a sétima tela do menu, e esta base já mediu que ferramenta
 * atrás de um clique extra não é usada: o aviso de apelidos não moveu nada em
 * cinco dias porque morava dentro do editor. O conserto conhecido é mudar o
 * LUGAR, não reforçar o texto.
 *
 * Aqui o lugar é a ficha, logo abaixo da qualificação — e a pergunta já vai
 * montada com o que o corretor CADASTROU sobre a pessoa. Ele não digita nada;
 * confere e manda.
 *
 * ## Por que devolve `null` com ficha vazia
 *
 * "O que serve para alguém?" não é pergunta: gastaria uma chamada para
 * receber "me conta mais". Sem nenhum dado de qualificação, o botão não
 * aparece — botão que leva a lugar nenhum é pior que a ausência dele, e a
 * régua da casa é a mesma do contador que só existe acima de zero.
 */

export type PerfilDoLead = {
  nome?: string | null;
  rendaMensal?: number | null;
  orcamentoMin?: number | null;
  orcamentoMax?: number | null;
  dormitoriosMin?: number | null;
  regiaoInteresse?: string | null;
};

const reais = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Só conta o que é número de verdade e maior que zero. */
const vale = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;

/**
 * `null` quando não há dado suficiente para a pergunta valer a pena.
 *
 * O nome NÃO entra sozinho no critério: saber que ela se chama Ana não ajuda
 * a escolher imóvel nenhum.
 */
export function perguntaDoLead(lead: PerfilDoLead): string | null {
  const partes: string[] = [];

  if (vale(lead.rendaMensal)) partes.push(`renda de ${reais(lead.rendaMensal)}`);

  if (vale(lead.orcamentoMin) && vale(lead.orcamentoMax)) {
    partes.push(`orçamento entre ${reais(lead.orcamentoMin)} e ${reais(lead.orcamentoMax)}`);
  } else if (vale(lead.orcamentoMax)) {
    partes.push(`orçamento até ${reais(lead.orcamentoMax)}`);
  } else if (vale(lead.orcamentoMin)) {
    partes.push(`orçamento a partir de ${reais(lead.orcamentoMin)}`);
  }

  if (vale(lead.dormitoriosMin)) {
    partes.push(`${lead.dormitoriosMin}+ dormitório${lead.dormitoriosMin > 1 ? "s" : ""}`);
  }

  const regiao = lead.regiaoInteresse?.trim();
  if (regiao) partes.push(`quer em ${regiao}`);

  if (partes.length === 0) return null;

  const quem = lead.nome?.trim() ? `${lead.nome.trim()}: ` : "";
  return `Cliente ${quem}${partes.join(", ")}. Que imóvel do nosso catálogo serve, e fecha?`;
}
