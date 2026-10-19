import type { Metadata } from "next";
import Link from "next/link";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { getVendas } from "@/lib/financeiro/dados";
import { getLancamentosPagos } from "@/lib/financeiro/caixaDados";
import { movimentosDo, somarMeses } from "@/lib/financeiro/caixa";
import { lerMes, mesesAte, resultadoDoMes, somarResultados, type ResultadoDoMes } from "@/lib/financeiro/resultado";
import { nomeDoMes } from "@/lib/financeiro/periodo";
import { formatarReais, hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { CabecalhoDeTela } from "../../_componentes/CabecalhoDeTela";

export const metadata: Metadata = { title: "Resultado do mês" };

const ROTA = "/corretor/financeiro/resultado";
const rotuloDoMes = (mes: string) => `${nomeDoMes(`${mes}-01`)} ${mes.slice(0, 4)}`;
const curtoDoMes = (mes: string) => `${nomeDoMes(`${mes}-01`).slice(0, 3)}/${mes.slice(2, 4)}`;
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

function Linha({
  rotulo,
  valores,
  sinal,
  forte,
  recuo,
}: {
  rotulo: string;
  valores: number[];
  sinal?: "+" | "−";
  forte?: boolean;
  recuo?: boolean;
}) {
  return (
    <tr className={forte ? "border-linha-forte border-t" : undefined}>
      <th scope="row" className={`py-2 pr-3 text-left font-normal ${recuo ? "text-apoio pl-4" : forte ? "text-titulo font-semibold" : "text-corpo"}`}>
        {sinal ? <span className="text-tenue mr-1">{sinal}</span> : null}
        {rotulo}
      </th>
      {valores.map((v, i) => (
        <td
          key={i}
          className={`py-2 pl-2 text-right whitespace-nowrap tabular-nums ${
            forte ? (v < 0 ? "text-perigo font-semibold" : "text-titulo font-semibold") : recuo ? "text-apoio" : "text-corpo"
          }`}
        >
          {v === 0 && !forte ? "—" : formatarReais(v)}
        </td>
      ))}
    </tr>
  );
}

/** A DRE de uma ou mais colunas (mês, mês anterior, acumulado do ano). */
function Demonstrativo({ colunas, titulos }: { colunas: ResultadoDoMes[]; titulos: string[] }) {
  const categorias = new Map<string, string>();
  for (const c of colunas) for (const d of c.despesas) categorias.set(d.categoria, d.rotulo);
  const despesaDe = (c: ResultadoDoMes, cat: string) => c.despesas.find((d) => d.categoria === cat)?.valor ?? 0;
  const v = (f: (c: ResultadoDoMes) => number) => colunas.map(f);

  return (
    <div className="overflow-x-auto">
      <table className="text-fluid-sm w-full min-w-[30rem]">
        <thead>
          <tr className="text-fluid-xs text-tenue">
            <th className="py-2 pr-3 text-left font-normal">
              <span className="sr-only">Linha</span>
            </th>
            {titulos.map((t) => (
              <th key={t} className="py-2 pl-2 text-right font-normal whitespace-nowrap">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-linha divide-y">
          <Linha rotulo="Receita de corretagem" valores={v((c) => c.receitaCorretagem)} forte />
          <Linha rotulo="Comissões das construtoras" valores={v((c) => c.comissoes)} recuo />
          <Linha rotulo="Comissão avulsa" valores={v((c) => c.comissaoAvulsa)} recuo />
          <Linha rotulo="Repasses aos corretores" valores={v((c) => c.repasses)} sinal="−" />
          <Linha rotulo="Margem de corretagem" valores={v((c) => c.margemCorretagem)} forte />
          <Linha rotulo="Impostos e taxas" valores={v((c) => c.impostos)} sinal="−" />
          <Linha rotulo="Outras receitas" valores={v((c) => c.outrasReceitas)} sinal="+" />
          <Linha rotulo="Despesas da operação" valores={v((c) => c.totalDespesas)} sinal="−" />
          {[...categorias.entries()].map(([cat, rotulo]) => (
            <Linha key={cat} rotulo={rotulo} valores={colunas.map((c) => despesaDe(c, cat))} recuo />
          ))}
          <Linha rotulo="Resultado" valores={v((c) => c.resultado)} forte />
          <tr>
            <th scope="row" className="text-apoio py-2 pr-3 text-left font-normal">
              Margem sobre a receita
            </th>
            {colunas.map((c, i) => (
              <td key={i} className="text-apoio py-2 pl-2 text-right tabular-nums">
                {pct(c.margem)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Resultado do mês (DRE) da imobiliária, só para o gestor. Regime de caixa:
 * o que de fato entrou e saiu, a partir dos mesmos movimentos da tela Caixa.
 */
export default async function ResultadoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirGestorNaPagina();
  const hoje = hojeEmSaoPaulo();
  const mes = lerMes((await searchParams).mes, hoje);
  const mesAtual = hoje.slice(0, 7);

  const cabecalho = (
    <CabecalhoDeTela
      secao="Financeiro"
      titulo="Resultado do mês"
      descricao="Quanto entrou, quanto saiu e quanto sobrou, mês a mês. Conta o que foi de fato pago e recebido."
    />
  );

  // Doze meses até o escolhido, e o ano dele inteiro para o acumulado.
  const meses = mesesAte(mes, 12);
  const desde = `${meses[0] < `${mes.slice(0, 4)}-01` ? meses[0] : `${mes.slice(0, 4)}-01`}-01`;
  const ate = `${somarMeses(`${mes}-01`, 1).slice(0, 7)}-01`;

  const [leitura, leituraVendas] = await Promise.all([getLancamentosPagos(desde, ate), getVendas()]);
  if (!leitura.ok) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <p className="cartao text-fluid-sm text-corpo p-4">
          {leitura.motivo === "sem_tabela"
            ? "O caixa ainda não foi ativado no banco. Assim que for, esta tela passa a funcionar."
            : "Não foi possível carregar o resultado agora. Recarregue a página."}
        </p>
      </div>
    );
  }

  const movimentos = movimentosDo(
    leitura.lancamentos.filter((l) => l.pagoEm !== null && l.pagoEm < ate),
    leituraVendas.ok ? leituraVendas.vendas : [],
  );
  const doMes = resultadoDoMes(movimentos, mes);
  const anterior = resultadoDoMes(movimentos, somarMeses(`${mes}-01`, -1).slice(0, 7));
  const mesesDoAno = mesesAte(mes, Number(mes.slice(5, 7)));
  const acumulado = somarResultados(
    mesesDoAno.map((m) => resultadoDoMes(movimentos, m)),
    mes.slice(0, 4),
  );
  const serie = meses.map((m) => resultadoDoMes(movimentos, m));
  const mesAnteriorLink = somarMeses(`${mes}-01`, -1).slice(0, 7);
  const proximoLink = mes < mesAtual ? somarMeses(`${mes}-01`, 1).slice(0, 7) : null;
  const navegar = "text-fluid-sm border-linha text-corpo hover:border-acento-linha inline-flex min-h-11 items-center rounded-xl border px-4";

  return (
    <div className="space-y-4">
      {cabecalho}

      <nav aria-label="Escolher o mês" className="flex flex-wrap items-center gap-2">
        <Link href={`${ROTA}?mes=${mesAnteriorLink}`} className={navegar}>
          ← {curtoDoMes(mesAnteriorLink)}
        </Link>
        <p className="text-fluid-base text-titulo px-2 font-medium">{rotuloDoMes(mes)}</p>
        {proximoLink && (
          <Link href={`${ROTA}?mes=${proximoLink}`} className={navegar}>
            {curtoDoMes(proximoLink)} →
          </Link>
        )}
        {mes !== mesAtual && (
          <Link href={ROTA} className={navegar}>
            Mês atual
          </Link>
        )}
      </nav>

      <section className="cartao space-y-1 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-fluid-base text-titulo font-medium">Resultado de {rotuloDoMes(mes)}</h2>
          <p className={`text-fluid-xl font-bold tabular-nums ${doMes.resultado < 0 ? "text-perigo" : "text-titulo"}`}>
            {formatarReais(doMes.resultado)}
          </p>
        </div>
        <p className="text-fluid-xs text-tenue">
          {!doMes.temMovimento
            ? "Nada foi pago nem recebido neste mês."
            : mes === mesAtual
              ? "O mês ainda está correndo: o número muda conforme contas são pagas e comissões entram."
              : `No mês anterior: ${formatarReais(anterior.resultado)}.`}
        </p>
      </section>

      <section className="cartao space-y-2 p-4 sm:p-5">
        <h2 className="text-fluid-base text-titulo font-medium">Demonstrativo</h2>
        <Demonstrativo
          colunas={[doMes, anterior, acumulado]}
          titulos={[curtoDoMes(mes), curtoDoMes(anterior.mes), `Ano ${mes.slice(0, 4)}`]}
        />
      </section>

      <section className="cartao space-y-2 p-4 sm:p-5">
        <h2 className="text-fluid-base text-titulo font-medium">Últimos 12 meses</h2>
        <div className="overflow-x-auto">
          <table className="text-fluid-sm w-full min-w-[30rem]">
            <thead>
              <tr className="text-fluid-xs text-tenue text-left">
                <th className="py-2 pr-2 font-normal">Mês</th>
                <th className="py-2 pr-2 text-right font-normal">Receita</th>
                <th className="py-2 pr-2 text-right font-normal">Saiu</th>
                <th className="py-2 text-right font-normal">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-linha divide-y">
              {[...serie].reverse().map((r) => {
                const receita = r.receitaCorretagem + r.outrasReceitas;
                const saiu = r.repasses + r.impostos + r.totalDespesas;
                return (
                  <tr key={r.mes} className={r.mes === mes ? "bg-acento-lavado" : undefined}>
                    <td className="py-2 pr-2 whitespace-nowrap">
                      <Link href={`${ROTA}?mes=${r.mes}`} className="text-corpo link-acao">
                        {curtoDoMes(r.mes)}
                      </Link>
                    </td>
                    <td className="text-corpo py-2 pr-2 text-right tabular-nums">{receita ? formatarReais(receita) : "—"}</td>
                    <td className="text-corpo py-2 pr-2 text-right tabular-nums">{saiu ? formatarReais(saiu) : "—"}</td>
                    <td
                      className={`py-2 text-right font-medium tabular-nums ${r.resultado < 0 ? "text-perigo" : "text-titulo"}`}
                    >
                      {r.temMovimento ? formatarReais(r.resultado) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-fluid-xs text-tenue">
        Comissões e repasses entram quando são marcados como recebidos e pagos nas Vendas; o resto vem das contas do{" "}
        <Link href="/corretor/financeiro/caixa" className="hover:text-titulo underline">
          Caixa
        </Link>
        . Gasto com anúncio só entra se for lançado lá como conta paga.
        {!leituraVendas.ok ? " As vendas não puderam ser lidas agora; comissões e repasses estão fora desta conta." : ""}
      </p>
    </div>
  );
}
