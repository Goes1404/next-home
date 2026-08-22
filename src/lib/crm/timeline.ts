/**
 * Regras puras da memória do lead e das tarefas.
 *
 * Sem rede e sem banco de propósito: são as contas que decidem o que o
 * corretor vê como "atrasado" e em que ordem o histórico aparece — errar
 * aqui é errar a agenda de alguém, e isso merece teste.
 */

export type TipoInteracao = "nota" | "mensagem" | "ligacao" | "etapa" | "visita" | "sistema";

export type Interacao = {
  id: string;
  tipo: TipoInteracao;
  conteudo: string;
  autor: string | null;
  em: string;
};

export type Tarefa = {
  id: string;
  titulo: string;
  prazo: string;
  concluidaEm: string | null;
  lead?: { id: string; nome: string };
};

export type SituacaoTarefa = "atrasada" | "hoje" | "futura" | "concluida";

/**
 * Em que pé está a tarefa.
 *
 * A comparação de "hoje" é por DIA no fuso local, não por diferença de
 * horas: uma tarefa marcada para as 9h não vira "atrasada" às 10h — ela é
 * de hoje até o dia virar. Tratar por hora encheria a tela de vermelho toda
 * tarde e ensinaria o corretor a ignorar o alerta.
 */
export function situacaoDaTarefa(tarefa: Tarefa, agora: Date = new Date()): SituacaoTarefa {
  if (tarefa.concluidaEm) return "concluida";

  const prazo = new Date(tarefa.prazo);
  const diaPrazo = new Date(prazo.getFullYear(), prazo.getMonth(), prazo.getDate()).getTime();
  const diaHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime();

  if (diaPrazo < diaHoje) return "atrasada";
  if (diaPrazo === diaHoje) return "hoje";
  return "futura";
}

/**
 * O que o corretor precisa ver ao abrir o painel: atrasado primeiro, depois
 * hoje. O futuro fica de fora — agenda de amanhã na tela de hoje é ruído.
 */
export function agendaDoDia(tarefas: Tarefa[], agora: Date = new Date()): Tarefa[] {
  return tarefas
    .filter((t) => {
      const s = situacaoDaTarefa(t, agora);
      return s === "atrasada" || s === "hoje";
    })
    .sort((a, b) => new Date(a.prazo).getTime() - new Date(b.prazo).getTime());
}

/** Rótulo do dia para os cabeçalhos da linha do tempo. */
function chaveDoDia(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Agrupa a linha do tempo por dia, do mais recente para o mais antigo.
 *
 * Ordenar por data e agrupar em uma passada só importa porque a lista é uma
 * MESCLA de duas fontes (interações do CRM + mensagens do WhatsApp), que
 * chegam de consultas separadas e nunca vêm ordenadas entre si.
 */
export function agruparPorDia(interacoes: Interacao[]): { dia: string; itens: Interacao[] }[] {
  const ordenadas = [...interacoes].sort(
    (a, b) => new Date(b.em).getTime() - new Date(a.em).getTime(),
  );

  const grupos: { dia: string; itens: Interacao[] }[] = [];
  for (const item of ordenadas) {
    const dia = chaveDoDia(item.em);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.itens.push(item);
    else grupos.push({ dia, itens: [item] });
  }
  return grupos;
}

/** "Novo lead → Visita agendada" — o texto que a mudança de etapa registra. */
export function textoMudancaEtapa(de: string, para: string): string {
  return `${de} → ${para}`;
}
