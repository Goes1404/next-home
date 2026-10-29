import Link from "next/link";
import { hrefDaLista, pontosDaTendencia, type FiltroDeIndicador, type PainelDeNumeros as Painel } from "@/lib/plataforma/painelDeNumeros";

/**
 * O painel de números da Astro no topo de `/plataforma` (29/10/2026): denso,
 * no espírito dos painéis de ERP — rótulo pequeno, número grande, um detalhe.
 * Todo número é um link para a lista já filtrada (`?ver=`) ou para a tela do
 * assunto (pedidos, suporte). Só contagem e soma: nenhum dado de cliente.
 *
 * Duas colunas no celular, quatro no computador. A tendência é SVG à mão
 * (sem biblioteca de gráfico).
 *
 * Classes por extenso: montada em tempo de execução, a classe não existiria.
 */

const REAL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const NUMERO = new Intl.NumberFormat("pt-BR");

type Tom = "neutro" | "alerta" | "perigo";

const COR_DO_VALOR: Record<Tom, string> = {
  neutro: "text-titulo",
  alerta: "text-alerta",
  perigo: "text-perigo",
};

function Indicador({
  rotulo,
  valor,
  detalhe,
  href,
  tom = "neutro",
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  href: string;
  tom?: Tom;
}) {
  return (
    <Link
      href={href}
      className="cartao hover:border-acento-linha group flex min-h-11 min-w-0 flex-col justify-between gap-1 p-3 transition-colors sm:p-4"
    >
      <span className="text-fluid-xs text-apoio flex items-start justify-between gap-2 leading-tight">
        <span className="min-w-0">{rotulo}</span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-tenue group-hover:text-acento h-3.5 w-3.5 shrink-0 transition-colors"
        >
          <path d="M7 17L17 7M9 7h8v8" />
        </svg>
      </span>
      <span className={`text-fluid-xl font-display tabular-nums leading-none ${COR_DO_VALOR[tom]}`}>{valor}</span>
      {detalhe && <span className="text-fluid-xs text-apoio truncate">{detalhe}</span>}
    </Link>
  );
}

const lista = (ver: FiltroDeIndicador) => hrefDaLista({ ver });

