/**
 * Limpa o texto que sai de uma apresentação antes de ele virar prompt.
 *
 * `extrairTextoDePdf` decide o que é fluxo de texto olhando os primeiros
 * bytes do stream, e em book de construtora isso deixa passar fluxo de fonte
 * e de imagem: o texto do Dom Parque tem 28 mil caracteres e COMEÇA com
 * lixo binário. Como o prompt leva só os primeiros milhares, o modelo
 * recebia ruído em vez da ficha técnica — e devolvia rascunho vazio e planta
 * sem metragem. O sintoma parecia do modelo; era da entrada.
 *
 * A limpeza mora aqui, e não em `pdfTexto.ts`, porque aquele módulo serve à
 * importação de LEADS: lá o texto é tabela de contatos, com outra régua de
 * ruído, e mexer nele mudaria um caminho que já funciona em produção.
 */

/** Linha de um caractere só sobra de qualquer varredura; não informa nada. */
const TAMANHO_MINIMO_DA_LINHA = 2;

/**
 * A assinatura do lixo não é o caractere estranho — `³`, `«` e `Ï` contam
 * como letra e passariam por qualquer filtro de "é letra?". A assinatura é a
 * FORMA: fluxo de fonte lido como texto vira uma fileira de caracteres
 * soltos ("³ w M D v D · « R ¦"), enquanto frase tem palavras.
 */
function pareceFrase(linha: string): boolean {
  const palavras = linha.split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return false;

  // Célula de ficha técnica é conteúdo, e das mais valiosas: "52 m", "11",
  // "16 e 17" são a tabela de metragens e finais. A primeira versão desta
  // régua exigia palavra de três letras e apagava a ficha inteira.
  //
  // "Tem dígito" seria permissivo demais: lixo de fonte também tem número no
  // meio ("Õ Ô å ç ¸ æ ã Ô 9 â"). Célula é SÓ número, vírgula, espaço e no
  // máximo um "m" de metragem.
  if (/^[\d.,]+(\s*(m|m2|m²))?$/i.test(linha)) return true;
  if (/^[\d,\s]+(e\s*[\d,\s]+)*$/i.test(linha)) return true;

  if (palavras.length < 4) return palavras.some((p) => p.length >= 3);

  const comCorpo = palavras.filter((p) => p.length >= 3).length;
  return comCorpo / palavras.length >= 0.4;
}

/**
 * Lixo de fonte também vem cheio de sinal ("(?(q(¢(Ô) )8)k)"), e ter um
 * dígito no meio não o torna tabela. Frase e tabela têm poucos símbolos.
 */
function poucosSimbolos(linha: string): boolean {
  const simbolos = linha.match(/[^\p{L}\p{N}\s,.°º²ª-]/gu)?.length ?? 0;
  return simbolos / linha.length <= 0.3;
}

/**
 * Segunda régua, para o lixo que passa pela primeira: fluxo de fonte também
 * produz sequências longas e sem espaço ("UuUAV V(c)V/WDW"), que têm
 * "palavras" e enganam `pareceFrase`. O que denuncia é o vocabulário —
 * português usa um conjunto pequeno de caracteres, e sinal tipográfico solto
 * não aparece em frase.
 */
function vocabularioDeTexto(linha: string): boolean {
  const atipicos = linha.match(/[^\p{L}\p{N}\s.,;:!?()[\]{}/%@+\-'"&$#*=_|<>]/gu)?.length ?? 0;
  return atipicos / linha.length <= 0.08;
}

export function limparTextoDeApresentacao(bruto: string): string {
  return bruto
    .split("\n")
    .map((linha) =>
      linha
        // `\p{C}` é a categoria Unicode de controle e afins — o que sobra de
        // fluxo binário lido como se fosse texto.
        .replace(/\p{C}/gu, " ")
        .replace(/[ \t]+/g, " ")
        .trim(),
    )
    .filter((linha) => linha.length >= TAMANHO_MINIMO_DA_LINHA)
    .filter(pareceFrase)
    .filter(poucosSimbolos)
    .filter(vocabularioDeTexto)
    .join("\n");
}
