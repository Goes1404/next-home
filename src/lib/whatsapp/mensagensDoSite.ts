/**
 * As mensagens que os botões do site e o anúncio pré-preenchem no WhatsApp.
 *
 * Módulo PURO e sem dependência, separado de `porteiro.ts` de propósito:
 * `site.ts` e componentes `"use client"` importam daqui, e puxar o porteiro
 * inteiro (com o reconhecedor e o `modoBot`) engordava rotas do painel que
 * só importam `site.ts`. O porteiro reexporta tudo — quem reconhece e quem
 * monta leem o MESMO texto.
 */

/** As intenções que os botões do site levam no endereço (`?i=`). */
export type ChaveIntencao = "saber" | "material" | "tabela" | "visita";

/**
 * Vocabulário FECHADO, escrito por nós.
 *
 * Ser fechado é o que permite ao reconhecedor tirar a intenção pelo fim
 * antes de ler o nome do imóvel: nada de adivinhar limite de frase, que não
 * funcionaria mesmo — o `!` de "Olá!" é a primeira pontuação do texto e o
 * prefixo atravessa duas frases.
 */
export const INTENCOES: Record<ChaveIntencao, string> = {
  saber: "Quero saber mais.",
  material: "Quero a descrição completa e as plantas.",
  tabela: "Quero a tabela de valores e condições.",
  visita: "Quero agendar uma visita.",
};

export function ehChaveIntencao(valor: string | null | undefined): valor is ChaveIntencao {
  return valor != null && Object.prototype.hasOwnProperty.call(INTENCOES, valor);
}

/**
 * A mensagem pronta que o clique pré-preenche no WhatsApp.
 *
 * O texto é DETERMINÍSTICO por imóvel de propósito: é ele que permite ao
 * webhook reconhecer "isto veio de uma peça nossa" sem nenhum metadado do
 * provedor — e o nome oficial do imóvel dentro dele é o que a Sofia já
 * resolve via focoDaConversa (nome + apelidos).
 *
 * A intenção vem DEPOIS do nome e é opcional: o anúncio do Meta continua
 * mandando a forma sem ela, byte por byte igual à de antes.
 */
export function mensagemDeAnuncio(
  nomeImovel: string,
  intencao?: ChaveIntencao | null,
): string {
  const base = `Olá! Gostaria de mais informações do ${nomeImovel.trim()}.`;
  return intencao ? `${base} ${INTENCOES[intencao]}` : base;
}

/**
 * A frase que o site manda quando não há imóvel no contexto.
 *
 * Reconhecida por CÓDIGO, não por `palavras_entrada_cliente`. A razão é
 * dependência: aquele campo é configuração POR CORRETOR e hoje só uma
 * instância o tem preenchido. Fazer o funil do site depender de um campo
 * que cada corretor preenche à mão constrói o mesmo silêncio que a 0111
 * causou — funciona para quem configurou e morre calado para o resto. A
 * mensagem é NOSSA, então reconhecê-la é decisão de código.
 */
export const MENSAGEM_DO_SITE = "Olá! Vim pelo site da Next Home.";

export function mensagemDoSite(intencao?: ChaveIntencao | null): string {
  return intencao ? `${MENSAGEM_DO_SITE} ${INTENCOES[intencao]}` : MENSAGEM_DO_SITE;
}
