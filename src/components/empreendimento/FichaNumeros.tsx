import { Camada } from "@/components/motion/Camada";
import { ContadorNumero } from "@/components/motion/ContadorNumero";
import { Reveal } from "@/components/motion/Reveal";
import { entregaPrevista } from "@/lib/format";
import type { Empreendimento } from "@/lib/types";

type Numero = { rotulo: string; valor: number; sufixo?: string } | { rotulo: string; texto: string };

/**
 * A ficha técnica como faixa de números grandes — o dado que antes vivia
 * espremido num grid de legenda vira o segundo impacto da página. Contagem
 * animada nos numéricos; entrega e construtora entram como texto.
 */
function numerosDe(e: Empreendimento): Numero[] {
  const nums: Numero[] = [];

  const dorms = e.tipologias.map((t) => t.dormitorios).filter((n) => n > 0);
  if (dorms.length > 0) {
    const min = Math.min(...dorms);
    const max = Math.max(...dorms);
    nums.push({
      rotulo: min === max ? "Dormitórios" : `Dormitórios (${min} a ${max})`,
      valor: max,
    });
  }

  const areas = e.tipologias
    .map((t) => t.areaPrivativa)
    .filter((n): n is number => n !== null && n > 0);
  if (areas.length > 0) nums.push({ rotulo: "Metragem até", valor: Math.max(...areas), sufixo: " m²" });

  const vagas = e.tipologias.map((t) => t.vagas).filter((n) => n > 0);
  if (vagas.length > 0) nums.push({ rotulo: "Vagas", valor: Math.max(...vagas) });

  if (e.totalUnidades) nums.push({ rotulo: "Unidades", valor: e.totalUnidades });
  if (e.totalTorres) nums.push({ rotulo: e.totalTorres === 1 ? "Torre" : "Torres", valor: e.totalTorres });

  const entrega = entregaPrevista(e.entregaPrevista);
  if (entrega) nums.push({ rotulo: "Entrega", texto: entrega });

  return nums.slice(0, 5);
}

export function FichaNumeros({ empreendimento: e }: { empreendimento: Empreendimento }) {
  const numeros = numerosDe(e);
  if (numeros.length < 2) return null;

  return (
    <section className="border-y border-linha/10 bg-superficie/40">
      <Reveal
        from="nenhuma"
        stagger={0.08}
        className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-14 sm:px-8 sm:py-20 md:grid-cols-3 lg:flex lg:items-end lg:justify-between"
      >
        {/* A camada vai POR DENTRO da célula: o `Reveal stagger` já é dono da
            opacidade e do transform de entrada dos filhos diretos, e somar
            camada no mesmo nó seria dois donos da mesma matriz. */}
        {numeros.map((n, i) => (
          <div key={n.rotulo}>
            <Camada velocidade={0.05 + (i % 3) * 0.04}>
              <p className="font-display text-fluid-3xl leading-none text-titulo">
                {"texto" in n ? (
                  n.texto
                ) : (
                  <ContadorNumero valor={n.valor} sufixo={n.sufixo ?? ""} />
                )}
              </p>
              <p className="text-fluid-xs mt-3 tracking-[0.18em] text-legenda uppercase">
                {n.rotulo}
              </p>
            </Camada>
          </div>
        ))}
      </Reveal>
    </section>
  );
}
