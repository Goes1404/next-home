import Link from "next/link";
import { BARRA_ETAPA } from "./etapas";
import { ETAPAS_FUNIL, ETAPA_LABEL, type EtapaFunil } from "@/lib/types";

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
    <section className="border-linha bg-superficie shadow-painel rounded-2xl border p-5 sm:p-6">
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

      <div className="border-linha mt-5 flex h-3 gap-0.5 overflow-hidden rounded-full border">
        {porEtapa.map(({ etapa, total: quantos }) =>
          quantos === 0 ? null : (
            <div
              key={etapa}
              style={{ flexGrow: quantos }}
              // O `title` é o que dá o nome da etapa a quem usa mouse; o
              // texto da legenda abaixo serve leitor de tela e toque.
              title={`${ETAPA_LABEL[etapa]}: ${quantos}`}
              className={`min-w-1.5 ${BARRA_ETAPA[etapa]}`}
            />
          ),
        )}
      </div>

      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-4">
        {porEtapa.map(({ etapa, total: quantos }) => (
          <li key={etapa} className="flex items-center gap-2">
            <span
              aria-hidden
              className={`h-2 w-2 shrink-0 rounded-full ${BARRA_ETAPA[etapa]} ${
                quantos === 0 ? "opacity-35" : ""
              }`}
            />
            <span className={`text-fluid-xs truncate ${quantos === 0 ? "text-tenue" : "text-corpo"}`}>
              {ETAPA_LABEL[etapa]}
            </span>
            <span
              className={`text-fluid-xs ml-auto tabular-nums ${
                quantos === 0 ? "text-tenue" : "text-titulo font-medium"
              }`}
            >
              {quantos}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
