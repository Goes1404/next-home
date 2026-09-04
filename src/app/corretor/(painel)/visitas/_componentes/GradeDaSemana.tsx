"use client";

import { useState, useTransition } from "react";
import { salvarDisponibilidade, type FaixaDaSemana } from "../acoes";

/**
 * Quando o corretor recebe visita — a grade da semana.
 *
 * ## Por que existe
 *
 * Até 31/08/2026 a assistente oferecia horário de cabeça. O eval de
 * conversa mediu o estrago: os mesmos dois horários inventados quatro
 * vezes seguidas, e o funil mostra 6 visitas propostas para 1 marcada.
 * Horário inventado é a forma mais barata de perder a visita — o cliente
 * aceita, o corretor não pode, e alguém desmarca.
 *
 * ## Por que é uma grade e não um calendário
 *
 * Corretor não tem agenda de escritório: tem "sábado de manhã eu recebo".
 * O que se repete é a SEMANA. Um calendário por data seria mais poderoso e
 * ninguém preencheria — a régua do Painel de Bolso é o mínimo de decisão
 * possível. Exceção de uma data específica fica para quando alguém pedir.
 */

const DIAS = [
  { n: 1, curto: "seg", longo: "segunda" },
  { n: 2, curto: "ter", longo: "terça" },
  { n: 3, curto: "qua", longo: "quarta" },
  { n: 4, curto: "qui", longo: "quinta" },
  { n: 5, curto: "sex", longo: "sexta" },
  { n: 6, curto: "sáb", longo: "sábado" },
  { n: 0, curto: "dom", longo: "domingo" },
] as const;

/** Faixa sugerida ao ligar um dia: manhã comercial, o horário mais aceito. */
const PADRAO = { horaInicio: 9, horaFim: 12 };

const HORAS = Array.from({ length: 17 }, (_, i) => i + 6); // 6h às 22h

export function GradeDaSemana({ inicial }: { inicial: FaixaDaSemana[] }) {
  const [faixas, setFaixas] = useState<FaixaDaSemana[]>(inicial);
  const [aviso, setAviso] = useState<{ ok?: string; erro?: string } | null>(null);
  const [salvando, comecarSalvar] = useTransition();

  const doDia = (dia: number) => faixas.find((f) => f.diaSemana === dia);

  const alternar = (dia: number) => {
    setAviso(null);
    setFaixas((atual) =>
      atual.some((f) => f.diaSemana === dia)
        ? atual.filter((f) => f.diaSemana !== dia)
        : [...atual, { diaSemana: dia, ...PADRAO }],
    );
  };

  const mudarHora = (dia: number, campo: "horaInicio" | "horaFim", valor: number) => {
    setAviso(null);
    setFaixas((atual) =>
      atual.map((f) =>
        f.diaSemana === dia
          ? {
              ...f,
              [campo]: valor,
              // Fim precisa ficar depois do começo — corrigir aqui evita a
              // ida ao servidor só para ouvir "inválido".
              ...(campo === "horaInicio" && valor >= f.horaFim ? { horaFim: valor + 1 } : {}),
              ...(campo === "horaFim" && valor <= f.horaInicio ? { horaInicio: valor - 1 } : {}),
            }
          : f,
      ),
    );
  };

  const salvar = () =>
    comecarSalvar(async () => setAviso(await salvarDisponibilidade(faixas)));

  return (
    <section className="cartao p-5 sm:p-6">
      <h2 className="font-display text-titulo text-lg">Quando você recebe visita</h2>
      <p className="text-fluid-xs text-apoio mt-1.5 leading-relaxed text-pretty">
        A assistente só oferece horário que está aqui. Sem esta grade, ela fala de horário de forma
        genérica — e horário que o cliente aceita e você não pode atender custa a visita inteira.
      </p>

      <ul className="mt-5 flex flex-col gap-2">
        {DIAS.map(({ n, curto, longo }) => {
          const faixa = doDia(n);
          const ligado = Boolean(faixa);

          return (
            <li
              key={n}
              className={`flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors ${
                ligado ? "border-acento-linha bg-acento-lavado" : "border-linha"
              }`}
            >
              <button
                type="button"
                onClick={() => alternar(n)}
                aria-pressed={ligado}
                className={`text-fluid-sm min-h-11 min-w-16 cursor-pointer rounded-lg px-3 font-semibold capitalize transition-colors ${
                  ligado ? "text-acento-suave" : "text-tenue hover:text-corpo"
                }`}
              >
                {curto}
              </button>

              {faixa ? (
                <span className="text-fluid-sm text-corpo flex flex-wrap items-center gap-2">
                  das
                  <select
                    aria-label={`Hora de início da ${longo}`}
                    value={faixa.horaInicio}
                    onChange={(e) => mudarHora(n, "horaInicio", Number(e.target.value))}
                    className="border-linha bg-campo text-titulo min-h-11 cursor-pointer rounded-lg border px-2"
                  >
                    {HORAS.slice(0, -1).map((h) => (
                      <option key={h} value={h}>{`${h}h`}</option>
                    ))}
                  </select>
                  às
                  <select
                    aria-label={`Hora de término da ${longo}`}
                    value={faixa.horaFim}
                    onChange={(e) => mudarHora(n, "horaFim", Number(e.target.value))}
                    className="border-linha bg-campo text-titulo min-h-11 cursor-pointer rounded-lg border px-2"
                  >
                    {HORAS.slice(1).map((h) => (
                      <option key={h} value={h}>{`${h}h`}</option>
                    ))}
                  </select>
                </span>
              ) : (
                <span className="text-fluid-xs text-tenue">não recebo</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={salvar}
          disabled={salvando}
          className="bg-acento text-sobre-cor text-fluid-sm min-h-11 cursor-pointer rounded-full px-5 font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {salvando ? "Salvando…" : "Salvar agenda"}
        </button>

        {aviso && (
          <p
            className={`text-fluid-xs ${aviso.erro ? "text-perigo" : "text-ok"}`}
            role="status"
          >
            {aviso.erro ?? aviso.ok}
          </p>
        )}
      </div>
    </section>
  );
}
