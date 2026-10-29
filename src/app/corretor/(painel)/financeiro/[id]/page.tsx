import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCorretorLogado, getEmpreendimentosParaFiltro, getEquipeAtiva } from "@/lib/corretorSessao";
import { getVenda } from "@/lib/financeiro/dados";
import { formatarPercentual, formatarReais, hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { ROTULO_PAGADOR, repasseDevido, repasseLiberado, situacaoDaParcela, somaDas, type SituacaoDaParcela } from "@/lib/financeiro/parcelas";
import type { VendaNaTela } from "@/lib/financeiro/dados";
import { BotaoAcao } from "../../_componentes/BotaoAcao";
import { marcarParcelaRecebida, marcarRepassePago } from "../acoes";
import { CabecalhoDeTela } from "../../_componentes/CabecalhoDeTela";
import { FormularioVenda } from "../FormularioVenda";
import { DistratoDaVenda } from "./DistratoDaVenda";

export const metadata: Metadata = { title: "Venda" };

const data = (iso: string) => iso.split("-").reverse().join("/");

const ROTULO_SITUACAO: Record<SituacaoDaParcela, string> = {
  recebida: "recebida",
  cancelada: "cancelada no distrato",
  atrasada: "atrasada",
  prevista: "prevista",
  sem_data: "sem data prevista",
};

/** As parcelas da comissão (0232), para quem vê a venda. Só o gestor marca. */
function ParcelasDaVenda({ venda, gestor }: { venda: VendaNaTela; gestor: boolean }) {
  const hoje = hojeEmSaoPaulo();
  if (venda.parcelas.length === 0) return null;
  return (
    <ul className="divide-linha divide-y">
      {venda.parcelas.map((p) => {
        const situacao = situacaoDaParcela(p, hoje);
        const detalhe =
          situacao === "recebida"
            ? `recebida em ${data(p.recebidaEm!)}`
            : situacao === "cancelada"
              ? ROTULO_SITUACAO.cancelada
              : p.venceEm
                ? `${ROTULO_SITUACAO[situacao]} para ${data(p.venceEm)}`
                : ROTULO_SITUACAO.sem_data;
        return (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="text-fluid-sm text-corpo min-w-0 break-words">
              {venda.parcelas.length > 1 ? `Parcela ${p.numero}` : "Comissão"} · {ROTULO_PAGADOR[p.pagador]} ({formatarReais(p.valor)}):{" "}
              <strong className={situacao === "atrasada" ? "text-perigo" : "text-titulo"}>{detalhe}</strong>
            </span>
            {gestor && situacao === "recebida" ? (
              <BotaoAcao acao={marcarParcelaRecebida.bind(null, p.id, null)} variante="secundario" rotulopendente="Desfazendo…">
                Desfazer
              </BotaoAcao>
            ) : gestor && situacao !== "cancelada" ? (
              <BotaoAcao acao={marcarParcelaRecebida.bind(null, p.id, hoje)} rotulopendente="Marcando…">
                Recebi hoje
              </BotaoAcao>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * O que só o gestor marca: cada parcela que entrou e o repasse que saiu.
 * Cada marcação tem volta (desfazer), porque clique errado em dinheiro é o
 * tipo de engano que ninguém percebe até o fim do mês.
 */
function PagamentosDaVenda({ venda }: { venda: VendaNaTela }) {
  const hoje = hojeEmSaoPaulo();
  return (
    <section className="cartao space-y-3 p-4 sm:p-5">
      <h2 className="text-fluid-base text-titulo font-medium">Pagamentos</h2>
      <ParcelasDaVenda venda={venda} gestor />
      <ul className="divide-linha divide-y">
        {venda.participantes.map((p) => {
          const liberado = repasseLiberado(p.repasseValor, venda.parcelas);
          const devido = repasseDevido(p.repasseValor, venda.parcelas);
          return (
            <li key={p.corretorId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span className="text-fluid-sm text-corpo min-w-0 break-words">
                Repasse de {p.nome} ({formatarReais(p.repasseValor)}):{" "}
                <strong className="text-titulo">
                  {p.repassePagoEm
                    ? `pago em ${data(p.repassePagoEm)}`
                    : p.formaRecebimento === "direto"
                      ? "recebe direto de quem paga"
                      : devido < p.repasseValor
                        ? `a pagar ${formatarReais(devido)} (distrato)`
                        : "a pagar"}
                </strong>
              </span>
              {p.repassePagoEm ? (
                <BotaoAcao acao={marcarRepassePago.bind(null, venda.id, p.corretorId, null)} variante="secundario" rotulopendente="Desfazendo…">
                  Desfazer
                </BotaoAcao>
              ) : p.formaRecebimento === "direto" ? null : liberado > 0 ? (
                <BotaoAcao acao={marcarRepassePago.bind(null, venda.id, p.corretorId, hoje)} rotulopendente="Marcando…">
                  Paguei hoje
                </BotaoAcao>
              ) : (
                <span className="text-fluid-xs text-tenue">libera quando a comissão entrar</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const dataCurta = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

/**
 * Uma venda. Quem registrou edita enquanto a venda está ativa e nada entrou;
 * o gestor, sempre. Os outros participantes LEEM (a RLS mostra, a policy de
 * update não deixa gravar) — por isso a tela decide entre formulário e
 * leitura pela mesma regra da policy, e não oferece um botão que o banco
 * recusaria. Distrato é do gestor; o corretor avisa (0232).
 */
export default async function VendaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const venda = await getVenda(id);
  if (!venda) notFound();

  const gestor = corretor.papel === "gestor";
  const algoEntrou = somaDas(venda.parcelas, "recebidas") > 0;
  const editavel = gestor || (venda.registradaPor === corretor.id && venda.status === "ativa" && !algoEntrou);
  const hoje = hojeEmSaoPaulo();

  const distrato = (
    <DistratoDaVenda
      vendaId={venda.id}
      gestor={gestor}
      hoje={hoje}
      distratada={venda.status === "distratada"}
      distratadaEm={venda.distratadaEm}
      motivo={venda.distratoMotivo}
      decisao={venda.distratoParcelas}
      avisadoEm={venda.distratoAvisadoEm}
      aviso={venda.distratoAviso}
      temParcelaAberta={somaDas(venda.parcelas, "abertas") > 0}
    />
  );

  const voltar = (
    <Link href="/corretor/financeiro" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center gap-1.5 px-3 botao-secundario">
      ← Vendas
    </Link>
  );

  if (!editavel) {
    return (
      <div className="space-y-4">
        {voltar}
        <CabecalhoDeTela
          secao="Vendas"
          titulo={venda.imovel}
          descricao={
            venda.status === "distratada"
              ? "Venda distratada; só o gestor mexe."
              : algoEntrou
                ? "Parte da comissão desta venda já entrou; só o gestor corrige."
                : `Registrada por ${venda.registradaPorNome}. Só quem registrou pode editar.`
          }
        />
        <dl className="cartao grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
          {[
            ["Unidade", venda.unidade ?? "—"],
            ["Data", dataCurta(venda.dataVenda)],
            ["Valor da venda", formatarReais(venda.valorVenda)],
            [
              "Comissão",
              `${formatarReais(venda.comissaoValor)}${venda.comissaoPercentual !== null ? ` (${formatarPercentual(venda.comissaoPercentual)})` : ""}`,
            ],
            ["Situação", venda.status === "distratada" ? "Distratada" : "Ativa"],
            ["Cliente", venda.leadNome ?? "—"],
          ].map(([r, v]) => (
            <div key={r} className="flex flex-col-reverse gap-0.5">
              <dt className="text-fluid-xs text-tenue">{r}</dt>
              <dd className="text-fluid-sm text-titulo break-words">{v}</dd>
            </div>
          ))}
        </dl>
        <section className="cartao p-4 sm:p-5">
          <ParcelasDaVenda venda={venda} gestor={false} />
        </section>
        <ul className="cartao divide-linha divide-y p-2">
          {venda.participantes.map((p) => (
            <li key={p.corretorId} className="text-fluid-sm flex flex-wrap justify-between gap-2 p-3">
              <span className="text-titulo">
                {p.nome} · {formatarPercentual(p.partePercentual)} da venda
              </span>
              <span className="text-corpo">
                Repasse {formatarReais(p.repasseValor)} ·{" "}
                {p.repassePagoEm ? "pago" : p.formaRecebimento === "direto" ? "recebe direto" : "a pagar"}
              </span>
            </li>
          ))}
        </ul>
        {distrato}
      </div>
    );
  }

  const [empreendimentos, equipe] = await Promise.all([getEmpreendimentosParaFiltro(), getEquipeAtiva()]);

  return (
    <div className="space-y-4">
      {voltar}
      <CabecalhoDeTela secao="Vendas" titulo="Editar venda" descricao={`${venda.imovel} · ${dataCurta(venda.dataVenda)}`} />
      {gestor && <PagamentosDaVenda venda={venda} />}
      <FormularioVenda
        inicial={{
          id: venda.id,
          leadId: venda.leadId,
          leadNome: venda.leadNome,
          empreendimentoId: venda.empreendimentoId,
          imovelDescricao: venda.empreendimentoId ? "" : venda.imovel,
          unidade: venda.unidade ?? "",
          dataVenda: venda.dataVenda,
          valorVenda: venda.valorVenda,
          comissaoPercentual: venda.comissaoPercentual,
          comissaoValor: venda.comissaoValor,
          observacao: venda.observacao ?? "",
          participantes: venda.participantes.map((p) => ({
            corretorId: p.corretorId,
            partePercentual: p.partePercentual,
            repassePercentual: p.repassePercentual,
            repasseValor: p.repasseValor,
            formaRecebimento: p.formaRecebimento,
          })),
          parcelas: venda.parcelas.map((p) => ({ numero: p.numero, valor: p.valor, pagador: p.pagador, venceEm: p.venceEm })),
        }}
        leadInicial={null}
        empreendimentos={empreendimentos}
        equipe={equipe.map((c) => ({ id: c.id, nome: c.nome }))}
        eu={{ id: corretor.id, nome: corretor.nome }}
        ultimoRepasse={null}
        podeExcluir={editavel}
        gestor={gestor}
      />
      {distrato}
    </div>
  );
}
