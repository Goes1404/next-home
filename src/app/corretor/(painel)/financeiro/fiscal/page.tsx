import type { Metadata } from "next";
import Link from "next/link";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { getFiscalDoMes } from "@/lib/financeiro/fiscalDoMes";
import { ROTULO_REGIME, faltasDaDimob, totalDeImpostos } from "@/lib/financeiro/fiscal";
import { somarMeses } from "@/lib/financeiro/caixa";
import { lerMes } from "@/lib/financeiro/resultado";
import { nomeDoMes } from "@/lib/financeiro/periodo";
import { formatarReais, hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { CabecalhoDeTela } from "../../_componentes/CabecalhoDeTela";
import { FormularioDaConfig, FormularioDaVenda, VinculoDoCorretor } from "./ControlesDoFiscal";

export const metadata: Metadata = { title: "Fiscal" };

const ROTA = "/corretor/financeiro/fiscal";
const rotuloDoMes = (mes: string) => `${nomeDoMes(`${mes}-01`)} ${mes.slice(0, 4)}`;
const curtoDoMes = (mes: string) => `${nomeDoMes(`${mes}-01`).slice(0, 3)}/${mes.slice(2, 4)}`;
const pct = (n: number) => `${(Math.round(n * 10000) / 100).toLocaleString("pt-BR")}%`;
const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
const navegar = "text-fluid-sm border-linha text-corpo hover:border-acento-linha inline-flex min-h-11 items-center rounded-xl border px-4";

function Baixar({ tipo, mes, children }: { tipo: string; mes: string; children: React.ReactNode }) {
  return (
    <a href={`/api/painel/fiscal-excel?tipo=${tipo}&mes=${mes}`} className={navegar} download>
      {children}
    </a>
  );
}

/**
 * O fiscal da imobiliária (0167), só para o gestor: impostos estimados do
 * mês, notas fiscais das comissões, RPA dos corretores autônomos e a DIMOB do
 * ano, cada um com a planilha pronta para o contador.
 */
export default async function FiscalPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirGestorNaPagina();
  const hoje = hojeEmSaoPaulo();
  const mes = lerMes((await searchParams).mes, hoje);
  const mesAtual = hoje.slice(0, 7);

  const cabecalho = (
    <CabecalhoDeTela
      secao="Financeiro"
      titulo="Fiscal"
      descricao="Impostos estimados, notas das comissões, RPA dos corretores e DIMOB, com a planilha pronta para o contador."
    />
  );

  const leitura = await getFiscalDoMes(mes);
  if (!leitura.ok) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <p className="cartao text-fluid-sm text-corpo p-4">
          {leitura.motivo === "sem_tabela"
            ? "O fiscal ainda não foi ativado no banco. Assim que for, esta tela passa a funcionar."
            : "Não foi possível carregar o fiscal agora. Recarregue a página."}
        </p>
      </div>
    );
  }
  const f = leitura.fiscal;
  const total = totalDeImpostos(f.impostos);
  const anterior = somarMeses(`${mes}-01`, -1).slice(0, 7);
  const proximo = mes < mesAtual ? somarMeses(`${mes}-01`, 1).slice(0, 7) : null;
  const dimobIncompletas = f.doAno.filter((v) => faltasDaDimob(v, f.dados.get(v.id)).length > 0).length;
  const somaRpa = (k: "bruto" | "inss" | "irrf" | "liquido" | "inssPatronal") => f.rpas.reduce((s, r) => s + r.rpa[k], 0);

  return (
    <div className="space-y-4">
      {cabecalho}

      <nav aria-label="Escolher o mês" className="flex flex-wrap items-center gap-2">
        <Link href={`${ROTA}?mes=${anterior}`} className={navegar}>
          ← {curtoDoMes(anterior)}
        </Link>
        <p className="text-fluid-base text-titulo px-2 font-medium">{rotuloDoMes(mes)}</p>
        {proximo && (
          <Link href={`${ROTA}?mes=${proximo}`} className={navegar}>
            {curtoDoMes(proximo)} →
          </Link>
        )}
        {mes !== mesAtual && (
          <Link href={ROTA} className={navegar}>
            Mês atual
          </Link>
        )}
      </nav>

      {f.config.conferidoEm === null && (
        <p className="cartao text-fluid-sm text-corpo border-alerta p-4">
          Confira a configuração lá embaixo com o seu contador (regime e alíquotas). Até lá, os números usam um padrão.
        </p>
      )}

      {/* Impostos do mês */}
      <section className="cartao space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-fluid-base text-titulo font-medium">Impostos estimados de {rotuloDoMes(mes)}</h2>
          <p className="text-fluid-xl text-titulo font-bold tabular-nums">{formatarReais(total)}</p>
        </div>
        <p className="text-fluid-xs text-tenue">
          {ROTULO_REGIME[f.config.regime]} sobre {formatarReais(f.receita)} de receita de corretagem recebida no mês.
          {f.impostosPagos > 0 ? ` Lançado como imposto pago no Caixa: ${formatarReais(f.impostosPagos)}.` : ""}
        </p>
        {f.impostos.length === 0 ? (
          <p className="text-fluid-sm text-corpo">Nenhuma comissão recebida neste mês, então nada a estimar.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-fluid-sm w-full min-w-[30rem]">
              <thead>
                <tr className="text-fluid-xs text-tenue text-left">
                  <th className="py-2 pr-2 font-normal">Imposto</th>
                  <th className="py-2 pr-2 text-right font-normal">Alíquota</th>
                  <th className="py-2 text-right font-normal">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-linha divide-y">
                {f.impostos.map((l) => (
                  <tr key={l.nome}>
                    <td className="py-2 pr-2">
                      <span className="text-corpo">{l.nome}</span>
                      <span className="text-fluid-xs text-tenue block">{l.explicacao}</span>
                    </td>
                    <td className="text-apoio py-2 pr-2 text-right tabular-nums">{pct(l.aliquota)}</td>
                    <td className="text-titulo py-2 text-right font-medium whitespace-nowrap tabular-nums">{formatarReais(l.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Baixar tipo="impostos" mes={mes}>
            Planilha de impostos
          </Baixar>
        </div>
      </section>

      {/* Notas fiscais */}
      <section className="cartao space-y-3 p-4 sm:p-5">
        <h2 className="text-fluid-base text-titulo font-medium">Comissões sem nota fiscal</h2>
        {f.semNota.length === 0 ? (
          <p className="text-fluid-sm text-corpo">Toda comissão recebida tem o número da NFS-e registrado.</p>
        ) : (
          <>
            <p className="text-fluid-xs text-tenue">
              A comissão entrou e a nota ainda não foi registrada. Emita no portal da prefeitura e anote o número aqui.
            </p>
            <ul className="divide-linha divide-y">
              {f.semNota.map((v) => (
                <li key={v.id} className="py-2">
                  <details>
                    <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2">
                      <span className="text-corpo min-w-0">
                        {[v.imovel, v.unidade].filter(Boolean).join(" · ")}
                        <span className="text-fluid-xs text-tenue block">
                          {v.construtora ?? "Construtora não informada"} · recebida em {dataBr(v.comissaoRecebidaEm as string)}
                        </span>
                      </span>
                      <span className="text-titulo font-medium tabular-nums">{formatarReais(v.comissaoValor)}</span>
                    </summary>
                    <FormularioDaVenda vendaId={v.id} dados={f.dados.get(v.id)} compradorPadrao={v.leadNome} vendedorPadrao={v.construtora} />
                  </details>
                </li>
              ))}
            </ul>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Baixar tipo="notas" mes={mes}>
            Planilha de notas de {f.ano}
          </Baixar>
        </div>
      </section>

      {/* RPA */}
      <section className="cartao space-y-3 p-4 sm:p-5">
        <h2 className="text-fluid-base text-titulo font-medium">RPA dos corretores em {rotuloDoMes(mes)}</h2>
        <p className="text-fluid-xs text-tenue">
          Repasses pagos no mês a corretores autônomos: INSS de 11% (até o teto) e IRRF pela tabela de 2026, já com a redução para quem recebe até R$ 7.350.
          {f.config.regime === "presumido" ? " No lucro presumido a imobiliária paga ainda 20% de INSS patronal." : ""}
        </p>
        {f.rpas.length === 0 ? (
          <p className="text-fluid-sm text-corpo">Nenhum repasse a autônomo marcado como pago neste mês.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="text-fluid-sm w-full min-w-[36rem]">
              <thead>
                <tr className="text-fluid-xs text-tenue text-left">
                  <th className="py-2 pr-2 font-normal">Corretor</th>
                  <th className="py-2 pr-2 text-right font-normal">Bruto</th>
                  <th className="py-2 pr-2 text-right font-normal">INSS</th>
                  <th className="py-2 pr-2 text-right font-normal">IRRF</th>
                  <th className="py-2 text-right font-normal">Líquido</th>
                </tr>
              </thead>
              <tbody className="divide-linha divide-y">
                {f.rpas.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-2">
                      <span className="text-corpo">{r.corretor}</span>
                      <span className="text-fluid-xs text-tenue block">
                        {r.imovel} · {dataBr(r.pagoEm)}
                      </span>
                    </td>
                    <td className="text-corpo py-2 pr-2 text-right tabular-nums">{formatarReais(r.rpa.bruto)}</td>
                    <td className="text-apoio py-2 pr-2 text-right tabular-nums">{formatarReais(r.rpa.inss)}</td>
                    <td className="text-apoio py-2 pr-2 text-right tabular-nums">{formatarReais(r.rpa.irrf)}</td>
                    <td className="text-titulo py-2 text-right font-medium tabular-nums">{formatarReais(r.rpa.liquido)}</td>
                  </tr>
                ))}
                <tr className="border-linha-forte border-t">
                  <th scope="row" className="text-titulo py-2 pr-2 text-left font-semibold">
                    Total
                  </th>
                  <td className="text-titulo py-2 pr-2 text-right font-semibold tabular-nums">{formatarReais(somaRpa("bruto"))}</td>
                  <td className="text-titulo py-2 pr-2 text-right font-semibold tabular-nums">{formatarReais(somaRpa("inss"))}</td>
                  <td className="text-titulo py-2 pr-2 text-right font-semibold tabular-nums">{formatarReais(somaRpa("irrf"))}</td>
                  <td className="text-titulo py-2 text-right font-semibold tabular-nums">{formatarReais(somaRpa("liquido"))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        {somaRpa("inssPatronal") > 0 && (
          <p className="text-fluid-sm text-corpo">INSS patronal do mês: {formatarReais(somaRpa("inssPatronal"))}.</p>
        )}
        {f.repassesPj.length > 0 && (
          <p className="text-fluid-sm text-corpo">
            {f.repassesPj.length} repasse(s) a corretor PJ somando {formatarReais(f.repassesPj.reduce((s, r) => s + r.valor, 0))}: peça a nota fiscal dele.
          </p>
        )}
        {f.corretores.length > 0 && (
          <details>
            <summary className="text-fluid-sm text-acento min-h-11 cursor-pointer content-center">Como cada corretor recebe</summary>
            <ul className="divide-linha mt-2 divide-y">
              {f.corretores.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="text-corpo min-w-0">{c.nome}</span>
                  <VinculoDoCorretor corretorId={c.id} vinculo={f.vinculos.get(c.id) ?? "autonomo"} />
                </li>
              ))}
            </ul>
          </details>
        )}
        <div className="flex flex-wrap gap-2">
          <Baixar tipo="rpa" mes={mes}>
            Planilha de RPA
          </Baixar>
        </div>
      </section>

      {/* DIMOB */}
      <section className="cartao space-y-3 p-4 sm:p-5">
        <h2 className="text-fluid-base text-titulo font-medium">DIMOB {f.ano}</h2>
        <p className="text-fluid-xs text-tenue">
          As vendas intermediadas no ano, com comprador e vendedor. A Receita pede CPF ou CNPJ das duas partes; a declaração vence no último dia útil de
          fevereiro do ano seguinte.
        </p>
        {f.doAno.length === 0 ? (
          <p className="text-fluid-sm text-corpo">Nenhuma venda registrada em {f.ano}.</p>
        ) : (
          <>
            <p className="text-fluid-sm text-corpo">
              {f.doAno.length} venda(s) no ano
              {dimobIncompletas > 0 ? `; ${dimobIncompletas} ainda sem os documentos completos.` : ", todas com os documentos completos."}
            </p>
            <ul className="divide-linha divide-y">
              {f.doAno.map((v) => {
                const faltas = faltasDaDimob(v, f.dados.get(v.id));
                return (
                  <li key={v.id} className="py-2">
                    <details>
                      <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-2">
                        <span className="text-corpo min-w-0">
                          {[v.imovel, v.unidade].filter(Boolean).join(" · ")}
                          <span className={`text-fluid-xs block ${faltas.length ? "text-alerta" : "text-tenue"}`}>
                            {dataBr(v.dataVenda)} · {faltas.length ? `falta ${faltas.join(", ")}` : "completa"}
                          </span>
                        </span>
                        <span className="text-titulo font-medium tabular-nums">{formatarReais(v.valorVenda)}</span>
                      </summary>
                      <FormularioDaVenda vendaId={v.id} dados={f.dados.get(v.id)} compradorPadrao={v.leadNome} vendedorPadrao={v.construtora} />
                    </details>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <div className="flex flex-wrap gap-2">
          <Baixar tipo="dimob" mes={mes}>
            Planilha da DIMOB {f.ano}
          </Baixar>
        </div>
      </section>

      {/* Configuração */}
      <section className="cartao space-y-3 p-4 sm:p-5">
        <h2 className="text-fluid-base text-titulo font-medium">Configuração</h2>
        <p className="text-fluid-xs text-tenue">
          {f.config.conferidoEm ? `Conferida em ${dataBr(f.config.conferidoEm)}. ` : ""}
          As alíquotas mudam com a faixa do Simples e com a lei. Peça os números ao contador e atualize aqui.
        </p>
        <FormularioDaConfig config={f.config} />
      </section>

      <p className="text-fluid-xs text-tenue">
        São estimativas para planejar o caixa e entregar a planilha pronta. Quem apura e assina é o contador.
        {!f.vendasLidas ? " As vendas não puderam ser lidas agora; comissões e repasses estão fora desta conta." : ""}
      </p>
    </div>
  );
}
