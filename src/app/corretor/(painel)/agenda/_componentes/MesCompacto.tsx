import Link from "next/link";
import { cn } from "@/lib/utils";
import { mesVizinho, rotuloDoMes, semanasDoMes, type Dia, type Mes } from "@/lib/agenda/calendario";

const INICIAIS = ["D", "S", "T", "Q", "Q", "S", "S"];

/**
 * O mês compacto da Agenda (27/10/2026). Componente de servidor, sem JS: cada
 * dia é um link (`?mes=&dia=`), e o ponto embaixo diz que ali há compromisso.
 * Sete colunas de no mínimo 40px cabem em 320px sem rolar de lado.
 */
export function MesCompacto({
  mes,
  diaSelecionado,
  hoje,
  marcadores,
  consulta = "",
  compacto = false,
  soGrade = false,
}: {
  mes: Mes;
  diaSelecionado: Dia;
  hoje: Dia;
  marcadores: Record<Dia, number>;
  /** O resto da consulta a preservar nos links (`&ver=equipe&corretor=…`). */
  consulta?: string;
  /** Na coluna estreita do computador: casas menores. */
  compacto?: boolean;
  /** Dentro do calendário do celular, que já tem o título e as setas. */
  soGrade?: boolean;
}) {
  const anterior = mesVizinho(mes, -1);
  const seguinte = mesVizinho(mes, 1);

  const grade = (
    <>
      <div className={cn("grid grid-cols-7 text-center text-fluid-xs font-medium text-apoio", soGrade ? "mt-1" : "mt-3")} aria-hidden>
        {INICIAIS.map((inicial, i) => (
          <span key={i}>{inicial}</span>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-y-1">
        {semanasDoMes(mes)
          .flat()
          .map((dia, i) => {
            if (!dia) return <span key={`vazio-${i}`} />;
            const quantos = marcadores[dia] ?? 0;
            const selecionado = dia === diaSelecionado;
            return (
              <Link
                key={dia}
                href={`?mes=${mes}&dia=${dia}${consulta}`}
                aria-current={selecionado ? "date" : undefined}
                aria-label={`${Number(dia.slice(8))}${quantos ? `, ${quantos} compromisso${quantos > 1 ? "s" : ""}` : ""}`}
                className={cn(
                  "mx-auto flex flex-col items-center justify-center rounded-full transition-colors",
                  compacto ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm",
                  selecionado ? "bg-acento font-semibold text-sobre-cor" : "text-corpo hover:bg-elevado",
                  !selecionado && dia === hoje && "font-semibold text-acento ring-1 ring-acento-linha",
                )}
              >
                {Number(dia.slice(8))}
                <span
                  className={cn("mt-0.5 h-1 w-1 rounded-full", quantos ? (selecionado ? "bg-sobre-cor" : "bg-acento") : "bg-transparent")}
                />
              </Link>
            );
          })}
      </div>
    </>
  );

  if (soGrade) return <div aria-label={`Calendário de ${rotuloDoMes(mes)}`}>{grade}</div>;

  return (
    <section className={cn("cartao", compacto ? "p-3" : "p-4")} aria-label={`Calendário de ${rotuloDoMes(mes)}`}>
      <div className="flex items-center justify-between gap-2">
        <Link
          href={`?mes=${anterior}${consulta}`}
          className="botao-aba min-h-10 min-w-10 justify-center"
          aria-label={`Ir para ${rotuloDoMes(anterior)}`}
        >
          ‹
        </Link>
        <p className={cn("font-display text-titulo first-letter:uppercase", compacto ? "text-base" : "text-lg")}>{rotuloDoMes(mes)}</p>
        <Link
          href={`?mes=${seguinte}${consulta}`}
          className="botao-aba min-h-10 min-w-10 justify-center"
          aria-label={`Ir para ${rotuloDoMes(seguinte)}`}
        >
          ›
        </Link>
      </div>

      {grade}
    </section>
  );
}
