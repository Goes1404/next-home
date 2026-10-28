"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { mesDoDia, mesVizinho, rotuloDoMes, type Dia, type Mes } from "@/lib/agenda/calendario";
import { diaVizinho, semanaDoDia } from "@/lib/agenda/semana";
import { MesCompacto } from "./MesCompacto";

const INICIAL = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "narrow" });
const NOME_DO_MES = new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", month: "long" });

const link = (dia: Dia, consulta: string) => `?mes=${mesDoDia(dia)}&dia=${dia}${consulta}`;

/**
 * O calendário da Agenda no celular (visual de 28/10/2026): a semana numa
 * faixa, e o mês inteiro ao tocar no nome do mês. As setas andam uma semana
 * (fechado) ou um mês (aberto). Cada dia é um link, como no mês compacto.
 */
export function CalendarioDoCelular({
  mes,
  dia,
  hoje,
  marcadores,
  consulta = "",
}: {
  mes: Mes;
  dia: Dia;
  hoje: Dia;
  marcadores: Record<Dia, number>;
  consulta?: string;
}) {
  const [mesAberto, setMesAberto] = useState(false);
  const semana = semanaDoDia(dia);
  const anterior = mesAberto ? `?mes=${mesVizinho(mes, -1)}${consulta}` : link(diaVizinho(dia, -7), consulta);
  const seguinte = mesAberto ? `?mes=${mesVizinho(mes, 1)}${consulta}` : link(diaVizinho(dia, 7), consulta);
  const nomeDoMes = NOME_DO_MES.format(new Date(`${dia}T12:00:00Z`));

  return (
    <section className="cartao p-3" aria-label="Calendário">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setMesAberto((v) => !v)}
          aria-expanded={mesAberto}
          className="flex min-h-11 items-center gap-1 rounded-full bg-elevado px-3 font-display text-lg text-titulo first-letter:uppercase"
        >
          <span className="first-letter:uppercase">{mesAberto ? rotuloDoMes(mes) : nomeDoMes}</span>
          <ChevronDown className={cn("h-4 w-4 text-acento transition-transform", mesAberto && "rotate-180")} aria-hidden />
          <span className="sr-only">{mesAberto ? "Mostrar só a semana" : "Mostrar o mês inteiro"}</span>
        </button>
        <div className="flex items-center gap-1">
          <Link href={anterior} aria-label={mesAberto ? "Mês anterior" : "Semana anterior"} className="botao-aba min-h-11 min-w-11 justify-center">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Link>
          {dia !== hoje && (
            <Link href={link(hoje, consulta)} className="botao-aba min-h-11 px-3 text-sm">
              Hoje
            </Link>
          )}
          <Link href={seguinte} aria-label={mesAberto ? "Próximo mês" : "Próxima semana"} className="botao-aba min-h-11 min-w-11 justify-center">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </div>

      {mesAberto ? (
        <div className="mt-2">
          <MesCompacto mes={mes} diaSelecionado={dia} hoje={hoje} marcadores={marcadores} consulta={consulta} soGrade />
        </div>
      ) : (
        <ol className="mt-2 grid grid-cols-7 gap-1">
          {semana.map((d) => {
            const selecionado = d === dia;
            const quantos = marcadores[d] ?? 0;
            return (
              <li key={d}>
                <Link
                  href={link(d, consulta)}
                  aria-current={selecionado ? "date" : undefined}
                  aria-label={`${Number(d.slice(8))}${quantos ? `, ${quantos} compromisso${quantos > 1 ? "s" : ""}` : ""}`}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-2xl transition-colors",
                    selecionado ? "bg-acento text-sobre-cor" : "bg-elevado/60 text-corpo hover:bg-elevado",
                  )}
                >
                  <span className={cn("text-[11px] uppercase", selecionado ? "text-sobre-cor/80" : "text-apoio")}>
                    {INICIAL.format(new Date(`${d}T12:00:00Z`))}
                  </span>
                  <span className={cn("text-base font-semibold", !selecionado && d === hoje && "text-acento")}>{Number(d.slice(8))}</span>
                  <span className={cn("h-1 w-1 rounded-full", quantos ? (selecionado ? "bg-sobre-cor" : "bg-acento") : "bg-transparent")} />
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
