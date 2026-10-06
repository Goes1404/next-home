import type { FamiliaDeRecusa } from "./recusaDoCliente";

/**
 * As frases de referência da recusa (06/10/2026).
 *
 * É a régua que roda no CI a cada mudança no detector. Três perguntas:
 *
 * 1. A regex nunca acusa uma frase esperada como `null` (falso positivo
 *    encerra atendimento: o erro mais caro).
 * 2. Toda recusa esperada passa pelo filtro de sinal negativo, ou seja, chega
 *    à IA quando a regex não a pega. Uma recusa barrada no filtro está
 *    perdida para as duas camadas.
 * 3. Quantas a regex pega sozinha (catraca: só pode subir).
 *
 * Como crescer: toda segunda, a revisão (`scripts/revisarRecusas.sql`) lista
 * o que a IA reconheceu e o que o corretor desfez. Frase real entra aqui com
 * o desfecho certo; se a IA a acerta sempre, ela pode subir para a regex.
 *
 * `contexto` é a última fala nossa, quando ela muda o sentido do "não".
 */
export type FraseDeRecusa = {
  fala: string;
  esperado: FamiliaDeRecusa | null;
  contexto?: string;
  /** De onde veio: sonda escrita à mão ou conversa real (anonimizada). */
  origem: "sonda" | "producao";
};

export const FRASES_DE_RECUSA: readonly FraseDeRecusa[] = [
  // ── Pedido de parada ────────────────────────────────────────────────
  { fala: "me tira da lista", esperado: "parada", origem: "sonda" },
  { fala: "pode me tirar do grupo", esperado: "parada", origem: "sonda" },
  { fala: "para de mandar mensagem", esperado: "parada", origem: "sonda" },
  { fala: "não quero mais receber mensagem", esperado: "parada", origem: "sonda" },
  { fala: "número errado", esperado: "parada", origem: "sonda" },
  { fala: "não me ligue", esperado: "parada", origem: "sonda" },
  { fala: "Pare", esperado: "parada", origem: "sonda" },
  { fala: "STOP", esperado: "parada", origem: "sonda" },
  { fala: "sair", esperado: "parada", origem: "sonda" },
  { fala: "vou te bloquear", esperado: "parada", origem: "sonda" },
  { fala: "me esquece", esperado: "parada", origem: "sonda" },
  { fala: "Eu quero te apagar meu contato sua doida", esperado: "parada", origem: "producao" },
  { fala: "prefiro não receber essas coisas", esperado: "parada", origem: "sonda" },
  { fala: "chega de mensagem por favor", esperado: "parada", origem: "sonda" },
  { fala: "quem te deu meu número? não conheço vocês", esperado: "parada", origem: "sonda" },
  { fala: "vou denunciar esse número", esperado: "parada", origem: "sonda" },

  // ── Desinteresse ────────────────────────────────────────────────────
  { fala: "No momento não tenho interesse. Obrigada", esperado: "desinteresse", origem: "producao" },
  { fala: "não tenho mais interesse", esperado: "desinteresse", origem: "sonda" },
  { fala: "não quero mais", esperado: "desinteresse", origem: "sonda" },
  { fala: "não quero comprar", esperado: "desinteresse", origem: "sonda" },
  { fala: "não estou mais procurando", esperado: "desinteresse", origem: "sonda" },
  { fala: "não preciso de imóvel", esperado: "desinteresse", origem: "sonda" },
  { fala: "não pretendo comprar agora", esperado: "desinteresse", origem: "sonda" },
  { fala: "não tenho interesse obrigado", esperado: "desinteresse", origem: "sonda" },
  { fala: "não me interessa mais", esperado: "desinteresse", origem: "sonda" },
  {
    fala: "Oi, bom dia. No momento, agora pra mim não interessa, porque estou sem tempo e reformando o comércio",
    esperado: "desinteresse",
    origem: "producao",
  },
  { fala: "agora não dá, talvez ano que vem", esperado: "desinteresse", origem: "sonda" },
  { fala: "obrigado mas não", esperado: "desinteresse", contexto: "Quer que eu te mande as opções?", origem: "sonda" },
  { fala: "deixa pra lá", esperado: "desinteresse", contexto: "Posso te mostrar as plantas?", origem: "sonda" },
  { fala: "não, valeu", esperado: "desinteresse", contexto: "Ainda tem interesse no apartamento?", origem: "sonda" },

  // ── Já resolveu ─────────────────────────────────────────────────────
  { fala: "já comprei", esperado: "ja_resolvido", origem: "sonda" },
  { fala: "já tenho casa", esperado: "ja_resolvido", origem: "sonda" },
  { fala: "já tenho corretor", esperado: "ja_resolvido", origem: "sonda" },
  { fala: "já tenho uma corretora que me atende", esperado: "ja_resolvido", origem: "sonda" },
  { fala: "fechei com outra imobiliária", esperado: "ja_resolvido", origem: "sonda" },

  // ── Conversa normal: NUNCA é recusa ─────────────────────────────────
  { fala: "Hoje não daria, trabalho a noite", esperado: null, origem: "producao" },
  { fala: "Imprevisto\nHoje não\nBom dia", esperado: null, origem: "producao" },
  { fala: "Vejo depois", esperado: null, origem: "producao" },
  { fala: "Infelizmente alto para a minha renda", esperado: null, origem: "producao" },
  { fala: "Não tenho interesse em apartamento", esperado: null, origem: "producao" },
  { fala: "não quero na planta, só pronto", esperado: null, origem: "sonda" },
  { fala: "não quero comprar um de 3 quartos", esperado: null, origem: "sonda" },
  { fala: "não tenho interesse em Alphaville, prefiro Barueri", esperado: null, origem: "sonda" },
  { fala: "não posso sábado, pode ser domingo?", esperado: null, origem: "sonda" },
  { fala: "não me ligue agora, estou no trabalho, me chama no zap", esperado: null, origem: "sonda" },
  { fala: "vou pensar e te falo", esperado: null, origem: "sonda" },
  { fala: "vou ver com minha esposa", esperado: null, origem: "sonda" },
  { fala: "tá caro", esperado: null, origem: "sonda" },
  { fala: "vc não me mandou ainda", esperado: null, origem: "producao" },
  { fala: "não", esperado: null, contexto: "É pronto para morar ou na planta?", origem: "sonda" },
  { fala: "não sei ainda", esperado: null, contexto: "Quantos dormitórios você precisa?", origem: "sonda" },
  { fala: "pode sair às 10h?", esperado: null, origem: "sonda" },
  { fala: "não interessa o bairro, pode ser qualquer um", esperado: null, origem: "sonda" },
  { fala: "já tenho a carta de crédito", esperado: null, origem: "sonda" },
  { fala: "Não precisa ser condomínio", esperado: null, origem: "producao" },
];

/**
 * Catraca: quantas recusas a REGEX pega sozinha. Só pode subir — se alguém
 * melhorar a regex, o teste avisa para atualizar o número; se piorar, reprova.
 * As que ela não pega ficam para a IA (e o filtro garante que chegam lá).
 */
export const ACERTOS_DA_REGEX = 28; // de 35 recusas em 06/10/2026; as outras 7 ficam para a IA
