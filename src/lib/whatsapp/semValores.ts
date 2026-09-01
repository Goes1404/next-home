/**
 * A IA fala o PISO, e só o piso.
 *
 * Decisão comercial da imobiliária: valor é conversa de corretor, não de
 * assistente. Um número dito no WhatsApp vira expectativa — e quando a
 * tabela muda, ou o desconto depende de forma de pagamento, quem paga a
 * conta da frustração é o corretor.
 *
 * Isto mora aqui, e não só no prompt, pelo mesmo motivo de `vozHumana.ts`:
 * instrução de prompt é probabilística. O modelo obedece na maioria das
 * vezes e escorrega justo na resposta que importa — e aqui o escorregão
 * não é feio, é um compromisso comercial feito por um robô.
 *
 * ## O que mudou em 01/09/2026, e por quê
 *
 * A regra era "nunca fala preço". Três rodadas do eval de conversa
 * mostraram o custo: nas personas que insistem em valor — 32, 23 e 20
 * menções de preço em três das quatro transcrições — a conversa NUNCA
 * avança. `avancou = 0` em todas. E não era defeito de prompt: a Sofia não
 * tinha jogada. Não podia dizer valor, não podia passar para o humano
 * (regra 21), então desviava até o teto de turnos. O loop era consequência
 * da regra, não do texto.
 *
 * Agora ela pode dizer **"a partir de R$ X"**, e nada além disso. Continua
 * proibido: valor exato de uma unidade, desconto, entrada, parcela,
 * simulação. Esses são a conversa do corretor, e é para eles que a visita
 * continua sendo o lugar.
 *
 * ## O piso vem do CATÁLOGO, não do modelo
 *
 * A faixa só passa se o número for igual a um `preco_a_partir` cadastrado.
 * Não é confiança no modelo: é a mesma construção do `resolverMidia` — o
 * código resolve o dado, e alucinação vira impossível. Um piso inventado
 * (ou o piso do imóvel errado) é exatamente o compromisso comercial feito
 * por um robô que esta função existe para impedir.
 *
 * Medido antes de construir: **21 dos 25 publicados têm piso cadastrado**
 * (R$ 249.000 a R$ 1.289.900). Para os outros 4 nada passa, e a ficha do
 * prompt diz a ausência em voz alta.
 */

/**
 * Frase de valor que o modelo às vezes solta, mesmo instruído.
 *
 * Cobre "R$ 1.289.900", "1,2 milhão", "800 mil", "a partir de 460.000" —
 * e deixa passar número que claramente não é dinheiro (metragem, ano,
 * quantidade de dormitórios, horário).
 */
const PADROES_DE_VALOR: RegExp[] = [
  /R\$\s?[\d.,]+/gi,
  /\b\d{1,3}(?:[.\s]\d{3})+(?:,\d{2})?\s*(?:reais)?\b/gi,
  /\b\d+(?:[,.]\d+)?\s*(?:milh(?:ão|ões)|mil\b(?!\s*(?:metros|m²|km)))/gi,
  /*
   * Percentual. Entrou junto com a liberação do piso (v28): agora que uma
   * cifra pode passar, "consigo 10% de desconto" é o vazamento mais
   * provável — e é exatamente o número que o corretor negocia, não a
   * assistente. Neste domínio percentual é quase sempre financeiro, e o
   * custo de um falso positivo é uma frase de desvio.
   */
  /\b\d{1,2}(?:[,.]\d+)?\s?%/g,
];

/**
 * "a partir de R$ 249.000", "a partir de 249 mil", "partindo de R$249mil".
 *
 * Exige a locução ANTES do número, na mesma frase e a até ~20 caracteres:
 * sem essa amarra, "o valor a partir do qual financiamos é R$ 300.000"
 * passaria — e isso é condição de banco, não piso de tabela.
 */
const FAIXA = /\b(?:a partir de|partindo de|a partir dos|desde)\s+(?:R\$\s?)?([\d.,]+)\s*(mil|milh(?:ão|ões))?/gi;

/** "249.000" → 249000; "249 mil" → 249000; "1,2 milhão" → 1200000. */
function comoNumero(bruto: string, escala?: string): number | null {
  const limpo = bruto.replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(limpo);
  if (!Number.isFinite(n)) return null;

  if (/^mil$/i.test(escala ?? "")) return n * 1000;
  if (/^milh/i.test(escala ?? "")) return n * 1_000_000;
  return n;
}

/**
 * Os pisos que esta resposta pode citar — os `preco_a_partir` dos imóveis
 * que foram ao prompt.
 *
 * Tolerância de 1 real para arredondamento de escrita ("249 mil" para um
 * cadastro de 249.000 é o mesmo número; "1,2 milhão" para 1.198.000 não é).
 */
function ehPisoConhecido(valor: number, permitidos: readonly number[]): boolean {
  return permitidos.some((p) => Math.abs(p - valor) <= 1);
}

/**
 * Todo número de dinheiro da frase, normalizado e sem repetição.
 *
 * A dedupe por VALOR não é detalhe: os padrões se sobrepõem — "R$ 470.000"
 * casa com o padrão do cifrão E com o do milhar, e contar duas ocorrências
 * do mesmo número faria a frase parecer ter dois valores onde há um. Foi
 * assim que a primeira versão desta função reprovou a faixa legítima.
 */
