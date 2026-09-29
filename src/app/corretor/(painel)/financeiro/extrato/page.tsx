import type { Metadata } from "next";
import Link from "next/link";
import { getContagemPorEtapa, getCorretorLogado } from "@/lib/corretorSessao";
import { getTaxasDaEquipe, getVendas } from "@/lib/financeiro/dados";
import {
  aReceberDasConstrutoras,
  extratoDo,
  repassesAPagar,
  ROTULO_SITUACAO,
  type SituacaoDoRepasse,
} from "@/lib/financeiro/extrato";
import { nomeDoMes } from "@/lib/financeiro/periodo";
import { preverCaixa, type Previsao } from "@/lib/financeiro/previsao";
import { getRitmoDoCorretor } from "@/lib/financeiro/ritmoDoCorretor";
import { centavos, formatarReais, hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { BotaoAcao } from "../../_componentes/BotaoAcao";
import { CabecalhoDeTela } from "../../_componentes/CabecalhoDeTela";
import { AbasFinanceiro } from "../../_componentes/AbasFinanceiro";
import { CartaoMeta } from "../CartaoMeta";
import { marcarComissaoRecebida, marcarRepassePago } from "../acoes";

export const metadata: Metadata = { title: "Extrato e meta" };

const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const COR_SITUACAO: Record<SituacaoDoRepasse, string> = {
  pago: "border-ok-linha bg-ok-lavado",
  pode_pagar: "border-acento-linha bg-acento-lavado",
  aguardando_construtora: "border-alerta-linha bg-alerta-lavado",
  distratada: "border-perigo-linha bg-perigo-lavado",
};

function Numero({ rotulo, valor, detalhe }: { rotulo: string; valor: string; detalhe?: string }) {
  return (
    <div className="cartao flex flex-col-reverse gap-1 p-4">
      <dt className="text-fluid-xs text-tenue">
        {rotulo}
        {detalhe ? <span className="block">{detalhe}</span> : null}
      </dt>
      <dd className="text-fluid-lg text-titulo font-bold break-words">{valor}</dd>
    </div>
  );
}

function CartaoPrevisao({ previsao, titulo }: { previsao: Previsao; titulo: string }) {
  return (
    <section className="cartao space-y-2 p-4 sm:p-5">
      <h2 className="text-fluid-base text-titulo font-medium">{titulo}</h2>
      <p className="text-fluid-sm text-corpo">
        <strong className="text-titulo">{formatarReais(previsao.certo)}</strong> de vendas já registradas que ainda
        não foram pagas.
      </p>
      {previsao.estimado !== null ? (
        <p className="text-fluid-sm text-corpo">
          Mais cerca de <strong className="text-titulo">{formatarReais(previsao.estimado)}</strong> estimados dos{" "}
          {previsao.leadsEmDocumentacao} leads em documentação, pela conversão histórica da equipe. É projeção, não
          contrato.
        </p>
      ) : (
        <p className="text-fluid-xs text-tenue">{previsao.semEstimativa}</p>
      )}
    </section>
  );
}

/**
 * Extrato e meta (F2, F5 e F7 do financeiro).
 *
 * Para o corretor: a meta traduzida em trabalho, o que tem a receber e em
 * que ponto está cada repasse. Para o gestor, além disso: o que cada
 * construtora deve (pela dívida mais velha, que é por onde se cobra) e o
 * que a imobiliária deve a cada corretor, separando o que JÁ pode ser pago
 * do que ainda depende da construtora — misturar os dois faria o gestor
 * pagar dinheiro que não entrou.
 */
export default async function ExtratoPage() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;
  const gestor = corretor.papel === "gestor";
  const hoje = hojeEmSaoPaulo();

  const cabecalho = (
    <>
      <CabecalhoDeTela
        secao="Financeiro"
        titulo="Extrato e meta"
        descricao="O que você tem a receber, em que ponto está cada comissão, e quanto falta para a meta do mês."
      />
      <div className="mt-6">
        <AbasFinanceiro ativa="/corretor/financeiro/extrato" />
      </div>
    </>
  );

  const leitura = await getVendas();
  if (!leitura.ok) {
    return (
      <div>
        {cabecalho}
        <p className="cartao text-fluid-sm text-corpo mt-4 p-4">
          {leitura.motivo === "sem_tabela"
            ? "O registro de vendas ainda não foi ativado no banco. Assim que for, esta tela passa a funcionar."
            : "Não foi possível carregar as vendas agora. Recarregue a página."}
        </p>
      </div>
    );
  }
  const vendas = leitura.vendas;

  const desdeAno = `${Number(hoje.slice(0, 4)) - 1}${hoje.slice(4)}`;
  const [ritmo, etapas, equipe] = await Promise.all([
    getRitmoDoCorretor(corretor.id, vendas),
    getContagemPorEtapa(),
    getTaxasDaEquipe(desdeAno),
  ]);

  const meu = extratoDo(corretor.id, vendas, hoje);
  const minhaPrevisao = preverCaixa({
    certo: meu.aReceber,
    leadsEmDocumentacao: gestor ? 0 : etapas.documentacao,
    docParaVenda: equipe?.docParaVenda ?? null,
    rendePorVenda: equipe?.repasseMedio ?? null,
    vendasNaHistoria: equipe?.vendas ?? 0,
  });

  const construtoras = gestor ? aReceberDasConstrutoras(vendas, hoje) : [];
  const repasses = gestor ? repassesAPagar(vendas) : [];
  const ativas = vendas.filter((v) => v.status === "ativa");
  const previsaoEquipe = gestor
    ? preverCaixa({
        certo: construtoras.reduce((s, c) => s + c.total, 0),
        leadsEmDocumentacao: etapas.documentacao,
        docParaVenda: equipe?.docParaVenda ?? null,
        rendePorVenda: ativas.length ? centavos(ativas.reduce((s, v) => s + v.comissaoValor, 0) / ativas.length) : null,
        vendasNaHistoria: equipe?.vendas ?? 0,
      })
    : null;

  return (
    <div className="space-y-4">
      {cabecalho}

      {ritmo.estado !== "sem_migracao" && <CartaoMeta estado={ritmo} />}

      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Numero rotulo="A receber" valor={formatarReais(meu.aReceber)} />
        <Numero rotulo="Já liberado" valor={formatarReais(meu.liberado)} detalhe="a construtora já pagou" />
        <Numero rotulo={`Recebido em ${hoje.slice(0, 4)}`} valor={formatarReais(meu.recebidoNoAno)} />
      </dl>

      {!gestor && <CartaoPrevisao previsao={minhaPrevisao} titulo="O que deve entrar" />}

      {meu.recebidoPorMes.length > 0 && (
        <section className="cartao space-y-2 p-4 sm:p-5">
          <h2 className="text-fluid-base text-titulo font-medium">Recebido por mês</h2>
          <ul className="text-fluid-sm divide-linha divide-y">
            {meu.recebidoPorMes.map((m) => (
              <li key={m.mes} className="flex justify-between gap-2 py-2">
                <span className="text-corpo capitalize">{nomeDoMes(`${m.mes}-01`)}</span>
                <span className="text-titulo font-medium tabular-nums">{formatarReais(m.valor)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-fluid-base text-titulo font-medium">Suas comissões</h2>
        {meu.linhas.length === 0 ? (
          <p className="cartao text-fluid-sm text-corpo p-4">
            Nenhuma venda sua registrada ainda.{" "}
            <Link href="/corretor/financeiro/nova" className="text-titulo underline">
              Registrar venda
            </Link>
          </p>
        ) : (
          <ul className="space-y-2">
            {meu.linhas.map((l) => (
              <li key={l.vendaId}>
                <Link
                  href={`/corretor/financeiro/${l.vendaId}`}
                  className="cartao hover:border-acento-linha flex flex-wrap items-center justify-between gap-2 p-4 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="text-fluid-sm text-titulo block font-medium break-words">
                      {l.imovel}
                      {l.unidade ? ` · ${l.unidade}` : ""}
                    </span>
                    <span className="text-fluid-xs text-tenue">vendido em {dataCurta(l.dataVenda)}</span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="text-fluid-base text-titulo font-bold tabular-nums">{formatarReais(l.repasse)}</span>
                    <span className={`text-fluid-xs text-titulo rounded-full border px-2.5 py-0.5 ${COR_SITUACAO[l.situacao]}`}>
                      {l.situacao === "pago" && l.pagoEm ? `Pago em ${dataCurta(l.pagoEm)}` : ROTULO_SITUACAO[l.situacao]}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {gestor && previsaoEquipe && <CartaoPrevisao previsao={previsaoEquipe} titulo="O que deve entrar na imobiliária" />}

      {gestor && (
        <section className="space-y-2">
          <div>
            <h2 className="text-fluid-base text-titulo font-medium">A receber das construtoras</h2>
            <p className="text-fluid-xs text-tenue">Pela dívida mais antiga: é por ela que se começa a cobrar.</p>
          </div>
          {construtoras.length === 0 ? (
            <p className="cartao text-fluid-sm text-corpo p-4">Nenhuma comissão pendente. Tudo que foi vendido já foi pago.</p>
          ) : (
            construtoras.map((c) => (
              <div key={c.construtora} className="cartao space-y-2 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-fluid-sm text-titulo font-bold break-words">{c.construtora}</p>
                  <p className="text-fluid-sm text-titulo tabular-nums">
                    {formatarReais(c.total)}
                    <span className={`text-fluid-xs ml-2 ${c.maisAntigaDias > 60 ? "text-perigo" : "text-tenue"}`}>
                      a mais antiga há {c.maisAntigaDias} {c.maisAntigaDias === 1 ? "dia" : "dias"}
                    </span>
                  </p>
                </div>
                <ul className="divide-linha divide-y">
                  {c.vendas.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <Link href={`/corretor/financeiro/${v.id}`} className="text-fluid-sm text-corpo hover:text-titulo min-w-0 break-words">
                        {v.imovel}
                        {v.unidade ? ` · ${v.unidade}` : ""} · {formatarReais(v.valor)} · {v.dias} dias
                      </Link>
                      <BotaoAcao
                        acao={marcarComissaoRecebida.bind(null, v.id, hoje)}
                        sucesso="Comissão marcada como recebida."
                        rotulopendente="Marcando…"
                        variante="secundario"
                      >
                        Recebi hoje
                      </BotaoAcao>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      )}

      {gestor && (
        <section className="space-y-2">
          <div>
            <h2 className="text-fluid-base text-titulo font-medium">Repasses a pagar</h2>
            <p className="text-fluid-xs text-tenue">
              &quot;Liberado&quot; é o que a construtora já pagou. O resto depende dela ainda.
            </p>
          </div>
          {repasses.length === 0 ? (
            <p className="cartao text-fluid-sm text-corpo p-4">Nenhum repasse pendente.</p>
          ) : (
            repasses.map((r) => (
              <div key={r.corretorId} className="cartao space-y-2 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-fluid-sm text-titulo font-bold break-words">{r.nome}</p>
                  <p className="text-fluid-xs text-apoio tabular-nums">
                    <strong className="text-titulo text-fluid-sm">{formatarReais(r.liberado)}</strong> liberado ·{" "}
                    {formatarReais(r.aguardando)} aguardando
                  </p>
                </div>
                <ul className="divide-linha divide-y">
                  {r.itens.map((i) => (
                    <li key={i.vendaId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span className="text-fluid-sm text-corpo min-w-0 break-words">
                        {i.imovel}
                        {i.unidade ? ` · ${i.unidade}` : ""} · {formatarReais(i.valor)}
                        <span className="text-fluid-xs text-tenue block">{ROTULO_SITUACAO[i.situacao]}</span>
                      </span>
                      {i.situacao === "pode_pagar" && (
                        <BotaoAcao
                          acao={marcarRepassePago.bind(null, i.vendaId, r.corretorId, hoje)}
                          sucesso="Repasse marcado como pago."
                          rotulopendente="Marcando…"
                          variante="secundario"
                        >
                          Paguei hoje
                        </BotaoAcao>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}
