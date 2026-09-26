/**
 * O link porteiro: /wa/<campanha> → WhatsApp do corretor da vez.
 *
 * O anúncio do Meta aponta para um link NOSSO; no clique, o servidor
 * sorteia o corretor (`sortear_corretor_whatsapp` no banco: aleatório entre
 * os conectados, sem repetir quem recebeu o último clique daquele imóvel —
 * 0117) e redireciona para o wa.me
 * dele com a mensagem pronta da campanha. Cada corretor atende no próprio
 * número — número central único foi descartado pelo usuário (26/08/2026).
 *
 * Este módulo é só a parte PURA (mensagem, reconhecimento, resolução de
 * campanha), para ser testável sem rede: a rota e o webhook chamam daqui.
 */
import { clienteTrouxeFraseDeEntrada } from "./modoBot";

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

/** Como reconhecemos que a pessoa está respondendo a uma peça NOSSA. */
export type ConviteDeEntrada = {
  via: "mensagem_do_anuncio" | "frase_de_entrada";
  /** O imóvel citado, quando o texto é o nosso e o traz. */
  imovel: string | null;
};

/**
 * Esta primeira fala autoriza CADASTRAR quem ainda não é lead?
 *
 * ## Por que ela existe
 *
 * A 0111 fechou o webhook para número desconhecido — sem lead, nada é
 * criado, gravado ou respondido. A razão continua boa: a instância roda no
 * WhatsApp PESSOAL do corretor, e a conversa da família dele não pode virar
 * cadastro. Só que a porta fechou também para quem o anúncio PAGOU para
 * chegar: a pessoa clica, escreve, e a mensagem morre sem resposta e sem
 * rastro no CRM.
 *
 * O que separa os dois casos não é quem escreveu — é o que foi escrito.
 * Quem responde a uma peça nossa usa as palavras dela.
 *
 * ## As duas portas, e por que são duas
 *
 * 1. **A mensagem pronta do nosso link** (`mensagemDeAnuncio`): o texto é
 *    determinístico e nós o geramos, então reconhecê-lo é quase certeza.
 *    Ela ainda entrega o NOME do imóvel de graça — a conversa já nasce
 *    focada nele.
 * 2. **As frases que o corretor cadastrou** (`palavras_entrada_cliente`):
 *    "vim pelo anúncio", "vi no instagram", "quero mais informações". Elas
 *    existem porque, na prática, ninguém cola o texto pré-preenchido — a
 *    pessoa escreve com as palavras dela. Esta porta é mais larga e é
 *    escolha do corretor: são as frases DELE, num campo que só ele edita.
 *
 * O erro é assimétrico e o desenho segue isso: não reconhecer custa um lead
 * (que ele ainda vê no celular, porque o número é dele); reconhecer errado
 * cadastra um parente e começa a gravar conversa pessoal. Por isso nada de
 * fuzzy, nada de "oi" e nada de inferir por metadado do provedor.
 */
export function reconhecerConviteDeEntrada(params: {
  texto: string | null | undefined;
  palavrasEntradaCliente: string | null | undefined;
}): ConviteDeEntrada | null {
  const imovel = reconhecerMensagemDeAnuncio(params.texto);
  if (imovel) return { via: "mensagem_do_anuncio", imovel };

  if (
    params.texto &&
    clienteTrouxeFraseDeEntrada({
      mensagem: params.texto,
      palavrasEntradaCliente: params.palavrasEntradaCliente,
    })
  ) {
    /*
     * `imovel: null` de propósito. A frase é livre ("vim pelo anúncio do
     * Manacá") e extrair o nome dela seria adivinhação — quem resolve o
     * imóvel a partir da fala já é o `focoDaConversa`, com nome e apelidos,
     * na mensagem seguinte. Chutar aqui poria o imóvel ERRADO na ficha, que
     * é pior que deixá-la vazia.
     */
    return { via: "frase_de_entrada", imovel: null };
  }

  return null;
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
