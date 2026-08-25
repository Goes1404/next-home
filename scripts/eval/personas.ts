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
  | "responde_monossilabico";

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
];

export function personaPorId(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}
