"use client";

import Image from "next/image";
import { useState } from "react";
import { avisoDePaginaVelha, ehActionDeOutroBuild } from "@/lib/erros/actionDeOutroBuild";
import { useArrastarParaOrdenar } from "../../_componentes/useArrastarParaOrdenar";
import { TEXTO_DO_SALVAMENTO, useSalvarSozinho } from "../../_componentes/useSalvarSozinho";
import { IconeAlca } from "../../_componentes/IconeAlca";
import {
  NA_HOME,
  alternarDestaque,
  arrastarPara,
  mover,
  podeMover,
  type ItemDaVitrine,
} from "@/lib/imoveis/ordemDaVitrine";
import { salvarOrdemDaVitrine } from "../actions";

export type ItemDaTela = ItemDaVitrine & { bairro: string; foto: string | null };

/**
 * A lista do site, na ordem do site, com arrastar, subir, descer e destaque.
 *
 * Salva SOZINHA (`useSalvarSozinho`): pouco depois da última mudança, e nunca
 * no meio de um arrasto. A espera junta várias trocas seguidas numa gravação
 * só — era esse o motivo do botão "Salvar ordem" que existiu até 24/09.
 */
export function OrdemNoSite({ iniciais }: { iniciais: ItemDaTela[] }) {
  const [lista, setLista] = useState(iniciais);
  const [salva, setSalva] = useState(iniciais);
  const [erro, setErro] = useState<string | null>(null);

  const totalDestaques = lista.filter((i) => i.destaque).length;

  function alterar(nova: ItemDaTela[]) {
    setLista(nova);
  }

  const arrasto = useArrastarParaOrdenar({
    escopo: "imoveis-do-site",
    // Atualização FUNCIONAL: durante o arrasto dois movimentos podem sair no
    // mesmo quadro, antes de a tela renderizar — ler `lista` do fechamento
    // aplicaria o segundo sobre a lista velha.
    aoMover: (de, para) => setLista((atual) => arrastarPara(atual, de, para)),
  });

  const salvamento = useSalvarSozinho({
    chave: chaveDa(lista),
    chaveSalva: chaveDa(salva),
    pausado: arrasto.arrastando !== null,
    salvar: async () => {
      const enviada = lista;
      try {
        const res = await salvarOrdemDaVitrine(enviada.map(({ slug, destaque }) => ({ slug, destaque })));
        if (!res.ok) {
          setErro(res.erro ?? "Não foi possível salvar a ordem.");
          return false;
        }
        setSalva(enviada);
        setErro(null);
        return true;
      } catch (e) {
        setErro(ehActionDeOutroBuild(e) ? avisoDePaginaVelha() : "Sem conexão. Tente de novo.");
        return false;
      }
    },
  });

  const barra = (
    <div className="flex min-h-11 flex-wrap items-center gap-3" role="status" aria-live="polite">
      <p
        className={`text-fluid-sm ${
          salvamento.estado === "erro"
            ? "text-perigo"
            : salvamento.estado === "salvo"
              ? "text-acento"
              : "text-apoio"
        }`}
      >
        {salvamento.estado === "erro" && erro ? erro : TEXTO_DO_SALVAMENTO[salvamento.estado]}
      </p>
      {salvamento.estado === "erro" && (
        <button
          type="button"
          onClick={salvamento.tentarDeNovo}
          className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-sm inline-flex min-h-11 items-center justify-center rounded-xl px-4 font-medium"
        >
          Tentar de novo
        </button>
      )}
      {salvamento.estado === "erro" && (
        <button
          type="button"
          onClick={() => alterar(salva)}
          className="text-fluid-sm min-h-11 rounded-xl px-3 text-apoio hover:text-titulo"
        >
          Voltar à ordem salva
        </button>
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
          Arraste pela alça <span aria-hidden>⠿</span> até a posição certa, ou use as setas. Os
          marcados como <strong className="text-titulo">destaque</strong> vêm sempre antes dos
          outros; arrastar um imóvel para o meio deles o torna destaque.
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
              <div
                {...arrasto.item(i)}
                className={`cartao flex items-center gap-2 p-2 transition-shadow sm:gap-3 sm:pr-3 ${
                  arrasto.arrastando === i ? "ring-acento relative z-10 opacity-90 shadow-lg ring-2" : ""
                }`}
              >
                <button
                  type="button"
                  {...arrasto.alca(i)}
                  aria-label={`Arrastar ${item.nome} para outra posição`}
                  title="Arrastar para outra posição"
                  className="-my-1 flex min-h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center text-tenue hover:text-corpo active:cursor-grabbing"
                >
                  <IconeAlca className="h-4 w-4" />
                </button>
                <span className="text-fluid-sm hidden w-5 shrink-0 text-center font-medium text-apoio sm:inline">{i + 1}</span>
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

    </div>
  );
}

function chaveDa(lista: ItemDaVitrine[]): string {
  return lista.map((i) => `${i.slug}:${i.destaque ? 1 : 0}`).join("|");
}
