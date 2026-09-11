import type { DossieClienteIA } from "./types";

/**
 * O que a IA escreve na ficha do lead — e o que ela NÃO escreve.
 *
 * ## Por que existe
 *
 * Medido em 11/09/2026, entre os **55 leads que de fato conversaram** com a
 * IA: 0 com nome de gente (todos "WhatsApp 2461"), 0 e-mail, 0 renda, 1
 * orçamento, 6 dormitórios, 8 região. A pessoa conta tudo no chat e a ficha
 * — que é o que o corretor abre antes de ligar — continua vazia.
 *
 * A escrita em si já existia desde 24/08 dentro de `salvarDossie`, montada
 * à mão campo a campo. Ela virou esta função por três razões: para ser
 * testável, para ganhar a régua do corretor sem espalhar `if`, e porque
 * acrescentar um campo ali era exatamente o momento em que alguém
 * esqueceria a regra e desfaria a correção de uma pessoa.
 *
 * ## As três regras de escrita
 *
 * 1. **`null` não apaga.** Extração sem o campo preserva o que estava lá —
 *    a mesma regra que `leads` já tinha para renda e orçamento, e que o
 *    dossiê ganhou na 0106.
 * 2. **O cliente pode mudar de ideia.** Valor novo dito por ele SUBSTITUI o
 *    antigo: quem diz "agora quero 3 dormitórios" está corrigindo a ficha.
 * 3. **O corretor vence.** Campo que uma PESSOA editou pelo painel
 *    (`leads.campos_do_corretor`) não é tocado. Sem isso, a primeira
 *    correção manual seria desfeita na mensagem seguinte — e é assim que
 *    alguém para de corrigir.
 */

/** Os nomes das colunas, como estão no banco — é isso que vai no update. */
export type CamposDaFicha = {
  nome?: string;
  email?: string;
  renda_mensal?: number;
  orcamento_min?: number;
  orcamento_max?: number;
  regiao_interesse?: string;
  dormitorios_min?: number;
};

/**
 * O nome que o webhook dá a quem ainda não se apresentou.
 *
 * Só estes dois podem ser trocados pela IA. Nome que já é de gente não se
 * troca sozinho: o custo de errar é o corretor ligar e chamar a pessoa pelo
 * nome de outra.
 */
const NOME_PROVISORIO = /^(whatsapp\s|contato sem nome$|lead\s)/i;

export function camposDaFicha(
  dossie: DossieClienteIA,
  camposDoCorretor: readonly string[],
  nomeAtual: string,
  emailAtual?: string | null,
): CamposDaFicha {
  const campos: CamposDaFicha = {};
  const livre = (coluna: string) => !camposDoCorretor.includes(coluna);

  if (dossie.rendaMensal !== null && livre("renda_mensal")) campos.renda_mensal = dossie.rendaMensal;
  if (dossie.orcamentoMin !== null && livre("orcamento_min")) campos.orcamento_min = dossie.orcamentoMin;
  if (dossie.orcamentoMax !== null && livre("orcamento_max")) campos.orcamento_max = dossie.orcamentoMax;
  if (dossie.regiaoInteresse !== null && livre("regiao_interesse")) {
    campos.regiao_interesse = dossie.regiaoInteresse;
  }
  if (dossie.dormitoriosMin !== null && livre("dormitorios_min")) {
    campos.dormitorios_min = dossie.dormitoriosMin;
  }

  // O nome só substitui o provisório — ver NOME_PROVISORIO.
  if (dossie.nomeCliente && livre("nome") && NOME_PROVISORIO.test(nomeAtual.trim())) {
    campos.nome = dossie.nomeCliente;
  }

  /*
   * O e-mail não sobrescreve: diferente do orçamento, ele não muda de
   * ideia. Um segundo e-mail dito na conversa costuma ser o do cônjuge ou o
   * do contador — e trocar o da ficha por ele perde o canal que funcionava.
   */
  if (dossie.email && livre("email") && !emailAtual) campos.email = dossie.email;

  return campos;
}
