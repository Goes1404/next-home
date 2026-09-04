"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useAvisos } from "@/app/corretor/(painel)/_componentes/Avisos";
import { excluirImovel } from "../actions";

/**
 * Apagar o cadastro de um imóvel — o caminho que não existia.
 *
 * Relatado em 04/09/2026: "não é possível excluir um imóvel". Não havia
 * botão nem policy; o cadastro "teste" ficou preso no banco.
 *
 * ## Só aparece quando o imóvel está DESPUBLICADO
 *
 * Mesma regra de dois passos de `leads`, e pelo mesmo motivo: apagar não tem
 * volta. Aqui o primeiro passo já existia — despublicar, que tira da vitrine
 * na hora e é reversível. Quando o imóvel está no ar, o bloco explica o que
 * fazer em vez de sumir calado: botão que some sem dizer por quê é a pior
 * versão de um botão desabilitado.
 *
 * A trava de verdade é a policy (0097), que só deixa apagar `publicado =
 * false`. Isto aqui é a porta, não a fechadura.
 *
 * ## Confirma no lugar, não em `confirm()`
 *
 * O diálogo do navegador é fácil de despachar sem ler. O segundo toque
 * acontece onde o primeiro aconteceu, dizendo o NOME do imóvel e o que vai
 * junto — foto, planta e tipologia somem por cascade.
 */
export function ExcluirImovel({
  slug,
  nome,
  publicado,
}: {
  slug: string;
  nome: string;
  publicado: boolean;
}) {
  const router = useRouter();
  const { falhar } = useAvisos();
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, iniciar] = useTransition();

  function apagar() {
    iniciar(async () => {
      try {
        const r = await excluirImovel(slug);
        if (!r.ok) {
          setConfirmando(false);
          falhar(r.erro ?? "Não foi possível excluir agora.");
          return;
        }
        router.push("/corretor/imoveis");
        router.refresh();
      } catch {
        setConfirmando(false);
        falhar("Sem conexão. Tente de novo.");
      }
    });
  }

  return (
    <section className="border-perigo-linha mt-8 rounded-2xl border border-dashed p-5">
      <h2 className="text-fluid-sm text-titulo font-medium">Excluir este imóvel</h2>

      {publicado ? (
        <p className="text-fluid-xs text-apoio mt-1 text-pretty">
          Este imóvel está publicado. Despublique primeiro (no botão do rodapé) — assim ele sai da
          vitrine na hora, e você ainda pode voltar atrás. Só depois disso a exclusão aparece aqui.
        </p>
      ) : !confirmando ? (
        <>
          <p className="text-fluid-xs text-apoio mt-1 text-pretty">
            Apaga o cadastro de vez, com as fotos, plantas, tipologias e itens de lazer. Os leads e
            as conversas continuam — só deixam de apontar para este imóvel.
          </p>
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="text-fluid-xs border-perigo-linha text-perigo hover:bg-perigo-lavado mt-3 inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 transition-colors"
          >
            Excluir imóvel
          </button>
        </>
      ) : (
        <>
          <p className="text-fluid-xs text-corpo mt-1 text-pretty">
            Apagar <span className="text-titulo font-medium">{nome}</span> e tudo que está dentro
            dele? Não tem como desfazer.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={apagar}
              disabled={pendente}
              className="text-fluid-xs bg-perigo text-sobre-cor inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pendente ? "Apagando…" : "Apagar de vez"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={pendente}
              className="text-fluid-xs border-linha-forte text-corpo hover:text-titulo inline-flex min-h-11 cursor-pointer items-center rounded-full border px-4 transition-colors disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </>
      )}
    </section>
  );
}
