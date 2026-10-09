import { normalizar } from "./normalizarFala";

/**
 * O cliente disse que NÃO quer — e as três formas disso não se tratam igual.
 *
 * Até 11/09/2026 o planner não enxergava nenhuma delas. `jogada.ts` conhecia
 * objeção de preço ("tá caro") e saída suave ("vou pensar"); recusa não
 * existia, então "não tenho interesse" era fala não classificada — e fala
 * não classificada cai na pergunta de funil. Medido em produção:
 *
 *   01/09 13:25  cliente: "No momento não tenho interesse. Obrigada"
 *                     IA: "Me conta, em qual região de Barueri você procura?"
 *   23/08 10:00  cliente: "E eu não quero ir"
 *                     IA: "Quer conhecer o decorado?"
 *
 * ## O erro é assimétrico, e é isso que desenha o detector
 *
 * Não achar uma recusa custa uma mensagem inconveniente. Achar uma recusa
 * que não houve ENCERRA um atendimento em andamento, silencia a IA, marca o
 * lead como perdido e tira o número das campanhas — e quem reabre é o
 * corretor, que pode não perceber por dias.
 *
 * Por isso a régua exige que a negação seja do ATENDIMENTO, não de um
 * detalhe: "não quero na planta", "não tenho interesse em Alphaville" e "não
 * posso sábado" continuam sendo conversa, e conversa boa.
 */
export type FamiliaDeRecusa = "desinteresse" | "ja_resolvido" | "parada";

export type Recusa = {
  familia: FamiliaDeRecusa;
  /** O trecho que decidiu — o prompt cita o que ELE disse, não uma paráfrase. */
  trecho: string;
};

/**
 * Pedido de parada.
 *
 * É a família mais forte e a única que pula a tentativa de entender o
 * motivo: insistir com quem pediu para sair é o caminho curto para a
 * denúncia, que é o sinal mais forte que existe contra o número — a mesma
 * razão pela qual a janela de horário comercial existe.
 */
const PARADA =
  /\b(me tirar? (da lista|do grupo)|tirar (da lista|do grupo)|tira meu numero|nao quero mais receber|para de (mandar|enviar|me mandar)|pare de (mandar|enviar|me mandar)|(pode|podem) parar|para com isso|nao me mand(e|em)|nao me manda mais|descadastr\w*|sair (da lista|do grupo)|numero errado|pessoa errada|nao era eu|nao sou eu|nao conheco (voces|essa empresa)|(apagar|apaga|apague|excluir|exclui|exclua|remover|remove|remova|deletar|deleta|delete|bloquear|bloqueia|bloqueie) (o |esse |este )?(meu|o meu|meus) (contato|numero|telefone|cadastro|dados)|(vou|ja vou|vou te) bloquear|me bloqueia|me esquece|esquece meu (numero|contato)|nao me procur\w*|nao (me )?(liga|ligue|chama|chame) mais|nao me (ligue|liga)[\s.!]*$|para de me (ligar|chamar|encher|incomodar)|pare de me (ligar|chamar|encher|incomodar))\b/;
// "Eu quero te apagar meu contato sua doida" (anúncio do Dom Parque,
// 29/09/2026) passou batido: a IA seguiu oferecendo o imóvel a quem pediu
// para sumir. Pedido de parada não é só "me tira da lista": é apagar o
// contato, bloquear, "me esquece".

/** Fim de jornada: ele resolveu, e não há o que reofertar. */
const JA_RESOLVIDO =
  /\b(ja (comprei|aluguei|fechei|resolvi|escolhi|consegui)|comprei outro|fechei com outr\w*|ja estou morando|ja tenho (imovel|apartamento|casa)|ja (tenho|tem|estou com|to com) (um |uma |o meu |a minha |meu |minha )?(corretor|corretora|imobiliaria)|ja (tenho|tem) (quem|alguem que) me atend\w*)\b/;

/**
 * Desinteresse no ATENDIMENTO.
 *
 * `nao quero` sozinho é ancorado no FIM da fala de propósito: solto, ele
 * casaria em "não quero incomodar" e em qualquer preferência ("não quero
 * apartamento na planta"), e encerraria a conversa de quem está justamente
 * escolhendo. No fim da frase, sem complemento, ele é o que parece ser.
 */
const DESINTERESSE_COM_COMPLEMENTO =
  /\b(nao tenho (mais )?interesse|sem interesse|nao me interessa|(pra|para) mim nao interessa|nao e pra mim|nao vou querer|desisti|nao pretendo (mais )?(comprar|mudar|alugar)|nao (estou|to|tou) (mais )?(procurando|buscando|interessad\w*)|nao quero (mais )?(comprar|saber)|nao preciso (mais )?de (imovel|apartamento))\b/;

const DESINTERESSE_NO_FIM =
  /\b(nao quero( mais)?|nao quero nada)\b[\s,.!]*(obrigad\w*|nada|isso|mais nada)?\s*$/;

