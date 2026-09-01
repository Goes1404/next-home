/**
 * O que NÃO se guarda de uma conversa que nunca foi liberada.
 *
 * ## O problema, medido em 01/09/2026
 *
 * O número da instância é o WhatsApp **pessoal** do corretor. Tudo que
 * chega ali é gravado — conversa de trabalho ou não. Ao conferir se um
 * cliente tinha sido respondido, o que apareceu foi uma conversa pessoal
 * dele com um amigo, inteira, gravada naquele mesmo dia.
 *
 * A contagem: **62 conversas nunca liberadas, 4.178 mensagens guardadas,
 * ~74 por dia**, desde 19/08. Gente que nunca soube que existe um sistema
 * no meio.
 *
 * A trava de atendimento está CERTA e continua valendo: sem liberação a IA
 * não fala. O que estava errado é que não falar nunca impediu de GRAVAR.
 *
 * ## A regra
 *
 * Conversa nunca liberada guarda a LINHA, não o texto. A linha é
 * necessária: é ela que mata reentrega pelo `provider_message_id` e que
 * permite ao sistema saber que a conversa existe. O conteúdo não serve
 * para nada aqui — a IA não vai responder, e few-shot só recolhe conversa
 * atendida.
 *
 * Assim que a conversa é liberada, tudo volta ao normal a partir dali. As
 * mensagens anteriores permanecem sem texto, e isso é honesto: elas foram
 * trocadas quando ninguém tinha autorizado nada.
 *
 * ## O custo, declarado
 *
 * O corretor deixa de LER no Live Chat as conversas ainda não liberadas.
 * Ele continua lendo no próprio celular — é o WhatsApp dele. É esse o
 * ponto: o painel não precisa de cópia da vida pessoal de ninguém.
 */

/**
 * Fica no lugar do texto. Não é vazio de propósito: linha em branco na tela
 * parece defeito, e quem abrir o Live Chat precisa entender por que não há
 * conteúdo.
 */
export const TEXTO_NAO_GUARDADO = "[mensagem não gravada — conversa sem atendimento liberado]";

/**
 * O que vai para a coluna `conteudo`.
 *
 * `liberada` é obrigatório em `gravarMensagem` de propósito: parâmetro
 * opcional aqui teria como padrão o comportamento antigo, e o esquecimento
 * de um chamador voltaria a gravar a vida pessoal de alguém em silêncio. É
 * a mesma lição que tirou `interacaoId` dos parâmetros — quando um valor só
 * pode ser usado errado por omissão, ele não pode ser omitido.
 */
export function conteudoParaGravar(texto: string, liberada: boolean): string {
  return liberada ? texto : TEXTO_NAO_GUARDADO;
}

/** O resumo que aparece na lista de conversas segue a mesma regra. */
export function resumoParaGravar(texto: string, liberada: boolean): string {
  return liberada ? texto.slice(0, 500) : TEXTO_NAO_GUARDADO;
}
