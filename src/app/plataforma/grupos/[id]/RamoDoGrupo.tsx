"use client";

import { useState, useTransition } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { IconeDoRamo } from "@/lib/ramos/IconeDoRamo";
import { configDoRamo, nomeDoRamo, type Ramo } from "@/lib/ramos/ramos";
import { mudarRamoDoGrupo } from "../../acoes";
import { SeletorDeRamo } from "../novo/componentes";

const BOTAO_PRINCIPAL =
  "text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 cursor-pointer items-center rounded-xl px-5 font-bold disabled:opacity-60";

/**
 * O ramo do negócio do grupo (29/10/2026, 0244). É ele que faz o painel do
 * cliente ser o CRM daquele negócio: vocabulário (corretor → consultor,
 * imóvel → seguro...), módulos do menu e a IA do WhatsApp. Trocar não apaga
 * nada; o que é de imobiliária só some do menu.
 */
export function RamoDoGrupo({
  grupoId,
  ramo,
  descricao,
  fixo,
}: {
  grupoId: string;
  ramo: Ramo;
  descricao: string | null;
  /** A Next Home: é imobiliária e fica imobiliária. */
  fixo: boolean;
}) {
  const [novo, setNovo] = useState<string>(ramo);
  const [texto, setTexto] = useState(descricao ?? "");
  const [aviso, setAviso] = useState<{ texto: string; erro: boolean } | null>(null);
  const [pendente, iniciar] = useTransition();
  const mudou = novo !== ramo || (novo === "outro" && texto.trim() !== (descricao ?? ""));

  const salvar = () =>
    iniciar(async () => {
      setAviso(null);
      try {
        const r = await mudarRamoDoGrupo(grupoId, { ramo: novo, ramoDescricao: texto });
        setAviso(
          r.ok
            ? { texto: "Ramo alterado: o painel do cliente já abre com o vocabulário e o menu do ramo novo.", erro: false }
            : { texto: r.erro, erro: true },
        );
      } catch (e) {
        setAviso({
          texto: ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Não foi possível falar com o servidor. Tente de novo.",
          erro: true,
        });
      }
    });

  return (
    <section className="cartao flex flex-col gap-4 p-5" aria-labelledby="titulo-ramo">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="titulo-ramo" className="text-fluid-sm text-titulo font-bold">
          Ramo do negócio
        </h2>
        <span className="text-fluid-xs border-linha text-apoio inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
          <IconeDoRamo ramo={ramo} className="size-3.5 shrink-0" />
          {nomeDoRamo(ramo, descricao)}
        </span>
      </div>
      <p className="text-fluid-xs text-apoio">
        Muda o vocabulário do painel (quem atende é &ldquo;{configDoRamo(ramo).vocabulario.equipe.singular}&rdquo;), os
        módulos do menu e a IA do WhatsApp. Trocar não apaga nada.
      </p>

      {aviso && (
        <p
          role={aviso.erro ? "alert" : "status"}
          className={`text-fluid-sm rounded-xl border px-4 py-3 ${
            aviso.erro ? "border-perigo-linha bg-perigo-lavado text-perigo" : "border-ok-linha bg-ok-lavado text-ok"
          }`}
        >
          {aviso.texto}
        </p>
      )}

      {fixo ? (
        <p className="text-fluid-xs text-apoio">A Next Home fica no ramo imobiliária.</p>
      ) : (
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
        >
          <SeletorDeRamo ramo={novo} descricao={texto} aoMudarRamo={setNovo} aoMudarDescricao={setTexto} />
          <div className="sm:col-span-2">
            <button type="submit" disabled={pendente || !mudou} className={BOTAO_PRINCIPAL}>
              {pendente ? "Salvando…" : "Salvar ramo"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
