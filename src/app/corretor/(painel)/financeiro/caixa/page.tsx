import type { Metadata } from "next";
import Link from "next/link";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { getVendas } from "@/lib/financeiro/dados";
import { getCaixa } from "@/lib/financeiro/caixaDados";
import { fluxoDeCaixa, movimentosDo, proximosPendentes, type Movimento } from "@/lib/financeiro/caixa";
import { formatarReais, hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { BotaoAcao } from "../../_componentes/BotaoAcao";
import { CabecalhoDeTela } from "../../_componentes/CabecalhoDeTela";
import { marcarComissaoRecebida, marcarRepassePago } from "../acoes";
import { excluirLancamento, marcarLancamentoPago } from "./acoes";
import { FormularioSaldo, NovoLancamento, PrevisaoDaComissao } from "./ControlesDoCaixa";

export const metadata: Metadata = { title: "Caixa" };

const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Numero({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string; detalhe?: string; tom?: "perigo" }) {
  return (
    <div className="cartao flex flex-col-reverse gap-1 p-4">
      <dt className="text-fluid-xs text-tenue">
        {rotulo}
        {detalhe ? <span className="block">{detalhe}</span> : null}
      </dt>
      <dd className={`text-fluid-lg font-bold break-words tabular-nums ${tom === "perigo" ? "text-perigo" : "text-titulo"}`}>{valor}</dd>
    </div>
  );
}

/** O botão que liquida o movimento, conforme de onde ele vem. */
function Liquidar({ m, hoje }: { m: Movimento; hoje: string }) {
  if (m.origem === "lancamento" && m.lancamentoId) {
    return (
      <BotaoAcao acao={marcarLancamentoPago.bind(null, m.lancamentoId, hoje)} rotulopendente="Marcando…" variante="secundario">
        {m.tipo === "entrada" ? "Recebi" : "Paguei"}
      </BotaoAcao>
    );
  }
  if (m.origem === "comissao" && m.vendaId) {
    return (
      <BotaoAcao acao={marcarComissaoRecebida.bind(null, m.vendaId, hoje)} rotulopendente="Marcando…" variante="secundario">
        Recebi
      </BotaoAcao>
    );
  }
  // Repasse só se paga depois que a comissão entrou (o extrato separa o
  // "liberado" do "aguardando"); antes disso o botão não aparece.
  if (m.origem === "repasse" && m.vendaId && m.corretorId && m.vencimento && m.vencimento <= hoje) {
    return (
      <BotaoAcao acao={marcarRepassePago.bind(null, m.vendaId, m.corretorId, hoje)} rotulopendente="Marcando…" variante="secundario">
        Paguei
      </BotaoAcao>
    );
  }
  return null;
}

function LinhaDoMovimento({ m, hoje, atrasado }: { m: Movimento; hoje: string; atrasado?: boolean }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-3">
      <span className="min-w-0">
        <span className="text-fluid-sm text-titulo block font-medium break-words">
          {m.vendaId ? (
            <Link href={`/corretor/financeiro/${m.vendaId}`} className="hover:underline">
              {m.descricao}
            </Link>
          ) : (
            m.descricao
          )}
        </span>
        <span className={`text-fluid-xs ${atrasado ? "text-perigo" : "text-tenue"}`}>
          {m.vencimento ? `${atrasado ? "venceu" : "vence"} em ${dataCurta(m.vencimento)}` : "sem data"}
          {m.detalhe ? ` · ${m.detalhe}` : ""}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <span className={`text-fluid-base font-bold tabular-nums ${m.tipo === "entrada" ? "text-ok" : "text-titulo"}`}>
          {m.tipo === "entrada" ? "+" : "−"} {formatarReais(m.valor)}
        </span>
        <Liquidar m={m} hoje={hoje} />
        {m.origem === "lancamento" && m.lancamentoId && (
          <BotaoAcao
            acao={excluirLancamento.bind(null, m.lancamentoId, "este")}
            confirmar="Excluir este lançamento?"
            rotulopendente="Excluindo…"
            variante="perigo"
            aria-label={`Excluir ${m.descricao}`}
          >
            Excluir
          </BotaoAcao>
        )}
      </span>
    </li>
  );
}

