import Link from "next/link";
import type { VisitaDoItem } from "@/lib/agenda/linhaDaVisita";
import { PassarVisita } from "./PassarVisita";

const HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

const STATUS: Record<string, string> = {
  marcada: "Marcada",
  realizada: "Aconteceu",
  faltou: "Cliente faltou",
  sem_confirmacao: "Sem confirmação",
};

/**
 * O dia da EQUIPE para o gestor (fase 2): uma linha por compromisso, com
 * hora, cliente, corretor que faz, imóvel e situação. A visita futura ainda
 * marcada pode ser passada a outro corretor. Teto de 30 linhas, dito na tela.
 */
export function ListaDaEquipe({
  itens,
  total,
  equipe,
  agora,
}: {
  itens: VisitaDoItem[];
  total: number;
  equipe: { id: string; nome: string }[];
  agora: Date;
}) {
  if (itens.length === 0) {
    return (
      <div className="cartao p-5">
        <p className="text-fluid-sm text-corpo">Nenhuma visita da equipe neste dia.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {itens.map((v) => (
          <li key={v.id} className="cartao px-5 py-3">
            <div className="flex items-start gap-3">
              <span className="w-12 shrink-0 font-display text-titulo">{HORA.format(new Date(v.inicio))}</span>
              <div className="min-w-0 flex-1">
                <Link href={`/corretor/leads/${v.leadId}`} className="link-acao text-fluid-sm block break-words font-medium text-titulo">
                  {v.nome}
                </Link>
                <p className="text-fluid-xs break-words text-apoio">
                  {v.corretorNome ?? "Corretor"} · {v.imovel?.nome ?? "Imóvel não informado"}
                  {v.passada ? " · passada pelo gestor" : ""}
                </p>
              </div>
              <span className="text-fluid-xs shrink-0 rounded-full bg-elevado px-2.5 py-1 text-corpo">
                {STATUS[v.status ?? "marcada"] ?? "Marcada"}
              </span>
            </div>
            {v.status === "marcada" && Date.parse(v.inicio) > agora.getTime() && v.corretorId && (
              <PassarVisita visitaId={v.id} corretorAtualId={v.corretorId} equipe={equipe} />
            )}
          </li>
        ))}
      </ul>
      {total > itens.length && (
        <p className="text-fluid-xs text-apoio">
          Mostrando {itens.length} de {total}. Filtre por corretor para ver o resto.
        </p>
      )}
    </div>
  );
}