function valoresDaFrase(frase: string): number[] {
  const brutos = PADROES_DE_VALOR.flatMap((padrao) => {
    padrao.lastIndex = 0;
    return [...frase.matchAll(padrao)].map((m) => ({
      texto: m[0],
      de: m.index ?? 0,
      ate: (m.index ?? 0) + m[0].length,
    }));
  });

  /*
   * Casamento que se SOBREPÕE a outro maior é descartado — sobreposição,
   * não contenção. Em "a partir de R$ 1,29 milhão" o padrão do cifrão pega
   * "R$ 1,29" (sem a escala) e o do milhão pega "1,29 milhão": um começa
   * antes e o outro termina depois, então nenhum contém o outro. Ficariam
   * dois valores — 1,29 e 1.290.000 — e o primeiro não é piso de nada.
   * Vence o mais longo, que é o que carrega a escala.
   */
  const achados = brutos
    .filter(
      (a) =>
        !brutos.some(
          (b) => b !== a && b.de < a.ate && a.de < b.ate && b.texto.length > a.texto.length,
        ),
    )
    .map((a) => a.texto);

  const valores = achados
    .filter((bruto) => !bruto.includes("%"))
    .map((bruto) => {
      const escala = /milh/i.test(bruto) ? "milhao" : /\bmil\b/i.test(bruto) ? "mil" : undefined;
      const digitos = bruto.replace(/[^\d.,]/g, "");
      return comoNumero(digitos, escala);
    })
    .filter((n): n is number => n !== null && n > 0);

  return [...new Set(valores)];
}

/**
 * A frase inteira é uma citação legítima de piso?
 *
 * TODOS os valores da frase precisam ser pisos conhecidos E estar
 * apresentados como faixa. Basta um número solto — "a partir de R$ 470.000,
 * com entrada de R$ 50.000" — para a frase inteira cair, porque a entrada é
 * justamente o que continua proibido.
 */
export function ehFaixaPermitida(frase: string, permitidos: readonly number[]): boolean {
  if (permitidos.length === 0) return false;

  FAIXA.lastIndex = 0;
  const comoFaixa = new Set(
    [...frase.matchAll(FAIXA)]
      .map((m) => comoNumero(m[1], m[2]))
      .filter((n): n is number => n !== null),
  );

  if (comoFaixa.size === 0) return false;

  const todos = valoresDaFrase(frase);
  if (todos.length === 0) return false;

  return todos.every(
    (v) => ehPisoConhecido(v, permitidos) && [...comoFaixa].some((f) => Math.abs(f - v) <= 1),
  );
}

export function contemValor(texto: string): boolean {
  return PADROES_DE_VALOR.some((p) => {
    p.lastIndex = 0;
    return p.test(texto);
  });
}

/**
 * O que dizer no lugar do número.
 *
 * Não é evasiva: é a resposta que um corretor bom dá. Preço sem contexto de
 * entrada, prazo e forma de pagamento não ajuda ninguém a decidir — e é
 * justamente essa conversa que leva à visita.
 */
const DESVIOS = [
  "Os valores variam conforme a unidade, o andar e a forma de pagamento — prefiro te passar a condição certa para o seu caso.",
  "O valor depende da unidade e das condições de entrada. Consigo levantar isso certinho para você.",
  "Cada unidade tem uma condição diferente. Deixa eu confirmar a que faz sentido para você.",
];

/**
 * Tira valores do texto que vai para o cliente.
 *
 * A frase inteira que contém o número é substituída, não só o número: um
 * texto como "sai por R$ 1.200.000" viraria "sai por" — pior que a versão
 * original, porque parece defeito.
 */
/**
 * Tira separador de balão que ficou órfão depois de uma frase ser removida.
 *
 * Flagrado no eval da v12: o cliente disse "meu teto é 600 mil", o modelo
 * repetiu o número, `removerValores` cortou a frase — e a resposta chegou
 * ao cliente começando com "--- ". Um traço solto no primeiro balão não
 * parece uma pessoa digitando; parece software quebrado, que é o mesmo
 * defeito que o quebrador de mensagens já corrigiu em outra forma.
 *
 * Também colapsa separador duplicado, pelo mesmo motivo: a frase do meio
 * some e sobram dois "---" colados.
 */
export function limparSeparadoresOrfaos(texto: string): string {
  return texto
    .replace(/(\s*---\s*){2,}/g, " --- ")
    .replace(/^\s*(---\s*)+/, "")
    .replace(/(\s*---)+\s*$/, "")
    .replace(/[ 	]{2,}/g, " ")
    .trim();
}

export function removerValores(
  texto: string,
  semente = 0,
  /** Os `preco_a_partir` dos imóveis que foram ao prompt. Vazio = nada passa. */
  pisosPermitidos: readonly number[] = [],
): { texto: string; removeu: boolean } {
  if (!contemValor(texto)) return { texto, removeu: false };

  const frases = texto.split(/(?<=[.!?])\s+/);
  const limpas = frases.filter((f) => !contemValor(f) || ehFaixaPermitida(f, pisosPermitidos));

  // Nada foi cortado: a resposta inteira era faixa legítima.
  if (limpas.length === frases.length) return { texto, removeu: false };

  const desvio = DESVIOS[semente % DESVIOS.length];

  // Se sobrou conversa, o desvio entra no lugar da frase removida. Se o
  // texto INTEIRO era sobre preço, o desvio vira a resposta.
  const resultado = limpas.length > 0 ? `${limpas.join(" ")} ${desvio}` : desvio;

  return { texto: resultado.trim(), removeu: true };
}
