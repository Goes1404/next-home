/**
 * Tira da resposta as marcas que denunciam que ela veio de uma IA.
 *
 * Isto não é preciosismo de estilo: é o que o cliente REALMENTE recebeu em
 * produção antes desta limpeza —
 *
 *   "*   **Vista AlphaGran** (Alphagran, Barueri): Um alto padrão…"
 *
 * O WhatsApp não renderiza markdown. `**negrito**` chega ao cliente com os
 * quatro asteriscos à mostra, e `*   ` vira um asterisco solto no início da
 * linha. Ninguém escreve assim para um amigo — mas todo modelo treinado em
 * markdown escreve, o tempo todo.
 *
 * Vive fora do prompt de propósito. Instrução de prompt é probabilística:
 * funciona na maioria das vezes e falha justo na resposta que importa. Uma
 * função determinística funciona sempre, e ainda é testável.
 */

/** Aberturas de robô. O texto real de produção começava com estas. */
const ABERTURAS_DE_ROBO = [
  /^(que\s+)?[óo]tima\s+pergunta[!.]?\s*/i,
  /^excelente\s+pergunta[!.]?\s*/i,
  /^(claro|perfeito|entendi|entendido|com certeza|certamente)[!.,]\s*/i,
  /^ol[áa]!\s*(entendi|claro|perfeito)[!.,]?\s*/i,
  /^fico\s+feliz\s+em\s+(ajudar|saber)[!.]?\s*/i,
  /^espero\s+ter\s+ajudado[!.]?\s*$/i,
  // Produção, 28/09/2026: primeira resposta a um "Oi". Agradece o oi em
  // vez de responder a pergunta que veio junto.
  /^que\s+bom\s+(receber|ter)\s+(o\s+|a\s+)?(seu|sua)\s+(oi|mensagem|contato)[!.]?\s*/i,
];

/**
 * Converte a formatação para o que o WhatsApp entende de verdade.
 *
 * O app usa `*negrito*` com UM asterisco e `_itálico_` com underscore.
 * Markdown de dois asteriscos e cabeçalhos com `#` chegam crus na tela.
 */
export function formatarParaWhatsapp(texto: string): string {
  return (
    texto
      // `**negrito**` → `*negrito*` (a sintaxe que o WhatsApp renderiza).
      .replace(/\*\*([^*\n]+)\*\*/g, "*$1*")
      // `__itálico__` e `_itálico_` já funcionam; `***x***` não.
      .replace(/\*{3,}([^*\n]+)\*{3,}/g, "*$1*")
      // Cabeçalhos markdown não existem no WhatsApp.
      .replace(/^#{1,6}\s+/gm, "")
      // Marcador de lista no início da linha: vira travessão, que é como
      // gente escreve lista curta no WhatsApp quando precisa.
      .replace(/^\s*[*+]\s{2,}/gm, "— ")
      .replace(/^\s*[-*+]\s+(?=\S)/gm, "— ")
      // Numeração "1. " também soa a documento; o travessão basta.
      .replace(/^\s*\d+\.\s+(?=\S)/gm, "— ")
      // Link markdown: fica só o texto, porque a URL vai como anexo nativo.
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
  );
}

/**
 * Remove a abertura de manual de atendimento, quando ela existe.
 *
 * Só corta se sobrar frase de verdade depois: uma resposta que é APENAS
 * "Claro!" perderia todo o conteúdo, e um balão vazio é pior que um clichê.
 */
export function removerAberturaDeRobo(texto: string): string {
  let resultado = texto.trimStart();

  for (const padrao of ABERTURAS_DE_ROBO) {
    const semAbertura = resultado.replace(padrao, "").trimStart();
    if (semAbertura.length >= 20) resultado = semAbertura;
  }

  // A primeira letra pode ter ficado minúscula depois do corte.
  return resultado.charAt(0).toUpperCase() + resultado.slice(1);
}

/**
 * Passa o texto da IA pela peneira antes de virar mensagem no WhatsApp.
 */
export function soarHumano(texto: string): string {
  const limpo = formatarParaWhatsapp(texto).trim();
  return removerAberturaDeRobo(limpo)
    // Três ou mais quebras viram parágrafo duplo — o chunking usa isso como
    // marcador de corte, e um bloco de linhas vazias o confundiria.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Cumprimento no começo de uma resposta NO MEIO da conversa.
 *
 * Produção, 28/09/2026: "Oi Matheus, tudo bem?" no terceiro turno, depois
 * de o cliente já ter respondido "Na aldeia". Pessoa cumprimenta uma vez;
 * quem abre toda mensagem com "Oi, tudo bem?" é robô, e o cliente percebe
 * na hora.
 *
 * Só age quando o bot já falou nas últimas falas E a última fala é do
 * cliente, ou seja, a conversa está andando. A primeira mensagem e o
 * retorno depois do silêncio do cliente (a última fala é nossa) podem
 * cumprimentar. E só corta se sobrar frase de verdade, pela mesma régua de
 * `removerAberturaDeRobo`.
 */
const CUMPRIMENTO =
  /^(oi|ol[áa]|opa|e\s+a[íi]|bom\s+dia|boa\s+tarde|boa\s+noite)(?![a-zà-ú])(\s*,?\s*[A-ZÀ-Ú][a-zà-ú]+(?=\s*[!.,?]|\s+tudo))?\s*[!.,]*\s*((tudo\s+(bem|bom|certo)|como\s+vai|como\s+voc[êe]\s+est[áa])\s*\??[!.]*)?\s*(---\s*)?/i;

export function removerCumprimentoRepetido(
  texto: string,
  historico: readonly { remetente: string; texto: string }[] | undefined,
): string {
  const falas = historico ?? [];
  if (falas.length === 0) return texto;
  if (falas[falas.length - 1].remetente !== "cliente") return texto;
  const botFalouHaPouco = falas.slice(-10).some((f) => f.remetente === "bot");
  if (!botFalouHaPouco) return texto;

  const inicio = texto.trimStart();
  const semCumprimento = inicio.replace(CUMPRIMENTO, "").trimStart();
  if (semCumprimento === inicio || semCumprimento.length < 20) return texto;
  return semCumprimento.charAt(0).toUpperCase() + semCumprimento.slice(1);
}
