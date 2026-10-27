import Link from "next/link";
import { diaEmSaoPaulo } from "@/lib/agenda/calendario";
import { proximosDeHoje } from "@/lib/agenda/hoje";
import { lerItensDoDia } from "@/lib/agenda/lerAgenda";
import type { ItemDaAgenda } from "@/lib/agenda/itens";

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const TIPO: Record<ItemDaAgenda["tipo"], string> = { visita: "Visita", compromisso: "Compromisso", tarefa: "Tarefa", lembrete: "Lembrete" };

function texto(item: ItemDaAgenda): string {
  if (item.tipo === "visita") return item.nome;
  if (item.tipo === "tarefa") return item.nome ? `${item.titulo} · ${item.nome}` : item.titulo;
  if (item.tipo === "compromisso") return item.titulo || (item.subtipo === "reuniao" ? "Reunião" : "Horário bloqueado");
  return item.texto;
}

/**
 * "Hoje na agenda" no Início (27/10/2026): os próximos compromissos do dia,
 * no máximo três. Some quando não há nada — seção que vive vazia ensina a
 * pular a seção. Falha na leitura também some, com log: é acessório.
 */
export async function HojeNaAgenda({ corretorId, grupoId }: { corretorId: string; grupoId: string }) {
  const agora = new Date();
  let itens: ItemDaAgenda[];
  try {
    itens = proximosDeHoje(await lerItensDoDia({ corretorId, grupoId, dia: diaEmSaoPaulo(agora) }), agora);
  } catch (err) {
    // Cartão acessório: falhar aqui não pode derrubar o Início (error.tsx do painel).
    console.error("[início] agenda de hoje não lida:", err);
    return null;
  }
  if (itens.length === 0) return null;

  return (
    <section className="cartao p-5" aria-labelledby="hoje-na-agenda">
      <div className="flex items-center justify-between gap-3">
        <h2 id="hoje-na-agenda" className="font-display text-lg text-titulo">
          Hoje na agenda
        </h2>
        <Link href="/corretor/agenda" className="botao-aba min-h-11 text-sm">
          Ver agenda
        </Link>
      </div>
      <ul className="mt-3 space-y-2">
        {itens.map((item) => (
          <li key={`${item.tipo}-${item.id}`} className="text-fluid-sm flex gap-3 text-corpo">
            <span className="w-12 shrink-0 font-medium text-titulo">{HORA.format(new Date(item.inicio))}</span>
            <span className="min-w-0 break-words">
              <span className="text-apoio">{TIPO[item.tipo]} · </span>
              {texto(item)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
