import { semelhanca } from "./metricasConversa";

/**
 * A IA não pode mandar de novo, palavra por palavra, o que já mandou.
 *
 * Medido em produção: das 80 mensagens que o bot chegou a enviar, 23 fazem
 * parte de grupos de repetição EXATA. Os dois casos que doem:
 *
 *   - contra três arquivos .zip diferentes, três vezes a mesma frase
 *     ("Aqui está a planta do Manacá Barueri de novo! 😊 …");
 *   - contra quatro perguntas diferentes do cliente ("Tem outra opção?",
 *     "Onde fica?", "Quais opções de plantas?", "Tem 3 dormitórios?"),
 *     três vezes "O Terra Alta tem 1 dormitório, 52m² e 2 vagas. …".
 *
 * A própria corretora anotou isso no chat, sem que ninguém pedisse:
 * "está em um looping mandando as fotos, a conversa não está desenrolando
 * para o pré entendimento do cliente".
 *
 * NÃO é o mesmo bug que `midiasJaEnviadas` resolve. Aquele impede reenviar
 * o mesmo ARQUIVO; este impede repetir o mesmo TEXTO — que acontece mesmo
 * quando nenhum anexo sai.
 *
 * Mora em código, não no prompt, pelo motivo de sempre nesta base: "não
 * repita" é instrução probabilística e falha justo na terceira vez, que é
 * quando o cliente desiste.
 */

/** Última mensagem do bot a considerar. Além disso, repetir já é aceitável. */
const JANELA_MENSAGENS_BOT = 5;

/** Abaixo disso, repetir é natural ("Claro!", "Perfeito"). Não é loop. */
const MINIMO_CARACTERES = 40;

/**
 * Tira o que varia sem mudar o conteúdo: separador de balões, nota de
 * anexo (`📎 título: url`), emoji, pontuação, acento e caixa.
 *
 * A nota de anexo sai porque a MESMA frase com e sem foto continua sendo a
 * mesma frase — e é justamente assim que o loop aparece.
 */
