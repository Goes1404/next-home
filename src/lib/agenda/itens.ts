import { diaEmSaoPaulo, type Dia } from "./calendario";

/** O que aparece na lista do dia da Agenda. `inicio` é ISO (instante). */
export type ItemDaAgenda =
  | {
      tipo: "visita";
      id: string;
      inicio: string;
      leadId: string;
      nome: string;
      telefone: string | null;
      imovel: { nome: string; endereco: string | null } | null;
      confirmadaPeloCliente: boolean;
    }
  | { tipo: "tarefa"; id: string; inicio: string; titulo: string; leadId: string | null; nome: string | null }
  | { tipo: "lembrete"; id: string; inicio: string; texto: string; leadId: string | null };

/** Régua do Painel de Bolso: nenhuma lista recebe mais que ~30 linhas. */
export const MAXIMO_POR_DIA = 30;

/** No mesmo horário, o compromisso com cliente vem primeiro. */
const PESO: Record<ItemDaAgenda["tipo"], number> = { visita: 0, tarefa: 1, lembrete: 2 };

export function ordenarItens(itens: ItemDaAgenda[]): ItemDaAgenda[] {
  return [...itens].sort(
    (a, b) => Date.parse(a.inicio) - Date.parse(b.inicio) || PESO[a.tipo] - PESO[b.tipo],
  );
}

export function contarPorDia(instantes: string[]): Record<Dia, number> {
  const contagem: Record<Dia, number> = {};
  for (const instante of instantes) {
    const dia = diaEmSaoPaulo(new Date(instante));
    contagem[dia] = (contagem[dia] ?? 0) + 1;
  }
  return contagem;
}
