/**
 * O cliente está MARCANDO — e o que ele já entregou de dia e hora.
 *
 * ## O defeito, na conversa 2cff42f6 de 10/09/2026
 *
 * O planner tinha `pediuHorario` ("que horas?"), `aceitouHorario` e
 * `confirmar_visita`. Não tinha nada para o meio do caminho, que é onde a
 * conversa de verdade acontece. Passando a transcrição real pelo planner:
 *
 * | o cliente disse | a jogada escolhida |
 * |---|---|
 * | "Quero marcar uma visita no amanhã" | `perguntar:estagio` |
 * | "Sábado eu não consigo, pode ser segunda?" | `perguntar:estagio` |
 * | "9h" | `devolver_escolha` |
 * | "Segunda feira" | `devolver_escolha` |
 *
 * `devolver_escolha` é "me conta o que te ajudaria mais agora" — a IA
 * perguntando de novo o que ele acabou de responder. Foi essa a queixa:
 * *"quando eu falo que consigo segunda, ela me pergunta novamente se eu não
 * consigo outro dia"*. Ele levou cinco turnos para marcar o que tinha dito
 * na primeira frase.
 *
 * ## A regra que este módulo carrega
 *
 * **Quem está marcando já passou do funil.** A ordem da casa manda o
 * horário concreto vir depois da qualificação — e isso vale quando é a IA
 * que puxa. Quando é o CLIENTE que puxa, interromper para perguntar "pronto
 * ou na planta?" é perder a visita que ele estava entregando.
 *
 * Função pura, sem LLM: reconhecer "segunda" e "9h" é trabalho de código, e
 * código não erra por temperatura.
 */

/** O que ele já deu do compromisso. Qualquer um dos dois já é agendamento. */
export interface PedidoDeAgendamento {
  /** O dia como ele falou: "segunda-feira", "amanhã", "sábado". */
  dia: string | null;
  /** A hora em número (9, 15). Só a hora cheia — é a régua da agenda. */
  hora: number | null;
  /** Ele pediu visita sem dizer quando ("quero marcar uma visita"). */
  pediuVisita: boolean;
}

const DIAS_DA_SEMANA: Record<string, string> = {
  domingo: "domingo",
  segunda: "segunda-feira",
  "segunda-feira": "segunda-feira",
  terca: "terça-feira",
  "terca-feira": "terça-feira",
  quarta: "quarta-feira",
  "quarta-feira": "quarta-feira",
  quinta: "quinta-feira",
  "quinta-feira": "quinta-feira",
  sexta: "sexta-feira",
  "sexta-feira": "sexta-feira",
  sabado: "sábado",
};

/** Dias relativos: o cliente fala assim tanto quanto fala o nome do dia. */
const RELATIVOS: Record<string, string> = {
  hoje: "hoje",
  amanha: "amanhã",
  "depois de amanha": "depois de amanhã",
};

/**
 * Pedir visita, nas palavras de quem pede.
 *
 * "quero conhecer" entra porque é o aceite do convite que a própria IA faz
 * ("quer conhecer o decorado?") — e aceite de convite é pedido de visita.
 */
const PEDIU_VISITA =
  /\b(marcar (uma )?visita|agendar (uma )?visita|quero visitar|posso visitar|quero conhecer|quero ver (o|a|ao vivo|pessoalmente)|ver pessoalmente|ver ao vivo|dar uma olhada no (imovel|apartamento|decorado)|conhecer o decorado)\b/;

/**
 * A hora dita solta.
 *
 * `\b(\d{1,2})\s*h\b` pega "9h" e "10 h"; `as 9` pega "às 9". O teto de 23
 * existe porque "2 reais" e "100 mil" não são hora — sem ele, todo número
 * da conversa viraria um compromisso.
 */
const HORA_COM_H = /\b(\d{1,2})\s*(?:h|hs|horas?)\b/;
const HORA_COM_AS = /\bas\s+(\d{1,2})\b/;

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Negação junto do dia: "sábado eu NÃO consigo" cita sábado e é o oposto de
 * escolher sábado. Sem esta guarda, a contraproposta ("sábado não consigo,
 * pode ser segunda?") marcaria sábado — que é o dia recusado.
 */
const NEGACAO = /\bn(a|ã)o\s+(consigo|posso|da|dá|rola|vai dar|consegui)\b/;

/** Frase a frase, para a negação só anular o dia que está junto dela. */
function frases(texto: string): string[] {
  return normalizar(texto)
    .split(/[.,!?;]+|\bmas\b|\bpode ser\b/)
    .map((f) => f.trim())
    .filter(Boolean);
}

export function pedidoDeAgendamento(mensagem: string): PedidoDeAgendamento {
  const texto = normalizar(mensagem ?? "");

  let dia: string | null = null;
  for (const frase of frases(mensagem ?? "")) {
    if (NEGACAO.test(frase)) continue;

    for (const [chave, rotulo] of Object.entries(RELATIVOS)) {
      if (frase.includes(chave)) dia = rotulo;
    }
    for (const [chave, rotulo] of Object.entries(DIAS_DA_SEMANA)) {
      if (new RegExp(`\\b${chave}\\b`).test(frase)) dia = rotulo;
    }
    if (dia) break;
  }

  const bruta = HORA_COM_H.exec(texto) ?? HORA_COM_AS.exec(texto);
  const numero = bruta ? Number(bruta[1]) : null;
  const hora = numero !== null && numero >= 0 && numero <= 23 ? numero : null;

  return { dia, hora, pediuVisita: PEDIU_VISITA.test(texto) };
}

/** Ele está marcando? Qualquer sinal basta. */
export function estaMarcando(p: PedidoDeAgendamento): boolean {
  return p.pediuVisita || p.dia !== null || p.hora !== null;
}
