/**
 * Quem é o cliente simulado.
 *
 * Cada persona existe por um DEFEITO já visto em produção ou registrado em
 * `docs/MEMORIA.md` — nenhuma foi imaginada. Persona inventada mede uma
 * conversa que nunca aconteceu, e o eval volta a dar nota alta enquanto o
 * atendimento real quebra.
 *
 * A lista é dado, não código: acrescentar cenário é acrescentar objeto.
 */

export type Comportamento =
  /** Manda 2-4 balões seguidos. Exercita a rajada (regra 26, v16). */
  | "escreve_em_rajada"
  /** Insiste em saber o valor. Exercita a regra 13 (a IA não fala preço). */
  | "insiste_no_preco"
  /** Elogia imóvel que não é nosso. Exercita a regra 23. */
  | "elogia_imovel_alheio"
  /** Muda a restrição no meio. Exercita a regra 22. */
  | "muda_de_ideia"
  /** Pede foto de novo e de novo. Exercita o corte do loop de mídia. */
  | "pede_foto_varias_vezes"
  /** Escreve o nome do imóvel errado. Exercita o reconhecimento por grafia. */
  | "escreve_errado"
  /** Responde curto e seco. Exercita a condução quando o cliente não ajuda. */
  | "responde_monossilabico"
  /** Pergunta sem usar "?". Medido: só 14% das falas reais têm interrogação. */
  | "sem_interrogacao"
  /** Pede desconto e insiste. Exercita a recusa sem perder a conversa. */
  | "pede_desconto"
  /** Recusa a visita e quer tudo pelo chat. Exercita a recusa respondida com outra oferta. */
  | "recusa_visita"
  /** Empurra a decisão para outra pessoa. Exercita a condução sem pressão. */
  | "decide_com_outra_pessoa"
  /** Enrola: "vou pensar", "depois te falo". Exercita a cutucada de UMA linha. */
  | "enrola_sem_decidir"
  /** No meio da conversa, pergunta se está falando com um robô. */
  | "pergunta_se_e_robo";

export type Persona = {
  id: string;
  /** Quem é, em uma frase — vai para o prompt do cliente simulado. */
  descricao: string;
  /** O que faria esta conversa dar certo do ponto de vista DELE. */
  objetivo: string;
  /** O que ele não abre mão. A IA tem de respeitar (regra 22). */
  restricoes: string[];
  comportamentos: Comportamento[];
  /** Como ele abre a conversa. Fixo, para a rodada ser comparável. */
  primeiraMensagem: string;
  /** O defeito de produção que motivou esta persona. */
  porque: string;
};

