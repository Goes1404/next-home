import type { Fala } from "./rajada";

/**
 * O que a Sofia JÁ ofereceu de horário, e o cliente não aceitou.
 *
 * ## O defeito, medido
 *
 * Eval de conversa da v26 (31/08/2026), persona `insiste-no-desconto`: ela
 * ofereceu **"sábado às 10h ou às 11h" três vezes**, quase palavra por
 * palavra, contra um cliente que respondia "não faz sentido visitar sem
 * saber o preço". Foi a última fonte de repetição a sobrar depois que a
 * guarda anti-eco parou de ser, ela mesma, um loop.
 *
 * A correção anterior atacou a JOGADA: a regra 27(b) passou a mandar
 * oferecer a visita em vez de mais uma pergunta de funil, e o número não
 * mudou — ela só trocou a pergunta repetida pelo horário repetido. O
 * defeito nunca foi QUAL jogada ela escolhe; é que ela não troca de jogada
 * quando a escolhida não funciona.
 *
 * ## Por que em código, e não no prompt
 *
 * O prompt JÁ mandava não repetir: `blocoDeHorarios` diz, com todas as
 * letras, "se ele recusar os dois, ofereça os DOIS SEGUINTES da lista,
 * nunca os mesmos de novo". O modelo repetiu três vezes assim mesmo.
 * **Instrução de prompt é probabilística e falha justo na resposta que
 * importa; função determinística vale sempre e é testável** — é a mesma
 * lição do `sanearRespostaIA`, do `corrigirVisitaNoPassado` e do
 * `resolverMidia`.
 *
 * E há um detalhe que torna isto indispensável hoje: **nenhum dos 8
 * corretores tem agenda configurada**, então `blocoHorariosReais` sai
 * vazio e nada limita o que o modelo inventa. Sem este módulo, não existe
 * nada no caminho que saiba que "sábado às 10h" já foi dito.
 *
 * ## O erro é assimétrico, e o lado barato é listar demais
 *
 * Ao contrário do reconhecimento de imóvel, aqui exagerar é barato: se
 * listarmos um horário que não era bem uma oferta, o modelo apenas propõe
 * OUTRO. Deixar de listar é que devolve o loop. Por isso a régua é
 * generosa dentro da frase, e restrita à FRASE: só conta trecho do bot que
 * tenha marca de oferta ("posso", "que tal", "prefere", "consigo"…) junto
 * com dia ou hora.
 */

const DIAS =
  /\b(hoje|amanha|depois de amanha|segunda|terca|quarta|quinta|sexta|sabado|domingo|fim de semana|fds|feriado)\b/g;

/** "10h", "10 h", "10h30", "às 10", "10:00", "de manhã", "à tarde", "à noite". */
const HORAS = /\b(\d{1,2})\s*(?:h(?:oras)?\b|:(\d{2}))|\bas\s+(\d{1,2})\b|\b(manha|tarde|noite)\b/g;

/**
 * A frase precisa parecer PROPOSTA. Sem isto, "a obra começou em março" e
 * "o decorado abre de manhã" (informação, não convite) entrariam na lista.
 */
const MARCA_DE_OFERTA =
  /\b(posso|podemos|consigo|que tal|prefere|prefer|te mostro|te levo|te apresento|encaixo|marco|agendo|fica melhor|vamos|combinamos)\b/;

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Uma frase por vez: o que decide a oferta é a vizinhança, não a mensagem inteira. */
function frases(texto: string): string[] {
  return texto
    .split(/[.!?\n]+/)
    .map((f) => f.trim())
    .filter(Boolean);
}

/**
 * A assinatura de um horário oferecido: dia + hora, quando os dois
 * aparecem; só um deles, quando é só um ("sábado de manhã" é oferta
 * legítima e precisa contar).
 */
function assinaturasDaFrase(fraseNormalizada: string): string[] {
  if (!MARCA_DE_OFERTA.test(fraseNormalizada)) return [];

  const dias = [...fraseNormalizada.matchAll(DIAS)].map((m) => m[1]);
  const horas = [...fraseNormalizada.matchAll(HORAS)]
    .map((m) => m[1] ?? m[3] ?? m[4])
    .filter(Boolean)
    // "às 10" e "10h" são o mesmo horário: normaliza para o número puro.
    .map((h) => (/^\d+$/.test(h) ? String(Number(h)) : h));

  if (dias.length === 0 && horas.length === 0) return [];
  if (horas.length === 0) return dias.map((d) => d);
  if (dias.length === 0) return horas.map((h) => `?-${h}`);

  /*
   * Produto cartesiano de propósito: "posso sábado às 10h ou às 11h" tem um
   * dia e duas horas, e as DUAS ofertas foram feitas. Sem o produto, a
   * segunda escaparia e voltaria na resposta seguinte.
   */
  return dias.flatMap((d) => horas.map((h) => `${d}-${h}`));
}

