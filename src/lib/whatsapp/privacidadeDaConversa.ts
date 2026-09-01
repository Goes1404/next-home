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
 * ## A condição CERTA — e a errada, que eu escrevi primeiro
 *
 * A primeira versão usava `liberado_por_palavra_chave = false`. Está
 * errado, e a medição mostrou o tamanho: o bot havia falado em **26** das
 * 62 conversas assim, **15 vezes nas últimas 24h**, e 22 delas eram
 * elegíveis para o few-shot. Aquela flag é UMA das portas; a outra é o
 * número já ser do CRM (`cliente_conhecido`), e campanha nunca precisa de
 * palavra nenhuma.
 *
 * Guardar por aquela condição teria apagado conversa real de cliente, viva
 * no mesmo dia, e esvaziado o corpus de aprendizado. A condição é a mesma
 * de `exigePalavraChave` (`modoBot.ts`) — se as duas divergirem, o sistema
 * volta a gravar o que não deve, ou a esquecer o que precisa.
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
 * Esta conversa é atendimento — ou seja, alguém autorizou.
 *
 * Espelha `exigePalavraChave` do `modoBot.ts`, ao contrário: lá se pergunta
 * se a trava se aplica; aqui, se a conversa passou por ela. Três portas, e
 * qualquer uma basta:
 *
 * 1. a palavra-chave foi dita nesta conversa;
 * 2. o número já era do CRM antes dela (alguém o cadastrou de propósito);
 * 3. a conversa nasceu de campanha (o disparo é decisão do corretor).
 *
 * Fora das três, ninguém autorizou nada — e é só aí que o texto não é
 * guardado.
 */
export function conversaEhAtendimento(conversa: {
  liberadoPorPalavraChave: boolean;
  clienteConhecido?: boolean | null;
  origem?: string | null;
}): boolean {
  return (
    conversa.liberadoPorPalavraChave ||
    conversa.clienteConhecido === true ||
    conversa.origem === "campanha"
  );
}

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
