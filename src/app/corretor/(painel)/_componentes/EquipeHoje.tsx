import Link from "next/link";
import { diaEmSaoPaulo } from "@/lib/agenda/calendario";
import { lerDiaDaEquipe } from "@/lib/agenda/lerEquipe";
import type { VisitaDoItem } from "@/lib/agenda/linhaDaVisita";

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const MOSTRAR = 5;

/**
 * "Equipe hoje" no Início do gestor (27/10/2026, fase 2): quantas visitas a
 * equipe tem hoje e as próximas cinco, com quem faz. Some sem visita; falha
 * na leitura também some, com log — é acessório.
 */
export async function EquipeHoje({ grupoId }: { grupoId: string }) {
  const agora = new Date();
  let dia: { itens: VisitaDoItem[]; total: number };
  try {
    dia = await lerDiaDaEquipe({ grupoId, corretorId: null, dia: diaEmSaoPaulo(agora) });
  } catch (err) {
    console.error("[início] dia da equipe não lido:", err);
    return null;
  }
  if (dia.total === 0) return null;
  const proximas = dia.itens.filter((v) => Date.parse(v.inicio) >= agora.getTime() - 60 * 60_000).slice(0, MOSTRAR);

  return (
    <section className="cartao p-5" aria-labelledby="equipe-hoje">
      <div className="flex items-center justify-between gap-3">
        <h2 id="equipe-hoje" className="font-display text-lg text-titulo">
          Equipe hoje · {dia.total} visita{dia.total > 1 ? "s" : ""}
        </h2>
        <Link href="/corretor/agenda?ver=equipe" className="botao-aba min-h-11 text-sm">
          Ver equipe
        </Link>
      </div>
      {proximas.length > 0 && (
        <ul className="mt-3 space-y-2">
          {proximas.map((v) => (
            <li key={v.id} className="text-fluid-sm flex gap-3 text-corpo">
              <span className="w-12 shrink-0 font-medium text-titulo">{HORA.format(new Date(v.inicio))}</span>
              <span className="min-w-0 break-words">
                {v.nome}
                <span className="text-apoio"> · {v.corretorNome ?? "Corretor"}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