export interface HorariosOferecidos {
  /** Assinaturas normalizadas, para comparar com a agenda real. */
  assinaturas: string[];
  /** As frases como ela as escreveu — é o que entra no prompt. */
  frases: string[];
}

/**
 * Tudo o que a Sofia já ofereceu de horário nesta conversa.
 *
 * Só as falas do BOT. As do corretor ficam de fora porque ele fala pelo
 * canal dele e pode ter combinado por telefone; e as do cliente, porque
 * horário que ELE propôs não é oferta a evitar — é o contrário.
 */
export function horariosJaOferecidos(historico: readonly Fala[]): HorariosOferecidos {
  const assinaturas = new Set<string>();
  const ditas: string[] = [];

  for (const fala of historico) {
    if (fala.remetente !== "bot") continue;

    for (const frase of frases(fala.texto)) {
      const achadas = assinaturasDaFrase(normalizar(frase));
      if (achadas.length === 0) continue;

      achadas.forEach((a) => assinaturas.add(a));
      if (!ditas.includes(frase)) ditas.push(frase);
    }
  }

  return { assinaturas: [...assinaturas], frases: ditas };
}

/** Um horário da agenda real que já foi oferecido não deve voltar à lista. */
export function jaFoiOferecido(rotulo: string, assinaturas: readonly string[]): boolean {
  const alvo = normalizar(rotulo);
  const dias = [...alvo.matchAll(DIAS)].map((m) => m[1]);
  const horas = [...alvo.matchAll(HORAS)]
    .map((m) => m[1] ?? m[3] ?? m[4])
    .filter(Boolean)
    .map((h) => (/^\d+$/.test(h) ? String(Number(h)) : h));

  if (dias.length === 0 || horas.length === 0) return false;

  return dias.some((d) => horas.some((h) => assinaturas.includes(`${d}-${h}`)));
}

/**
 * A lista da agenda real, sem o que já foi oferecido e recusado.
 *
 * `blocoDeHorarios` JÁ dizia "nunca os mesmos de novo" e o modelo ignorou
 * três vezes seguidas. **O que ele não vê, ele não oferece** — a mesma
 * solução que tirou o preço do catálogo do prompt e que faz o foco
 * encolher a lista de imóveis.
 *
 * Recebe qualquer coisa com `rotulo` para não puxar o módulo de CRM para
 * dentro do WhatsApp: a dependência entre as duas camadas já corre no
 * outro sentido.
 *
 * Nunca devolve vazio quando havia horário. Sobrar zero opção trocaria a
 * repetição por SILÊNCIO sobre a visita, que é pior — e o caso está coberto
 * pelo bloco abaixo, que manda devolver a escolha ao cliente.
 */
export function semOsJaOferecidos<T extends { rotulo: string }>(
  horarios: readonly T[],
  assinaturas: readonly string[],
): readonly T[] {
  if (assinaturas.length === 0) return horarios;

  const sobraram = horarios.filter((h) => !jaFoiOferecido(h.rotulo, assinaturas));
  return sobraram.length > 0 ? sobraram : horarios;
}

/**
 * O bloco que impede a repetição quando NÃO há agenda configurada — que é
 * o caso dos 8 corretores hoje.
 *
 * Com agenda, quem resolve é a filtragem da lista (o que o modelo não vê,
 * ele não oferece). Sem agenda, o modelo inventa o horário, e a única
 * defesa possível é dizer nominalmente o que já saiu.
 *
 * Só entra a partir de DUAS ofertas: a primeira repetição pode ser o
 * cliente não tendo visto a mensagem, e um bloco que aparece sempre deixa
 * de ser lido — a mesma régua do `evolucaoConversa`.
 */
export function blocoNaoRepitaHorario(oferecidos: HorariosOferecidos): string | undefined {
  if (oferecidos.frases.length < 2) return undefined;

  return [
    "VOCÊ JÁ OFERECEU ESTES HORÁRIOS E ELE NÃO ACEITOU:",
    ...oferecidos.frases.slice(-4).map((f) => `- "${f}"`),
    "",
    "Repetir qualquer um deles é o que trava esta conversa — ele já viu e já não quis.",
    "Nesta resposta: ou proponha um dia DIFERENTE dos de cima, ou devolva a escolha a ele (\"qual dia da semana fica melhor pra você?\").",
    "E se ele estiver preso em outro assunto, resolva o assunto dele primeiro: horário nenhum vai ser aceito enquanto a pergunta dele estiver de pé.",
  ].join("\n");
}
