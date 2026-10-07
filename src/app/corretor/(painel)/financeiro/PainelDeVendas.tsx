import { formatarReais } from "@/lib/financeiro/venda";
import { reaisCurto, type PainelDeVendas as Painel } from "@/lib/financeiro/painelDeVendas";
import { CartaoDeGrafico, GraficoVazio } from "../_componentes/graficos/Moldura";
import { ColunasPorMes } from "../_componentes/graficos/ColunasPorMes";

/**
 * Indicadores e gráficos da tela de Vendas (07/10/2026). Só desenho: as
 * contas moram em `montarPainelDeVendas`, função pura com teste.
 *
 * Três perguntas, uma forma cada:
 * - "Como está meu ritmo?" — colunas de VGV por mês, o mês atual em destaque;
 * - "Quanto da minha comissão já entrou?" — uma barra só, em três estados;
 * - "O que eu mais vendo?" — ranking de imóveis por VGV.
 */

function Indicador({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string; detalhe?: string; tom?: "ok" | "perigo" }) {
  return (
    <div className="cartao flex flex-col gap-1 p-4">
      <dt className="text-fluid-xs text-tenue">{rotulo}</dt>
      <dd className="text-fluid-lg text-titulo font-bold break-words">{valor}</dd>
      {detalhe && (
        <dd
          className={`text-fluid-xs font-medium ${tom === "ok" ? "text-ok" : tom === "perigo" ? "text-perigo" : "text-apoio"}`}
        >
          {detalhe}
        </dd>
      )}
    </div>
  );
}

function BarraDaComissao({ comissao, gestor }: { comissao: Painel["comissao"]; gestor: boolean }) {
  const total = comissao.recebida + comissao.liberada + comissao.aguardando;
  if (total === 0) return <GraficoVazio texto="A comissão aparece aqui quando houver venda registrada." />;
  const partes = [
    { chave: "recebida", rotulo: gestor ? "Recebida da construtora" : "Já recebida", valor: comissao.recebida, cor: "bg-ok" },
    { chave: "liberada", rotulo: "Liberada para pagar você", valor: comissao.liberada, cor: "bg-acento" },
    { chave: "aguardando", rotulo: "Aguardando a construtora", valor: comissao.aguardando, cor: "bg-alerta" },
  ].filter((p) => p.valor > 0);
  const recebidaPct = Math.round((comissao.recebida / total) * 100);
  return (
    <div className="space-y-3">
      <p className="text-fluid-sm text-corpo">
        <span className="text-fluid-xl text-titulo font-bold">{recebidaPct}%</span> de {formatarReais(total)} já
        entrou
      </p>
      <div className="flex h-4 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={partes.map((p) => `${p.rotulo}: ${formatarReais(p.valor)}`).join("; ")}>
        {partes.map((p) => (
          <span key={p.chave} className={`${p.cor} h-full`} style={{ width: `${(p.valor / total) * 100}%` }} title={`${p.rotulo}: ${formatarReais(p.valor)}`} />
        ))}
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {partes.map((p) => (
          <li key={p.chave} className="flex items-start gap-2">
            <span className={`${p.cor} mt-1.5 size-2.5 shrink-0 rounded-full`} aria-hidden />
            <span className="min-w-0">
              <span className="text-fluid-xs text-apoio block">{p.rotulo}</span>
              <span className="text-fluid-sm text-titulo font-bold">{formatarReais(p.valor)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PorImovel({ linhas }: { linhas: Painel["porImovel"] }) {
  if (linhas.length === 0) return <GraficoVazio texto="O ranking de imóveis aparece com a primeira venda." />;
  const maior = linhas[0].vgv;
  return (
    <ol className="space-y-3">
      {linhas.map((l, i) => (
        <li key={l.imovel} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-fluid-sm text-titulo min-w-0 truncate font-medium">
              <span className="text-tenue mr-1.5">{i + 1}.</span>
              {l.imovel}
            </span>
            <span className="text-fluid-xs text-apoio shrink-0">
              <span className="text-titulo font-bold">{reaisCurto(l.vgv)}</span> · {l.vendas}{" "}
              {l.vendas === 1 ? "venda" : "vendas"}
            </span>
          </div>
          <div className="bg-vidro-forte h-2 w-full overflow-hidden rounded-full">
            <div className={`h-full rounded-full ${i === 0 ? "bg-acento" : "bg-acento opacity-60"}`} style={{ width: `${Math.max(3, (l.vgv / maior) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function PainelDeVendas({ painel, gestor }: { painel: Painel; gestor: boolean }) {
  const variacao =
    painel.variacaoMes === null
      ? undefined
      : `${painel.variacaoMes >= 0 ? "▲" : "▼"} ${Math.abs(painel.variacaoMes)}% sobre o mês passado`;
  return (
    <div className="mt-4 space-y-4">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Indicador
          rotulo={gestor ? "VGV da equipe no mês" : "Seu VGV no mês"}
          valor={formatarReais(painel.vgvMes)}
          detalhe={variacao}
          tom={painel.variacaoMes === null ? undefined : painel.variacaoMes >= 0 ? "ok" : "perigo"}
        />
        <Indicador rotulo={gestor ? "VGV da equipe no ano" : "Seu VGV no ano"} valor={formatarReais(painel.vgvAno)} detalhe={`${painel.vendasAno} ${painel.vendasAno === 1 ? "venda" : "vendas"} no ano`} />
        <Indicador rotulo="Vendas no mês" valor={String(painel.vendasMes)} />
        <Indicador rotulo="Ticket médio" valor={painel.ticketMedio === null ? "—" : formatarReais(painel.ticketMedio)} detalhe="últimos 12 meses" />
        <Indicador rotulo={gestor ? "Comissão recebida" : "Comissão recebida"} valor={formatarReais(painel.comissao.recebida)} />
        <Indicador
          rotulo={gestor ? "Comissão a receber" : "Comissão a receber"}
          valor={formatarReais(painel.comissao.liberada + painel.comissao.aguardando)}
        />
      </dl>

      {/* min-w-0 nos filhos: item de grid tem min-width auto, e o rótulo sem quebra de linha alargava o cartão além da tela do celular. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <CartaoDeGrafico titulo="Como está o ritmo de vendas?" subtitulo="VGV por mês, últimos 6 meses">
          <ColunasPorMes
            meses={painel.meses.map((m) => ({ mes: m.mes, rotulo: m.rotulo, valor: m.vgv, detalhe: `em ${m.vendas} ${m.vendas === 1 ? "venda" : "vendas"}` }))}
            vazio="As colunas aparecem quando a primeira venda for registrada."
            rotuloAcessivel="VGV por mês"
          />
        </CartaoDeGrafico>
        <CartaoDeGrafico
          titulo={gestor ? "Quanto da comissão já entrou?" : "Quanto da sua comissão já entrou?"}
          subtitulo={gestor ? "Comissão da imobiliária nas vendas ativas" : "Sua parte nas vendas ativas"}
        >
          <BarraDaComissao comissao={painel.comissao} gestor={gestor} />
        </CartaoDeGrafico>
      </div>

      <CartaoDeGrafico titulo="O que mais vende?" subtitulo="Imóveis por VGV, últimos 12 meses">
        <PorImovel linhas={painel.porImovel} />
      </CartaoDeGrafico>
    </div>
  );
}