/**
 * O que transforma "não" em preferência, e não em recusa.
 *
 * Uma negação seguida de COMPLEMENTO é escolha: "não tenho interesse em
 * Alphaville" está dizendo onde quer, não que quer sair. O complemento vem
 * logo depois, então basta olhar o resto da frase a partir do casamento.
 */
const COMPLEMENTO_QUE_DESARMA =
  /\b(na planta|pronto|em obra|construcao|alphaville|barueri|osasco|aldeia|tambore|centro|bairro|regiao|dormitorio|quarto|suite|vaga|metro|m2|mil|reais|sabado|domingo|segunda|terca|quarta|quinta|sexta|manha|tarde|noite|hoje|amanha|apartamento|ape|casa|cobertura|studio|terreno|sobrado|esse imovel|este imovel|essa opcao|esta opcao|nesse|neste|nessa|nesta)s?\b/;

/*
 * "agora" e "no momento" NÃO desarmam (06/10/2026). "Não pretendo comprar
 * agora" é recusa, só que temporária, e é a IA quem pergunta o motivo: o
 * desinteresse ganha a pergunta antes de encerrar. Com "agora" na lista, a
 * frase passava como conversa normal e recebia pergunta de funil.
 */

/**
 * A palavra de parada dita SOZINHA, como a mensagem inteira. Em frase, "pare"
 * e "sair" são verbos de qualquer coisa ("pode sair de casa às 9h"); sozinhas,
 * são o comando que se manda para lista de transmissão.
 */
const PARADA_SOZINHA = /^(pare|stop|sair|chega|cancelar|cancela|descadastrar)[\s.!]*$/;

/** Quantos caracteres depois do casamento contam como "o complemento". */
const JANELA_DO_COMPLEMENTO = 40;

/**
 * O "não" seco — que só é recusa DEPOIS de uma recusa.
 *
 * Achado pelo trace na primeira execução (11/09/2026), e é o turno que
 * importa: ela acolhe o "não tenho interesse", pergunta o motivo, ele
 * responde "não, obrigada" — e ela CONVIDA PARA VISITA. Nenhum padrão de
 * recusa casa em "não, obrigada", porque sozinha essa fala não é recusa
 * nenhuma: respondendo a "pronto ou na planta?", ela é só uma resposta.
 *
 * O que a torna recusa é o CONTEXTO, então o contexto é parâmetro. Sem esse
 * gate, "não" viraria fim de atendimento em qualquer pergunta fechada do
 * funil — e o funil é feito de perguntas fechadas.
 */
const NEGATIVA_SECA =
  /^(nao|nada|nada disso|nada nao|nenhum|nenhuma|so isso|ja falei que nao|nao mesmo|nao quero|obrigad\w*)([\s,.!]+(obrigad\w*|mesmo|nao|valeu|tchau|por enquanto|por hora))*[\s,.!]*$/;

export function detectarRecusa(
  texto: string,
  contexto?: {
    /** Ele já recusou antes nesta conversa — muda o que "não" significa. */
    jaRecusouAntes?: boolean;
    /**
     * A última fala nossa perguntou se ele quer continuar recebendo
     * (`ofereceuParar`). Aí o "não" seco é a resposta, e a resposta é parar.
     */
    ofereceuParar?: boolean;
  },
): Recusa | null {
  const t = normalizar(texto).trim();
  if (!t || t.startsWith("[mensagem")) return null;

  // Só o "não" explícito: "obrigado" sozinho, depois da oferta, pode ser só
  // educação, e a IA de recusa decide com a oferta como contexto.
  if (contexto?.ofereceuParar && NEGATIVA_SECA.test(t) && /^(nao|nada|nenhum)/.test(t)) {
    return { familia: "parada", trecho: t };
  }

  if (contexto?.jaRecusouAntes && NEGATIVA_SECA.test(t)) {
    return { familia: "desinteresse", trecho: t };
  }

  if (PARADA_SOZINHA.test(t)) return { familia: "parada", trecho: t };

  const paradaAchada = t.match(PARADA);
  // O pedido de parada NÃO se desarma por complemento: quem pede para parar
  // não está escolhendo bairro.
  if (paradaAchada) return { familia: "parada", trecho: paradaAchada[0] };

  for (const [familia, regex] of [
    ["ja_resolvido", JA_RESOLVIDO],
    ["desinteresse", DESINTERESSE_COM_COMPLEMENTO],
  ] as const) {
    const m = t.match(regex);
    if (!m) continue;
    const inicio = (m.index ?? 0) + m[0].length;
    const depois = t.slice(inicio, inicio + JANELA_DO_COMPLEMENTO);
    if (COMPLEMENTO_QUE_DESARMA.test(depois)) return null;
    return { familia, trecho: m[0] };
  }

  const noFim = t.match(DESINTERESSE_NO_FIM);
  if (noFim) return { familia: "desinteresse", trecho: noFim[0].trim() };

  return null;
}