function Tendencia({ meses }: { meses: Painel["novasPorMes"] }) {
  const largura = 160;
  const altura = 40;
  const pontos = pontosDaTendencia(
    meses.map((m) => m.total),
    largura,
    altura,
  );
  const ultimo = pontos[pontos.length - 1];
  const total = meses.reduce((s, m) => s + m.total, 0);
  const atual = meses[meses.length - 1]?.total ?? 0;
  const resumo = meses.map((m) => `${m.rotulo}: ${m.total}`).join(", ");
  return (
    <Link
      href="/plataforma#contas"
      className="cartao hover:border-acento-linha col-span-2 flex min-w-0 flex-col gap-2 p-3 transition-colors sm:p-4"
    >
      <span className="text-fluid-xs text-apoio flex items-baseline justify-between gap-2">
        <span>Contas novas por mês</span>
        <span className="tabular-nums">{NUMERO.format(total)} em 6 meses</span>
      </span>
      <span className="flex items-end gap-3">
        <span className="text-fluid-xl font-display text-titulo tabular-nums leading-none">{NUMERO.format(atual)}</span>
        <span className="text-fluid-xs text-apoio">neste mês</span>
      </span>
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Contas novas nos últimos 6 meses: ${resumo}`}
        className="text-acento h-10 w-full"
      >
        <line x1="0" x2={largura} y1={altura - 3} y2={altura - 3} stroke="currentColor" strokeOpacity="0.15" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <polyline
          points={pontos.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {ultimo && <circle cx={ultimo.x} cy={ultimo.y} r="2.5" fill="currentColor" />}
      </svg>
      <span className="text-fluid-xs text-tenue grid grid-cols-6 text-center tabular-nums" aria-hidden>
        {meses.map((m) => (
          <span key={m.mes}>
            {m.rotulo} <span className="text-apoio">{m.total}</span>
          </span>
        ))}
      </span>
    </Link>
  );
}

export function PainelDeNumeros({
  painel,
  pedidosNovos,
  chamadosAbertos,
}: {
  painel: Painel;
  pedidosNovos: number | null;
  chamadosAbertos: number | null;
}) {
  const naoMedido = "—";
  return (
    <section aria-labelledby="titulo-numeros" className="flex flex-col gap-2">
      <h2 id="titulo-numeros" className="text-fluid-xs text-apoio tracking-[0.16em] uppercase">
        Números da Astro
      </h2>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Indicador
          rotulo="Receita mensal recorrente"
          valor={REAL.format(painel.receitaMensal)}
          detalhe={`${painel.pagantes} ${painel.pagantes === 1 ? "conta pagante" : "contas pagantes"}`}
          href={lista("pagantes")}
        />
        <Indicador rotulo="Contas ativas" valor={NUMERO.format(painel.ativas)} href={lista("ativas")} />
        <Indicador
          rotulo="Suspensas"
          valor={NUMERO.format(painel.suspensas)}
          tom={painel.suspensas > 0 ? "alerta" : "neutro"}
          href={lista("suspensas")}
        />
        <Indicador rotulo="Canceladas" valor={NUMERO.format(painel.canceladas)} href={lista("canceladas")} />
        <Indicador
          rotulo="Mensalidades em aberto"
          valor={NUMERO.format(painel.emAberto.contas)}
          detalhe={painel.emAberto.contas > 0 ? `${REAL.format(painel.emAberto.valor)} vencidos` : "tudo em dia"}
          tom={painel.emAberto.contas > 0 ? "perigo" : "neutro"}
          href={lista("em-aberto")}
        />
        <Indicador
          rotulo="Sem uso há 7 dias"
          valor={painel.semUso === null ? naoMedido : NUMERO.format(painel.semUso)}
          detalhe={painel.semUso === null ? "não medido agora" : "sem lead e sem login"}
          tom={painel.semUso ? "alerta" : "neutro"}
          href={lista("sem-uso")}
        />
        <Indicador
          rotulo="Pedidos de contratação novos"
          valor={pedidosNovos === null ? naoMedido : NUMERO.format(pedidosNovos)}
          tom={pedidosNovos ? "alerta" : "neutro"}
          href="/plataforma/pedidos?status=novo"
        />
        <Indicador
          rotulo="Chamados de suporte abertos"
          valor={chamadosAbertos === null ? naoMedido : NUMERO.format(chamadosAbertos)}
          tom={chamadosAbertos ? "alerta" : "neutro"}
          href="/plataforma/suporte"
        />
        <Link
          href={lista("ia")}
          className="cartao hover:border-acento-linha col-span-2 flex min-w-0 flex-col justify-between gap-1 p-3 transition-colors sm:p-4"
        >
          <span className="text-fluid-xs text-apoio">IA neste mês (todas as contas)</span>
          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-fluid-xl font-display text-titulo tabular-nums leading-none">{NUMERO.format(painel.ia.respostas)}</span>
            <span className="text-fluid-xs text-apoio">respostas</span>
            <span className="text-fluid-xl font-display text-titulo tabular-nums leading-none">
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(painel.ia.custoBrl)}
            </span>
            <span className="text-fluid-xs text-apoio">custo estimado</span>
          </span>
          <span className={`text-fluid-xs ${painel.ia.contasEmAlerta > 0 ? "text-alerta" : "text-apoio"}`}>
            {painel.ia.contasEmAlerta === 0
              ? "Nenhuma conta perto do limite ou acima de 30% da mensalidade"
              : `${painel.ia.contasEmAlerta} ${painel.ia.contasEmAlerta === 1 ? "conta" : "contas"} perto do limite ou acima de 30% da mensalidade`}
          </span>
        </Link>
        <Tendencia meses={painel.novasPorMes} />
      </div>
    </section>
  );
}