export function normalizarParaRepeticao(texto: string): string {
  return (texto ?? "")
    .replace(/📎[^\n]*/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/---/g, " ")
    .normalize("NFD")
    // Marcas de acento soltas pelo NFD. Precisa vir ANTES da limpeza de
    // pontuação: um acento sobrevivente viraria espaço no meio da palavra
    // ("opção" → "opc ao"), e duas grafias da mesma frase deixariam de casar.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** As falas do bot no histórico, da mais recente para a mais antiga. */
function falasRecentesDoBot(
  historico: { remetente: string; texto: string }[] | undefined,
): string[] {
  return (historico ?? [])
    .filter((m) => m.remetente === "bot")
    .slice(-JANELA_MENSAGENS_BOT)
    .map((m) => normalizarParaRepeticao(m.texto));
}

/**
 * Esta resposta repete algo que o bot já disse na conversa?
 *
 * Conta como repetição a igualdade normalizada e também a contenção — uma
 * é o outro mais um pedaço. Em produção o loop apareceu das duas formas: a
 * mesma frase sozinha e a mesma frase com uma nota de anexo grudada.
 */
export function ehRepeticaoDoBot(
  texto: string,
  historico?: { remetente: string; texto: string }[],
): boolean {
  const novo = normalizarParaRepeticao(texto);
  if (novo.length < MINIMO_CARACTERES) return false;

  return falasRecentesDoBot(historico).some((anterior) => {
    if (anterior.length < MINIMO_CARACTERES) return false;
    if (novo === anterior) return true;

    /*
     * Contenção só conta quando os dois têm quase o mesmo tamanho. Sem
     * essa trava, uma resposta que REPETE a frase anterior e acrescenta
     * informação nova seria descartada junto com a novidade — trocaríamos
     * o loop por perda de conteúdo, que é pior porque não aparece.
     */
    if (novo.includes(anterior) || anterior.includes(novo)) {
      const proporcao =
        Math.min(novo.length, anterior.length) / Math.max(novo.length, anterior.length);
      if (proporcao >= 0.7) return true;
    }

    /*
     * Quase idêntica também é loop (Onda 2, 25/08). A fábrica mediu 9-11
     * respostas "quase idênticas" POR RODADA passando pela guarda literal:
     * o modelo troca duas palavras e repete a ideia inteira, cinco turnos
     * seguidos. O limiar 0,45 foi MEDIDO nos pares reais da transcrição:
     * o eco de casaco trocado dá 0,55; a paráfrase genuína, 0,28-0,38; e
     * conteúdo novo sobre o MESMO imóvel, no máximo 0,10. Paráfrase fica
     * abaixo de propósito — é a decisão documentada do medidor: acusar
     * variação legítima mandaria consertar comportamento correto, e a
     * paráfrase-loop é papel da regra 27 do prompt, com o resultado
     * cobrado pelas métricas de conversa.
     */
    return semelhanca(novo, anterior) >= 0.45;
  });
}

/**
 * O que vai no lugar da repetição.
 *
 * Deliberadamente SEM conteúdo sobre imóvel: repetir acontece justamente
 * quando o modelo não tem o que acrescentar, e inventar aqui seria trocar
 * um defeito visível (loop) por um invisível (fato falso). O que a frase
 * faz é devolver o turno ao cliente, que é o que o loop impedia.
 *
 * Varia com o número de repetições para não virar, ela mesma, um segundo
 * loop.
 */
const SAIDAS: string[] = [
  "Me conta um pouco mais do que você procura para eu te ajudar melhor.",
  "Para eu te indicar certo: quantos dormitórios você precisa?",
  "Prefere conhecer pessoalmente? Consigo te mostrar essa semana.",
];

/**
 * O último recurso do último recurso.
 *
 * Quando as saídas acabaram, insistir numa quarta pergunta de qualificação
 * é o próprio loop com outra roupa. O que sobra é a única jogada que ainda
 * não foi feita: reconhecer o impasse e devolver a ESCOLHA para o cliente.
 */
const SAIDA_FINAL =
  "Me diz o que te ajudaria mais agora: ver as fotos, o link com tudo do empreendimento, ou marcar de conversar pessoalmente?";

/**
 * O que vai no lugar da repetição — nunca uma frase que já foi dita.
 *
 * ## O defeito que isto conserta
 *
 * A versão anterior escolhia por `totalDeMensagensDoBot % 3`. Com três
 * saídas, o resto do módulo faz o índice VOLTAR, e a guarda anti-loop
 * virou o loop: no eval da v26, a persona `insiste-no-desconto` recebeu
 * "Me conta um pouco mais do que você procura" nos turnos 7 e 10, palavra
 * por palavra, além de outras duas saídas alternadas. Quatro dos doze
 * turnos daquela conversa eram texto desta lista.
 *
 * O comentário da lista já prometia "varia para não virar, ela mesma, um
 * segundo loop" — e o módulo derrotava a promessa. A promessa agora é
 * cumprida por construção: a saída escolhida é a primeira AINDA NÃO DITA
 * nesta conversa.
 */
export function textoNoLugarDaRepeticao(
  historico?: { remetente: string; texto: string }[],
): string {
  const ditas = (historico ?? [])
    .filter((m) => m.remetente === "bot")
    .map((m) => normalizarParaRepeticao(m.texto));

  const jaDita = (candidata: string): boolean => {
    const n = normalizarParaRepeticao(candidata);
    return ditas.some((d) => d === n || d.includes(n) || semelhanca(d, n) >= 0.6);
  };

  const inedita = SAIDAS.find((s) => !jaDita(s));
  if (inedita) return inedita;

  // Todas usadas: a conversa está travada de verdade. Uma quarta pergunta
  // de qualificação seria o loop de novo — devolver a escolha é o que ainda
  // não foi tentado. Se nem ela sobrou, a primeira saída volta: é melhor
  // que texto vazio, que o chamador mandaria como mensagem em branco.
  return jaDita(SAIDA_FINAL) ? SAIDAS[0] : SAIDA_FINAL;
}

/**
 * Aproveita o que a resposta tem de NOVO, cortando só as frases ecoadas.
 *
 * A primeira versão da guarda trocava a resposta INTEIRA por uma frase de
 * pivô enlatada — e o juiz mediu o estrago na v19: `mesmaPessoa` caiu de
 * 2,00 para 1,88 (o enlatado soa como outra pessoa) e "assumiria" caiu de
 * 12/16 para 7/16, porque junto com o eco ia embora a parte da resposta
 * que respondia. Cortar a frase repetida e manter a inédita preserva a voz
 * e a informação; o enlatado vira último recurso, quando NADA sobra.
 *
 * Limiar 0,6 por frase, medido: o CTA repetido da transcrição real dá
 * 0,63; frase com conteúdo novo sobre o mesmo imóvel fica em 0,10-0,19.
 */
export function aproveitarSoONovo(
  texto: string,
  historico?: { remetente: string; texto: string }[],
): string {
  const anteriores = (historico ?? [])
    .filter((m) => m.remetente === "bot")
    .slice(-JANELA_MENSAGENS_BOT)
    .flatMap((m) => frasesDe(m.texto))
    .map((f) => normalizarParaRepeticao(f))
    .filter((f) => f.length >= 25);
  if (anteriores.length === 0) return texto;

  const ineditas = frasesDe(texto).filter((frase) => {
    const n = normalizarParaRepeticao(frase);
    if (n.length < 25) return true;
    return !anteriores.some((ant) => semelhanca(n, ant) >= 0.6);
  });

  return ineditas.join(" ").replace(/\s{2,}/g, " ").trim();
}

/** Quebra em frases preservando a pontuação de cada uma. */
function frasesDe(texto: string): string[] {
  return (texto ?? "")
    .split(/(?<=[.!?])\s+|\n/)
    .map((f) => f.trim())
    .filter(Boolean);
}
