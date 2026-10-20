/**
 * O segmento do site quando a requisição chega sem um host válido. Não é um
 * endereço de grupo (o resolvedor recusa antes de perguntar ao banco), então
 * cai na página neutra.
 */
export const SEGMENTO_SEM_ENDERECO = "desconhecido";