/**
 * O caixa da imobiliária (0166), só para o gestor.
 *
 * Saldo de hoje, o que vence nos próximos 30 dias, o que já venceu e o fluxo
 * das próximas 13 semanas. Comissão e repasse vêm das vendas; o resto são os
 * lançamentos. Entrada atrasada fica fora da projeção e comissão sem data
 * também: o erro caro é o caixa parecer melhor do que está.
 */
export default async function CaixaPage() {
  await exigirGestorNaPagina();
  const hoje = hojeEmSaoPaulo();

  const cabecalho = (
    <CabecalhoDeTela
      secao="Financeiro"
      titulo="Caixa"
      descricao="O dinheiro da imobiliária: saldo de hoje, o que entra e sai nos próximos meses e o que já venceu."
    />
  );

  const [caixa, leituraVendas] = await Promise.all([getCaixa(hoje), getVendas()]);
  if (!caixa.ok) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <p className="cartao text-fluid-sm text-corpo p-4">
          {caixa.motivo === "sem_tabela"
            ? "O caixa ainda não foi ativado no banco. Assim que for, esta tela passa a funcionar."
            : "Não foi possível carregar o caixa agora. Recarregue a página."}
        </p>
      </div>
    );
  }

  const vendas = leituraVendas.ok ? leituraVendas.vendas : [];
  const movimentos = movimentosDo(caixa.lancamentos, vendas);
  const fluxo = fluxoDeCaixa({ movimentos, saldo: caixa.saldo, hoje });
  const proximos = proximosPendentes(movimentos, hoje, 30);
  const atrasados = [...fluxo.saidasAtrasadas, ...fluxo.entradasAtrasadas].sort((a, b) =>
    (a.vencimento ?? "") < (b.vencimento ?? "") ? -1 : 1,
  );
  const comissoesSemData = fluxo.semData.filter((m) => m.origem === "comissao");
  const totalSemData = comissoesSemData.reduce((s, m) => s + m.valor, 0);
  const temSaldo = fluxo.saldoHoje !== null;

  return (
    <div className="space-y-4">
      {cabecalho}

      <section className="cartao space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-fluid-base text-titulo font-medium">Saldo hoje</h2>
          {temSaldo && (
            <p className={`text-fluid-xl font-bold tabular-nums ${fluxo.saldoHoje! < 0 ? "text-perigo" : "text-titulo"}`}>
              {formatarReais(fluxo.saldoHoje!)}
            </p>
          )}
        </div>
        {temSaldo ? (
          <p className="text-fluid-xs text-tenue">
            Informado em {dataCurta(caixa.saldo!.informadoEm)}, mais o que entrou e saiu depois.
          </p>
        ) : (
          <p className="text-fluid-sm text-corpo">
            Informe quanto há na conta hoje. Sem esse número, a tela mostra o que entra e sai, mas não o saldo.
          </p>
        )}
        <FormularioSaldo temSaldo={temSaldo} />
      </section>

      {fluxo.ficaNegativoEm && (
        <p role="alert" className="border-perigo-linha bg-perigo-lavado text-fluid-sm text-titulo rounded-xl border p-4">
          {fluxo.ficaNegativoEm === hoje
            ? "O caixa está negativo hoje."
            : `Pelo que está lançado, o caixa fica negativo em ${dataCurta(fluxo.ficaNegativoEm)}.`}
          {fluxo.menorSaldo !== null ? ` O ponto mais baixo é ${formatarReais(fluxo.menorSaldo)}.` : ""}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="A receber em 30 dias" valor={formatarReais(fluxo.aReceber30)} />
        <Numero rotulo="A pagar em 30 dias" valor={formatarReais(fluxo.aPagar30)} detalhe="inclui o que já venceu" />
        <Numero rotulo="Entrou este mês" valor={formatarReais(fluxo.entrouNoMes)} />
        <Numero rotulo="Saiu este mês" valor={formatarReais(fluxo.saiuNoMes)} />
      </dl>

      <NovoLancamento hoje={hoje} />

      {atrasados.length > 0 && (
        <section className="cartao space-y-1 p-4 sm:p-5">
          <h2 className="text-fluid-base text-titulo font-medium">Vencidos</h2>
          <p className="text-fluid-xs text-tenue">
            O que tinha data e não foi pago nem recebido. Entrada atrasada fica fora da projeção até entrar.
          </p>
          <ul className="divide-linha divide-y">
            {atrasados.map((m) => (
              <LinhaDoMovimento key={m.chave} m={m} hoje={hoje} atrasado />
            ))}
          </ul>
        </section>
      )}

      <section className="cartao space-y-1 p-4 sm:p-5">
        <h2 className="text-fluid-base text-titulo font-medium">Próximos 30 dias</h2>
        {proximos.length === 0 ? (
          <p className="text-fluid-sm text-corpo py-2">Nada vence nos próximos 30 dias.</p>
        ) : (
          <ul className="divide-linha divide-y">
            {proximos.map((m) => (
              <LinhaDoMovimento key={m.chave} m={m} hoje={hoje} />
            ))}
          </ul>
        )}
      </section>

      <section className="cartao space-y-2 p-4 sm:p-5">
        <h2 className="text-fluid-base text-titulo font-medium">Fluxo das próximas 13 semanas</h2>
        <div className="overflow-x-auto">
          <table className="text-fluid-sm w-full min-w-[28rem]">
            <thead>
              <tr className="text-fluid-xs text-tenue text-left">
                <th className="py-2 pr-2 font-normal">Semana</th>
                <th className="py-2 pr-2 text-right font-normal">Entra</th>
                <th className="py-2 pr-2 text-right font-normal">Sai</th>
                <th className="py-2 text-right font-normal">Saldo no fim</th>
              </tr>
            </thead>
            <tbody className="divide-linha divide-y">
              {fluxo.semanas.map((s) => (
                <tr key={s.inicio}>
                  <td className="text-corpo py-2 pr-2 whitespace-nowrap">
                    {dataCurta(s.inicio)} a {dataCurta(s.fim)}
                  </td>
                  <td className="text-ok py-2 pr-2 text-right tabular-nums">{s.entradas ? formatarReais(s.entradas) : "—"}</td>
                  <td className="text-titulo py-2 pr-2 text-right tabular-nums">{s.saidas ? formatarReais(s.saidas) : "—"}</td>
                  <td
                    className={`py-2 text-right font-medium tabular-nums ${
                      s.saldoFinal !== null && s.saldoFinal < 0 ? "text-perigo" : "text-titulo"
                    }`}
                  >
                    {s.saldoFinal === null ? "—" : formatarReais(s.saldoFinal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!temSaldo && <p className="text-fluid-xs text-tenue">O saldo de cada semana aparece depois de informar o saldo de hoje.</p>}
      </section>

      {comissoesSemData.length > 0 && (
        <section className="cartao space-y-1 p-4 sm:p-5">
          <h2 className="text-fluid-base text-titulo font-medium">Comissões sem data prevista</h2>
          <p className="text-fluid-xs text-tenue">
            {formatarReais(totalSemData)} que não entram no fluxo até ter data. O repasse de cada uma passa a valer na mesma data.
          </p>
          <ul className="divide-linha divide-y">
            {comissoesSemData.map((m) => (
              <li key={m.chave} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="min-w-0">
                  <Link href={`/corretor/financeiro/${m.vendaId}`} className="text-fluid-sm text-titulo block font-medium break-words hover:underline">
                    {m.descricao}
                  </Link>
                  <span className="text-fluid-xs text-tenue">
                    {formatarReais(m.valor)}
                    {m.detalhe ? ` · ${m.detalhe}` : ""}
                  </span>
                </span>
                <PrevisaoDaComissao vendaId={m.vendaId!} atual={null} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!leituraVendas.ok && (
        <p className="text-fluid-xs text-tenue">As vendas não puderam ser lidas agora; comissões e repasses não estão nesta conta.</p>
      )}
    </div>
  );
}
