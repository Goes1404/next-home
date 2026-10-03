/**
 * O que a IA precisa saber quando o cliente responde a uma lista de
 * transmissão (Fase 2 do plano das listas, 03/10/2026).
 *
 * O defeito: a mensagem da lista sai pelo disparador, e a IA que atende a
 * resposta só via o texto dela no meio do histórico, sem saber que foi uma
 * abordagem nossa, sobre qual imóvel, nem há quanto tempo. O cliente
 * responde "tem 2 quartos?" e ela não sabe de que imóvel ele fala.
 *
 * A instrução diz isso em voz alta e manda continuar a partir da mensagem,
 * sem se apresentar de novo nem repeti-la.
 *
 * ## Qual lista vale
 *
 * A ÚLTIMA enviada ao lead, e só até `DIAS_DO_CONTEXTO` depois do envio.
 * Passado isso, a fala dele já não é resposta àquela mensagem, e dizer à IA
 * que é faria ela puxar um imóvel que ele esqueceu.
 *
 * Módulo puro: quem lê o banco é o repositório.
 */

export const DIAS_DO_CONTEXTO = 7;
/** A resposta conta para o placar da lista até aqui. */
export const DIAS_PARA_CONTAR_RESPOSTA = 30;

const TETO_DA_MENSAGEM = 500;

export type ListaRecenteDoLead = {
  itemId: string;
  campanhaId: string;
  status: "enviado" | "respondido";
  enviadoEm: string;
  titulo: string | null;
  imovel: string | null;
  mensagemEnviada: string | null;
};

function diasDesde(iso: string, agora: Date): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (agora.getTime() - t) / 86_400_000;
}

/** A fala do cliente conta como resposta a esta lista? */
export function contaComoRespostaDaLista(lista: ListaRecenteDoLead, agora = new Date()): boolean {
  return lista.status === "enviado" && diasDesde(lista.enviadoEm, agora) <= DIAS_PARA_CONTAR_RESPOSTA;
}

export function instrucaoDaCampanha(lista: ListaRecenteDoLead | null, agora = new Date()): string | null {
  if (!lista) return null;
  const dias = diasDesde(lista.enviadoEm, agora);
  if (dias < 0 || dias > DIAS_DO_CONTEXTO) return null;

  const dia = new Date(lista.enviadoEm).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
  const mensagem = (lista.mensagemEnviada ?? "").replace(/\s+/g, " ").trim();
  const trecho =
    mensagem.length > TETO_DA_MENSAGEM ? `${mensagem.slice(0, TETO_DA_MENSAGEM - 1).trimEnd()}…` : mensagem;

  const partes = [
    `CONTEXTO DA LISTA DE TRANSMISSÃO: em ${dia} nós mandamos a este cliente uma mensagem${
      lista.titulo?.trim() ? ` da lista "${lista.titulo.trim()}"` : ""
    }${lista.imovel?.trim() ? ` sobre o ${lista.imovel.trim()}` : ""}.`,
  ];
  if (trecho) partes.push(`A mensagem foi: «${trecho}».`);
  partes.push(
    "A fala dele provavelmente responde a ela. Continue a partir dessa mensagem: não se apresente de novo e não a repita.",
  );
  if (lista.imovel?.trim()) {
    partes.push(`Se ele perguntar de um imóvel sem dizer qual, é o ${lista.imovel.trim()}.`);
  }
  return partes.join(" ");
}

/**
 * A GUARDA DE CONVERSA HUMANA (Fase 2): se o corretor falou com o lead nas
 * últimas 24h, a mensagem da lista não sai para ele. Mensagem genérica de
 * lista no meio de uma negociação em andamento parece robô e atropela o que
 * o corretor acabou de dizer.
 *
 * O item vira `erro` com este motivo, que a gaveta da lista mostra. Não volta
 * para a fila: a lista é uma abordagem de um dia, e mandar dias depois para
 * quem estava conversando seria o mesmo atropelo atrasado.
 */
export const HORAS_DA_GUARDA_HUMANA = 24;
export const MOTIVO_CONVERSA_RECENTE = "Você conversou com este lead nas últimas 24h; a lista não foi enviada";
