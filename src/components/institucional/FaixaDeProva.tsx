import { NumeroQueConta } from "@/components/motion/NumeroQueConta";
import { Reveal } from "@/components/motion/Reveal";

const COLUNAS = {
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
} as const;

/**
 * A faixa de números verificáveis — a mesma na home e na página Sobre.
 *
 * Numa imobiliária a moeda é confiança, e a régua desta casa é: número que
 * ENCOLHE quando a realidade encolhe. Tudo o que entra aqui sai do banco na
 * requisição da página (estoque, bairros, cidades, corretores com CRECI).
 * "+500 clientes felizes" é o oposto disso e não entra.
 *
 * `dt` vem antes de `dd` no DOM, como o HTML pede; o `flex-col-reverse` põe
 * o número em cima do rótulo só na tela.
 */
export function FaixaDeProva({
  numeros,
  colunas = 4,
}: {
  numeros: { valor: number; rotulo: string }[];
  colunas?: keyof typeof COLUNAS;
}) {
  return (
    <Reveal>
      <dl
        className={`border-linha/60 bg-linha/60 grid w-full grid-cols-2 gap-px overflow-hidden rounded-2xl border ${COLUNAS[colunas]}`}
      >
        {numeros.map((n) => (
          <div key={n.rotulo} className="bg-fundo flex flex-col-reverse px-5 py-7 text-center sm:py-8">
            <dt className="text-fluid-xs text-apoio mt-1.5 text-pretty">{n.rotulo}</dt>
            <dd className="font-display text-titulo text-4xl font-bold tabular-nums sm:text-5xl">
              <NumeroQueConta valor={n.valor} />
            </dd>
          </div>
        ))}
      </dl>
    </Reveal>
  );
}
