"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import {
  NA_HOME,
  alternarDestaque,
  mover,
  podeMover,
  type ItemDaVitrine,
} from "@/lib/imoveis/ordemDaVitrine";
import { salvarOrdemDaVitrine } from "../actions";

export type ItemDaTela = ItemDaVitrine & { bairro: string; foto: string | null };

/**
 * A lista do site, na ordem do site, com subir, descer e destaque.
 *
 * Salva por BOTÃO, não a cada toque: arrumar a lista são dez trocas seguidas,
 * e gravar cada uma seria dez rodadas ao banco e dez vezes o cache do site
 * derrubado no meio do arranjo.
 */
export function OrdemNoSite({ iniciais }: { iniciais: ItemDaTela[] }) {
  const [lista, setLista] = useState(iniciais);
  const [salva, setSalva] = useState(iniciais);
  const [pendente, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const mudou =
    lista.length !== salva.length ||
    lista.some((item, i) => item.slug !== salva[i].slug || item.destaque !== salva[i].destaque);
  const totalDestaques = lista.filter((i) => i.destaque).length;

  function alterar(nova: ItemDaTela[]) {
    setLista(nova);
    setAviso(null);
  }

  function salvar() {
    const enviada = lista;
    iniciar(async () => {
      try {
        const res = await salvarOrdemDaVitrine(enviada.map(({ slug, destaque }) => ({ slug, destaque })));
        if (res.ok) {
          setSalva(enviada);
          setAviso({ tipo: "ok", texto: "Ordem salva. O site já mostra os imóveis nesta sequência." });
        } else {
          setAviso({ tipo: "erro", texto: res.erro ?? "Não foi possível salvar a ordem." });
        }
      } catch (e) {
        setAviso({
          tipo: "erro",
          texto: ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.",
        });
      }
    });
  }

  const barra = (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={salvar}
        disabled={!mudou || pendente}
        className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm inline-flex min-h-11 items-center justify-center rounded-xl px-5 font-medium transition-colors disabled:opacity-40"
      >
        {pendente ? "Salvando…" : "Salvar ordem"}
      </button>
      {mudou && !pendente && (
        <button
          type="button"
          onClick={() => alterar(salva)}
          className="text-fluid-sm min-h-11 rounded-xl px-3 text-apoio hover:text-titulo"
        >
          Desfazer mudanças
        </button>
      )}
      {aviso && (
        <p
          role={aviso.tipo === "erro" ? "alert" : "status"}
          className={`text-fluid-sm ${aviso.tipo === "erro" ? "text-perigo" : "text-acento"}`}
        >
          {aviso.texto}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="cartao space-y-2 p-5">
        <p className="text-fluid-sm text-corpo">
          É nesta sequência que o site mostra os imóveis — na lista de imóveis e em
          &quot;Selecionados&quot;, na página inicial, que pega os {NA_HOME} primeiros.
        </p>
        <p className="text-fluid-sm text-apoio">
          Os marcados como <strong className="text-titulo">destaque</strong> vêm sempre antes dos
          outros. Para passar um imóvel para cima dessa linha, marque-o como destaque.
        </p>
      </div>

      {barra}

      <ol className="space-y-2">
        {lista.map((item, i) => {
          const fronteira = i === totalDestaques && totalDestaques > 0;
          return (
            <li key={item.slug} className="space-y-2">
              {fronteira && (
                <p className="text-fluid-xs pt-2 font-medium uppercase tracking-wide text-tenue">
                  Demais imóveis
                </p>
              )}
              {i === 0 && totalDestaques > 0 && (
                <p className="text-fluid-xs font-medium uppercase tracking-wide text-tenue">Destaques</p>
              )}
              <div className="cartao flex items-center gap-2 p-2 sm:gap-3 sm:pr-3">
                <span className="text-fluid-sm w-6 shrink-0 text-center font-medium text-apoio">{i + 1}</span>
                <div className="relative hidden h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-elevado sm:block">
                  {item.foto && (
                    <Image src={item.foto} alt="" fill sizes="64px" className="object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-fluid-sm break-words font-medium text-titulo">{item.nome}</p>
                  <p className="text-fluid-xs break-words text-apoio">
                    {item.bairro}
                    {i < NA_HOME && <span className="text-acento"> · na página inicial</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center justify-end">
                  <button
                    type="button"
                    onClick={() => alterar(alternarDestaque(lista, item.slug))}
                    aria-pressed={item.destaque}
                    aria-label={item.destaque ? `Tirar ${item.nome} dos destaques` : `Marcar ${item.nome} como destaque`}
                    title={item.destaque ? "Tirar dos destaques" : "Marcar como destaque"}
                    className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-lg ${
                      item.destaque ? "text-alerta" : "text-tenue hover:text-titulo"
                    }`}
                  >
                    {item.destaque ? "★" : "☆"}
                  </button>
                  <button
                    type="button"
                    onClick={() => alterar(mover(lista, i, -1))}
                    disabled={!podeMover(lista, i, -1)}
                    aria-label={`Subir ${item.nome}`}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-apoio hover:bg-vidro-forte hover:text-titulo disabled:opacity-25"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => alterar(mover(lista, i, 1))}
                    disabled={!podeMover(lista, i, 1)}
                    aria-label={`Descer ${item.nome}`}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-apoio hover:bg-vidro-forte hover:text-titulo disabled:opacity-25"
                  >
                    ↓
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {lista.length > 8 && barra}
    </div>
  );
}
