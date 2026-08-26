/**
 * O link porteiro: /wa/<campanha> → WhatsApp do corretor da vez.
 *
 * O anúncio do Meta aponta para um link NOSSO; no clique, o servidor
 * sorteia o corretor (rodízio por carga, `sortear_corretor_whatsapp` no
 * banco — a mesma régua da roleta de leads) e redireciona para o wa.me
 * dele com a mensagem pronta da campanha. Cada corretor atende no próprio
 * número — número central único foi descartado pelo usuário (26/08/2026).
 *
 * Este módulo é só a parte PURA (mensagem, reconhecimento, resolução de
 * campanha), para ser testável sem rede: a rota e o webhook chamam daqui.
 */

/** Mesma normalização do focoDaConversa: minúsculas e sem acento. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function soLetrasEEspacos(texto: string): string {
  return normalizar(texto)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A mensagem pronta que o clique pré-preenche no WhatsApp.
 *
 * O texto é DETERMINÍSTICO por imóvel de propósito: é ele que permite ao
 * webhook reconhecer "isto veio de anúncio" sem nenhum metadado do
 * provedor — e o nome oficial do imóvel dentro dele é o que a Sofia já
 * resolve via focoDaConversa (nome + apelidos).
 */
export function mensagemDeAnuncio(nomeImovel: string): string {
  return `Olá! Gostaria de mais informações do ${nomeImovel.trim()}.`;
}

const PREFIXO_ANUNCIO = soLetrasEEspacos("Olá! Gostaria de mais informações do ");

/**
 * Esta mensagem de cliente é a mensagem pronta de um anúncio?
 *
 * Devolve o nome do imóvel citado, ou null. O casamento é por PREFIXO
 * normalizado e com teto de tamanho: a trava de palavra-chave existe para
 * proteger o número pessoal do corretor, então o reconhecimento é estrito —
 * falso positivo aqui liga a IA numa conversa da família, que é o caso
 * real que originou a trava. Ninguém abre conversa pessoal com exatamente
 * "Olá! Gostaria de mais informações do X".
 */
export function reconhecerMensagemDeAnuncio(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const limpo = soLetrasEEspacos(texto);
  if (limpo.length > 120) return null;
  if (!limpo.startsWith(PREFIXO_ANUNCIO)) return null;
  const nome = limpo.slice(PREFIXO_ANUNCIO.length).trim();
  return nome.length >= 3 ? nome : null;
}

export type CampanhaResolvida = {
  id: string;
  slug: string;
  nome: string;
};

/**
 * Qual imóvel o pedaço da URL identifica (/wa/manaca, /wa/terra-alta).
 *
 * Casamento EXATO (normalizado) contra slug, nome e apelidos — nada de
 * fuzzy: quem escreve o link é quem cria a campanha, não um cliente
 * digitando no celular. Link errado tem de falhar visível na hora do
 * teste, não acertar "quase".
 */
export function resolverCampanha(
  campanha: string,
  imoveis: { id: string; slug: string; nome: string; nomesAlternativos?: string[] | null }[],
): CampanhaResolvida | null {
  const alvo = soLetrasEEspacos(decodeURIComponent(campanha).replace(/[-_]/g, " "));
  if (!alvo) return null;

  for (const imovel of imoveis) {
    const rotulos = [
      imovel.slug.replace(/-/g, " "),
      imovel.nome,
      ...(imovel.nomesAlternativos ?? []),
    ];
    if (rotulos.some((r) => soLetrasEEspacos(r) === alvo)) {
      return { id: imovel.id, slug: imovel.slug, nome: imovel.nome };
    }
  }
  return null;
}