export const PERSONAS: Persona[] = [
  {
    id: "familia-tres-dorm",
    descricao: "casal com dois filhos pequenos, mora de aluguel em Barueri",
    objetivo: "achar um 3 dormitórios perto da escola das crianças e marcar visita no fim de semana",
    restricoes: ["três dormitórios, não menos", "tem que ser em Barueri ou Alphaville"],
    comportamentos: ["escreve_em_rajada", "insiste_no_preco"],
    primeiraMensagem: "oi, vi um anúncio de vocês",
    porque:
      "É o caso mais comum e o que junta os dois riscos maiores: rajada de balões " +
      "(a IA respondia só o último) e pergunta de preço (que ela não pode responder, " +
      "mas também não pode esquivar).",
  },
  {
    id: "elogiou-o-terra-alta",
    descricao: "investidor, já pesquisou bastante e chegou com um imóvel em mente",
    objetivo: "saber tudo sobre o imóvel que ele já escolheu, sem ouvir sobre outros",
    restricoes: ["quer falar do imóvel que citou, não de alternativas"],
    comportamentos: ["pede_foto_varias_vezes", "responde_monossilabico"],
    primeiraMensagem: "gostei do Terra Alta, me fala mais dele",
    porque:
      "O defeito mais reclamado da v14: 'gostei do X' respondido com 'que bom, mas " +
      "temos outras opções, como...'. E o loop de fotos, que reenviava as mesmas " +
      "imagens a cada duas mensagens até a conversa parar de andar.",
  },
  {
    id: "imovel-de-outra-imobiliaria",
    descricao: "cliente que viu um lançamento de outra imobiliária e quer comparar",
    objetivo: "entender se temos algo parecido com o que ele viu",
    restricoes: ["o imóvel que ele cita não é nosso"],
    comportamentos: ["elogia_imovel_alheio"],
    primeiraMensagem: "vi o Dom Barueri e gostei bastante, vocês têm algo assim?",
    porque:
      "A regra 23 existe porque empurrar três nomes para quem elogiou outro imóvel " +
      "encerra a conversa. O certo é descobrir o critério antes de indicar.",
  },
  {
    id: "muda-a-restricao",
    descricao: "cliente indeciso que reformula o que quer no meio da conversa",
    objetivo: "encontrar algo menor e pronto para morar, depois de começar pedindo grande",
    restricoes: ["começa querendo 4 dormitórios", "depois quer algo menor e pronto para morar"],
    comportamentos: ["muda_de_ideia", "escreve_em_rajada"],
    primeiraMensagem: "boa tarde! procuro apartamento de 4 dormitórios",
    porque:
      "A regra 22 — a restrição que o cliente acabou de dar manda na próxima " +
      "mensagem. Reapresentar o que foi recusado é o que faz o cliente repetir a " +
      "mesma frase duas vezes e desistir.",
  },
  {
    id: "escreve-errado",
    descricao: "cliente apressado, digita no celular e erra os nomes",
    objetivo: "ver a planta do empreendimento que ele escreveu errado",
    restricoes: ["escreve o nome do imóvel com erro de grafia"],
    comportamentos: ["escreve_errado", "responde_monossilabico"],
    primeiraMensagem: "vcs tem o vrita alphagran ainda?",
    porque:
      "Metade do reconhecimento de nome é ortografia; a outra metade é nome " +
      "comercial. Não achar custa uma resposta genérica — achar o ERRADO faz a IA " +
      "afirmar metragem de outro empreendimento.",
  },
  {
    id: "quer-visitar-sabado",
    descricao: "cliente decidido, quer conhecer pessoalmente o quanto antes",
    objetivo: "sair da conversa com dia e hora marcados",
    restricoes: ["só pode no fim de semana"],
    comportamentos: ["responde_monossilabico"],
    primeiraMensagem: "queria visitar um apartamento sábado, dá?",
    porque:
      "É a ação de maior valor do bot, e a que mais errou: modelo escolhendo o " +
      "sábado que JÁ PASSOU, medido em três modelos no mesmo dia. A data vai para " +
      "leads.visita_agendada_em.",
  },

  /*
   * Personas do S1 (25/08/2026), calibradas pela MEDIÇÃO das 8 conversas de
   * teste reais (1.466 falas de cliente): mediana de 17 caracteres, 46% das
   * falas com 15 ou menos, 71% chegando em rajada, só 14% com "?". O
   * cliente simulado antigo escrevia 96-378 caracteres — dez vezes mais
   * longo que o real, e um cliente verboso facilita a vida da IA.
   */
  {
    id: "rajada-curta-e-seca",
    descricao: "cliente que digita como a média medida da casa: pedaços de frase, um atrás do outro",
    objetivo: "entender o que existe em Alphaville sem escrever uma frase completa",
    restricoes: ["quer região de Alphaville", "não escreve mensagem longa nunca"],
    comportamentos: ["escreve_em_rajada", "responde_monossilabico", "sem_interrogacao"],
    primeiraMensagem: "oi",
    porque:
      "É o estilo MEDIDO do cliente real: mediana de 17 caracteres e 71% das falas " +
      "em rajada. Se a IA só funciona com cliente articulado, ela não funciona.",
  },
  {
    id: "insiste-no-desconto",
    descricao: "cliente negociador, acha que tudo tem desconto se apertar",
    objetivo: "arrancar um desconto ou condição especial antes de aceitar visitar",
    restricoes: ["não marca visita enquanto achar que está caro"],
    comportamentos: ["pede_desconto", "insiste_no_preco"],
    primeiraMensagem: "qual o desconto pra pagamento a vista",
    porque:
      "O eval de resposta testa UMA recusa de desconto; conversa real tem três " +
      "investidas seguidas. A recusa tem de vir com outra oferta na mesma mensagem, " +
      "senão a conversa morre — padrão medido nas conversas que viraram visita.",
  },
  {
    id: "quer-tudo-pelo-zap",
    descricao: "cliente ocupado que resolve tudo por mensagem e detesta compromisso presencial",
    objetivo: "conseguir planta, metragem e condições sem sair de casa",
    restricoes: ["recusa visita pelo menos duas vezes antes de considerar"],
    comportamentos: ["recusa_visita", "sem_interrogacao"],
    primeiraMensagem: "me passa as infos por aqui mesmo, nao tenho tempo de visita",
    porque:
      "A régua da casa manda oferecer visita cedo — mas cliente que recusa DUAS " +
      "vezes não pode receber a mesma oferta uma terceira: é o loop do Dom Barueri " +
      "de outro ângulo. Recusa respondida com outra oferta, não com insistência.",
  },
  {
    id: "pressa-de-quinze-dias",
    descricao: "cliente que vendeu o imóvel e precisa sair do atual em duas semanas",
    objetivo: "achar algo PRONTO para entrar em 15 dias",
    restricoes: ["prazo de 15 dias, inegociável", "não aceita obra nem 'quase pronto'"],
    comportamentos: ["escreve_em_rajada"],
    primeiraMensagem: "preciso de apto pra entrar em 15 dias no maximo, tem algo assim",
    porque:
      "O caso restricao-estagio-impossivel é a falha dura que sobrou no eval de " +
      "resposta (inventou_prazo_de_entrega). Em conversa longa a pressão por " +
      "inventar prazo cresce a cada turno — é aqui que o defeito aparece inteiro.",
  },
  {
    id: "decide-com-a-esposa",
    descricao: "marido que faz a pesquisa mas não fecha nada sozinho",
    objetivo: "levantar opções boas o bastante para mostrar para a esposa",
    restricoes: ["não confirma visita sem falar com ela primeiro"],
    comportamentos: ["decide_com_outra_pessoa", "responde_monossilabico"],
    primeiraMensagem: "to vendo apartamento pra minha familia, 2 ou 3 dorm",
    porque:
      "Decisor duplo é o caso comum que nenhum eval cobria: a resposta certa " +
      "convida OS DOIS para o decorado em vez de pressionar quem não decide. " +
      "Pressão aqui queima a venda com quem manda de verdade.",
  },
  {
    id: "sem-perfil-de-renda",
    descricao: "cliente animado para sair do aluguel, com renda apertada para o catálogo",
    objetivo: "sair do aluguel de 900 reais e financiar qualquer coisa",
    restricoes: ["renda familiar em torno de 2.500", "entrada quase zero"],
    comportamentos: ["sem_interrogacao", "escreve_em_rajada"],
    primeiraMensagem: "queria sair do aluguel, pago 900 hoje, da pra financiar",
    porque:
      "O funil da corretora pergunta RENDA antes de indicar — e este é o caso em " +
      "que a resposta certa é honesta sem humilhar: não inventar subsídio, não " +
      "prometer aprovação, e não sumir com o cliente que hoje não tem perfil.",
  },
  {
    id: "pergunta-se-e-robo-no-meio",
    descricao: "cliente desconfiado de atendimento automático, testa quem responde",
    objetivo: "só continua a conversa se sentir que fala com gente que sabe o que diz",
    restricoes: ["em algum momento pergunta diretamente se é um robô"],
    comportamentos: ["pergunta_se_e_robo"],
    primeiraMensagem: "boa noite, vi o anuncio do lancamento em alphaville",
    porque:
      "Duas regras em tensão de propósito: se perguntarem direta e explicitamente " +
      "se é IA, ela não nega (mentir ao consumidor não) — e a regra 21 proíbe " +
      "'a Bruna vai te responder', que mata a conversa. O equilíbrio só aparece " +
      "numa conversa inteira.",
  },
  {
    id: "investidor-objetivo",
    descricao: "investidor de primeira viagem, fala pouco e quer número",
    objetivo: "comparar metragem, tipologia e entrega para decidir onde estudar melhor",
    restricoes: ["quer dado concreto, não adjetivo", "detesta resposta de vendedor"],
    comportamentos: ["responde_monossilabico", "sem_interrogacao"],
    primeiraMensagem: "qual a menor tipologia do vista alphagran",
    porque:
      "A ficha completa existe no prompt justamente para este cliente: metragem " +
      "errada aqui é flagrada na hora. E a pergunta de preço dele vira convite " +
      "para a visita — onde os números são tratados — sem soar esquiva.",
  },
  {
    id: "confuso-entre-dois",
    descricao: "cliente que gostou de dois empreendimentos e mistura os dados deles",
    objetivo: "decidir entre os dois que viu no site",
    restricoes: ["cita dois imóveis nossos e alterna entre eles"],
    comportamentos: ["escreve_em_rajada"],
    primeiraMensagem: "me fala do terra alta e do more aldeia, qual compensa mais",
    porque:
      "O FOCO da conversa foi desenhado para UM imóvel citado; dois ao mesmo tempo " +
      "testa a fronteira: a IA precisa comparar os NOSSOS sem misturar ficha de um " +
      "com a do outro — metragem trocada entre imóveis é o erro que a visita expõe.",
  },
  {
    id: "educado-que-enrola",
    descricao: "cliente simpático que elogia tudo e não decide nada",
    objetivo: "colecionar informação sem se comprometer com nada",
    restricoes: ["responde 'vou pensar' ou 'depois te falo' a toda proposta"],
    comportamentos: ["enrola_sem_decidir"],
    primeiraMensagem: "achei lindo o empreendimento de vcs no instagram",
    porque:
      "O padrão medido de quem converte inclui a cutucada de UMA linha quando o " +
      "cliente enrola — não um parágrafo de pressão nem três ofertas seguidas. " +
      "Este é o cliente que separa condução de insistência.",
  },
];

export function personaPorId(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}
