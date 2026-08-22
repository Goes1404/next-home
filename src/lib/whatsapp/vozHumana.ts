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
