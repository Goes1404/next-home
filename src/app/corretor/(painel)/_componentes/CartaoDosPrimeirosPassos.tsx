"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { chaveDoOcultar, type PassoDoInicio } from "@/lib/crm/primeirosPassosDoInicio";
import { useGuardadoNoAparelho } from "@/lib/navegador/guardadoNoAparelho";
import estilos from "./primeirosPassos.module.css";

/**
 * O cartão dos primeiros passos (29/10/2026). Os passos chegam prontos do
 * servidor; aqui só moram o desenho e o "Ocultar", guardado no navegador
 * da pessoa (por login). Até o navegador responder, nada aparece: um
 * cartão que pisca e some para quem já ocultou seria pior que chegar um
 * instante depois (a entrada é suave).
 */
export function CartaoDosPrimeirosPassos({
  corretorId,
  passos,
  progresso,
  ehGestor,
}: {
  corretorId: string;
  passos: PassoDoInicio[];
  progresso: { feitos: number; total: number; fracao: number };
  ehGestor: boolean;
}) {
  const [oculto, ocultar] = useGuardadoNoAparelho(chaveDoOcultar(corretorId));
  if (oculto === undefined || oculto === "1") return null;

  const proximo = passos.find((p) => !p.feito)?.id;
  const faltam = progresso.total - progresso.feitos;
  let feitosAteAqui = 0;

  return (
    <section className={`cartao p-5 sm:p-6 ${estilos.cartao}`} aria-labelledby="titulo-primeiros-passos">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-acento-suave text-[11px] font-semibold tracking-[0.14em] uppercase">Primeiros passos</p>
          <h2 id="titulo-primeiros-passos" className="font-display text-titulo text-fluid-lg mt-1 leading-tight">
            {ehGestor ? "Deixe a sua conta pronta para trabalhar" : "Deixe a plataforma trabalhando para você"}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => ocultar("1")}
          className="text-fluid-xs text-apoio hover:text-titulo hover:bg-vidro border-linha border -mt-1 -mr-2 min-h-11 shrink-0 cursor-pointer rounded-xl px-3"
        >
          Ocultar
        </button>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div
          className={`${estilos.trilho} flex-1`}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progresso.total}
          aria-valuenow={progresso.feitos}
          aria-label="Primeiros passos feitos"
        >
          <div className={estilos.enchimento} style={{ "--fracao": progresso.fracao } as CSSProperties} />
        </div>
        <span className="text-fluid-xs text-apoio shrink-0 tabular-nums">
          <strong className="text-titulo font-semibold">{progresso.feitos}</strong> de {progresso.total}
        </span>
      </div>
      <p className="text-fluid-xs text-apoio mt-1.5">
        {faltam === 1 ? "Falta um passo." : `Faltam ${faltam} passos.`} Quando todos estiverem feitos, este cartão sai daqui.
      </p>

      <ol className="mt-4 grid gap-2 md:grid-cols-2">
        {passos.map((p) => {
          if (p.feito) {
            const i = feitosAteAqui++;
            return (
              <li key={p.id} className="flex min-h-11 items-center gap-3 rounded-xl px-2 py-2">
                <span
                  aria-hidden
                  className={`bg-ok-lavado text-ok grid size-7 shrink-0 place-items-center rounded-full text-sm font-bold ${estilos.visto}`}
                  style={{ "--i": i } as CSSProperties}
                >
                  ✓
                </span>
                <span className="text-fluid-sm text-apoio decoration-apoio/40 line-through">
                  <span className="sr-only">Feito: </span>
                  {p.titulo}
                </span>
              </li>
            );
          }
          const ehOProximo = p.id === proximo;
          return (
            <li key={p.id}>
              <Link
                href={p.href}
                className={`group flex min-h-11 items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors ${estilos.passo} ${
                  ehOProximo ? "border-acento-linha bg-acento-lavado" : "hover:bg-vidro-forte border-transparent"
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 size-7 shrink-0 rounded-full border-2 ${ehOProximo ? "border-acento" : "border-linha-forte"}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="text-fluid-sm text-titulo flex items-center gap-2 font-semibold">
                    {p.titulo}
                    {ehOProximo && (
                      <span className="bg-acento text-sobre-cor rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase">
                        Próximo
                      </span>
                    )}
                  </span>
                  <span className="text-fluid-xs text-apoio mt-0.5 block">{p.porque}</span>
                </span>
                <span aria-hidden className={`text-apoio group-hover:text-titulo mt-0.5 shrink-0 ${estilos.seta}`}>
                  →
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
