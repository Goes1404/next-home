import { diaEmSaoPaulo, type Dia } from "./calendario";
import type { ItemDaAgenda } from "./itens";

/**
 * A faixa da semana e o título do dia da Agenda (visual de 28/10/2026). Puro,
 * no mesmo meio-dia UTC de `calendario.ts`: o dia da semana não depende do
 * fuso de quem roda.
 */

const meioDia = (dia: Dia) => new Date(`${dia}T12:00:00Z`);

export function diaVizinho(dia: Dia, quantos: number): Dia {
  const d = meioDia(dia);
  d.setUTCDate(d.getUTCDate() + quantos);
  return d.toISOString().slice(0, 10);
}

/** Domingo a sábado da semana do dia, atravessando o mês se for o caso. */
export function semanaDoDia(dia: Dia): Dia[] {
  const domingo = diaVizinho(dia, -meioDia(dia).getUTCDay());
  return Array.from({ length: 7 }, (_, i) => diaVizinho(domingo, i));
}

const SEMANA = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long" });
const DIA_E_MES = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "numeric", month: "long" });

const maiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "quarta-feira" → "quarta": o dia da semana curto, como se fala. */
const diaDaSemana = (dia: Dia) => SEMANA.format(meioDia(dia)).replace("-feira", "");

/** "Hoje, quarta 28" · "Amanhã, quinta 29" · "Sexta, 30 de outubro". */
export function rotuloDoDia(dia: Dia, hoje: Dia): string {
  const numero = Number(dia.slice(8));
  const perto = dia === hoje ? "Hoje" : dia === diaVizinho(hoje, 1) ? "Amanhã" : dia === diaVizinho(hoje, -1) ? "Ontem" : null;
  if (perto) return `${perto}, ${diaDaSemana(dia)} ${numero}`;
  return `${maiuscula(diaDaSemana(dia))}, ${DIA_E_MES.format(meioDia(dia))}`;
}

const CONTAGEM: { chave: string; um: string; varios: string }[] = [
  { chave: "visita", um: "visita", varios: "visitas" },
  { chave: "tarefa", um: "tarefa", varios: "tarefas" },
  { chave: "reuniao", um: "reunião", varios: "reuniões" },
  { chave: "bloqueio", um: "horário bloqueado", varios: "horários bloqueados" },
  { chave: "lembrete", um: "lembrete", varios: "lembretes" },
];

/** "2 visitas · 1 tarefa · 1 reunião": o que o dia tem, por tipo. */
export function resumoDoDia(itens: ItemDaAgenda[]): string {
  if (itens.length === 0) return "Nada marcado";
  const quantos = new Map<string, number>();
  for (const item of itens) {
    const chave = item.tipo === "compromisso" ? item.subtipo : item.tipo;
    quantos.set(chave, (quantos.get(chave) ?? 0) + 1);
  }
  return CONTAGEM.filter((c) => quantos.has(c.chave))
    .map((c) => {
      const n = quantos.get(c.chave)!;
      return `${n} ${n === 1 ? c.um : c.varios}`;
    })
    .join(" · ");
}

/**
 * Onde entra a linha do "agora" na lista do dia (itens já em ordem): depois
 * de tudo que já começou. Null se o dia mostrado não é hoje.
 */
export function posicaoDoAgora(itens: ItemDaAgenda[], agora: Date, dia: Dia): number | null {
  if (diaEmSaoPaulo(agora) !== dia) return null;
  return itens.filter((i) => Date.parse(i.inicio) <= agora.getTime()).length;
}

/** Deslize na faixa da semana: precisa andar 50px e mais de lado que de pé (senão é rolagem). */
const DESLIZE_MINIMO = 50;

/** 1 = próxima (arrastou para a esquerda), -1 = anterior, 0 = não foi deslize. */
export function passoDoDeslize(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < DESLIZE_MINIMO || Math.abs(dy) > Math.abs(dx)) return 0;
  return dx < 0 ? 1 : -1;
}

/** As próximas visitas sem as do dia mostrado, que já estão na lista do meio. */
export function deOutrosDias<T extends { inicio: string }>(visitas: T[], dia: Dia): T[] {
  return visitas.filter((v) => diaEmSaoPaulo(new Date(v.inicio)) !== dia);
}
