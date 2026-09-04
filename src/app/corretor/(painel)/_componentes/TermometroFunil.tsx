import Link from "next/link";
import { FunilVisual } from "./FunilVisual";
import { ETAPAS_FUNIL, type EtapaFunil } from "@/lib/types";

/**
 * O funil inteiro em uma faixa.
 *
 * É a única coisa da tela inicial que responde à pergunta que o corretor
 * realmente faz ao abrir o painel — "como está minha carteira agora" — em
 * vez de repetir três contagens que ele já vê no menu. A largura de cada
 * fatia é a proporção real de leads na etapa, então um funil entupido no
 * "primeiro contato" fica visível antes de qualquer número ser lido.
 *
 * Sem dependência de gráfico: são sete divs em um flex, e a proporção é o
 * próprio `flex-grow`. Recebe contagens prontas (`getContagemPorEtapa`) em
 * vez da carteira inteira — um termômetro não precisa das linhas.
 */
export function TermometroFunil({ contagens }: { contagens: Record<EtapaFunil, number> }) {
  const porEtapa = ETAPAS_FUNIL.map((etapa) => ({
    etapa,
    total: contagens[etapa] ?? 0,
  }));
  const total = porEtapa.reduce((soma, { total: quantos }) => soma + quantos, 0);

  return (
    <section className="cartao p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-titulo text-lg">Seu funil agora</h2>
        <Link
          href="/corretor/funil"
          className="text-fluid-sm text-acento-suave underline-offset-4 hover:underline"
        >
          Abrir quadro →
        </Link>
      </div>
      <p className="text-fluid-sm text-apoio mt-1">
        {total === 1 ? "1 contato na carteira" : `${total} contatos na carteira`}, da chegada ao
        fechamento.
      </p>

      {/*
        O desenho de funil substitui a barra horizontal + legenda (04/09/2026,
        pedido com referência visual). A barra proporcional era honesta como
        gráfico e ilegível como funil: com 46 em "contatei" e 1 em "visita", a
        faixa de visita virava um fio. Ver `FunilVisual`.
      */}
      <div className="mt-5">
        <FunilVisual contagens={contagens} />
      </div>
    </section>
  );
}
