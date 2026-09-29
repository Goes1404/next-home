import type { Metadata } from "next";
import Link from "next/link";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getVendas, vgvPorCorretor, type VendaNaTela } from "@/lib/financeiro/dados";
import { formatarPercentual, formatarReais, hojeEmSaoPaulo, vgvCreditado } from "@/lib/financeiro/venda";
import { CabecalhoDeTela } from "../_componentes/CabecalhoDeTela";
import { AbasFinanceiro } from "../_componentes/AbasFinanceiro";

export const metadata: Metadata = { title: "Vendas" };

const dataCurta = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

/**
 * As vendas (0114): F1 do módulo financeiro. O corretor vê as que registrou
 * e as em que participa; o gestor vê todas (a RLS recorta).
 *
 * Os números do topo são a parte de CADA UM, não a soma das vendas: numa
 * venda dividida meio a meio, cada corretor soma metade do VGV. Para o
 * gestor, que vê tudo, o topo é o da equipe.
 */
export default async function VendasPage() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;
  const gestor = corretor.papel === "gestor";

  const leitura = await getVendas();

  const cabecalho = (
    <>
      <CabecalhoDeTela
        secao="Financeiro"
        titulo="Vendas"
        descricao="Cada venda com valor, comissão e quem vendeu. É daqui que saem o extrato e o ranking de VGV."
        acao={
          leitura.ok ? (
            <Link
              href="/corretor/financeiro/nova"
              className="text-fluid-sm bg-acento text-sobre-cor inline-flex min-h-11 items-center rounded-xl px-5 font-bold"
            >
              Registrar venda
            </Link>
          ) : undefined
        }
      />
      <div className="mt-6">
        <AbasFinanceiro ativa="/corretor/financeiro" />
      </div>
    </>
  );

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
  const hoje = hojeEmSaoPaulo();
  const inicioMes = `${hoje.slice(0, 7)}-01`;
  const inicioAno = `${hoje.slice(0, 4)}-01-01`;

  const somar = (lista: VendaNaTela[]) =>
    gestor
      ? lista.reduce((s, v) => s + vgvCreditado(v, 100), 0)
      : (vgvPorCorretor(lista).get(corretor.id) ?? 0);
  const vgvMes = somar(vendas.filter((v) => v.dataVenda >= inicioMes));
  const vgvAno = somar(vendas.filter((v) => v.dataVenda >= inicioAno));
  const vendasMes = vendas.filter((v) => v.dataVenda >= inicioMes && v.status === "ativa").length;
  const aReceber = vendas
    .filter((v) => v.status === "ativa")
    .flatMap((v) => v.participantes.filter((p) => (gestor || p.corretorId === corretor.id) && !p.repassePagoEm))
    .reduce((s, p) => s + p.repasseValor, 0);

  const numeros = [
    { rotulo: gestor ? "VGV da equipe no mês" : "Seu VGV no mês", valor: formatarReais(vgvMes) },
    { rotulo: gestor ? "VGV da equipe no ano" : "Seu VGV no ano", valor: formatarReais(vgvAno) },
    { rotulo: "Vendas no mês", valor: String(vendasMes) },
    { rotulo: gestor ? "Repasses a pagar" : "Sua comissão a receber", valor: formatarReais(aReceber) },
  ];

  return (
    <div>
      {cabecalho}

      <dl className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {numeros.map((n) => (
          <div key={n.rotulo} className="cartao flex flex-col-reverse gap-1 p-4">
            <dt className="text-fluid-xs text-tenue">{n.rotulo}</dt>
            <dd className="text-fluid-lg text-titulo font-bold break-words">{n.valor}</dd>
          </div>
        ))}
      </dl>

      {vendas.length === 0 ? (
        <div className="cartao mt-4 space-y-3 p-5">
          <p className="text-fluid-base text-titulo font-medium">Nenhuma venda registrada ainda.</p>
          <p className="text-fluid-sm text-corpo">
            Registre a primeira pelo botão acima, ou pela ficha do lead quando ele chegar a Fechado.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {vendas.map((v) => (
            <li key={v.id}>
              <Link
                href={`/corretor/financeiro/${v.id}`}
                className="cartao hover:border-acento-linha block space-y-2 p-4 transition-colors active:bg-vidro-forte"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-fluid-base text-titulo font-medium break-words">
                      {v.imovel}
                      {v.unidade ? <span className="text-apoio font-normal"> · {v.unidade}</span> : null}
                    </p>
                    <p className="text-fluid-xs text-tenue">
                      {dataCurta(v.dataVenda)}
                      {v.leadNome ? ` · ${v.leadNome}` : ""}
                    </p>
                  </div>
                  <p
                    className={`text-fluid-base font-bold ${v.status === "distratada" ? "text-tenue line-through" : "text-titulo"}`}
                  >
                    {formatarReais(v.valorVenda)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {v.status === "distratada" ? (
                    <span className="text-fluid-xs border-perigo-linha bg-perigo-lavado text-titulo rounded-full border px-2.5 py-1">
                      Distratada
                    </span>
                  ) : (
                    <span
                      className={`text-fluid-xs rounded-full border px-2.5 py-1 ${
                        v.comissaoRecebidaEm
                          ? "border-ok-linha bg-ok-lavado text-titulo"
                          : "border-alerta-linha bg-alerta-lavado text-titulo"
                      }`}
                    >
                      {v.comissaoRecebidaEm ? "Comissão recebida" : "Comissão a receber"}
                    </span>
                  )}
                  <span className="text-fluid-xs text-apoio py-1">
                    Comissão {formatarReais(v.comissaoValor)}
                    {v.comissaoPercentual !== null ? ` (${formatarPercentual(v.comissaoPercentual)})` : ""}
                  </span>
                </div>
                <p className="text-fluid-xs text-corpo break-words">
                  {v.participantes
                    .map((p) => (v.participantes.length > 1 ? `${p.nome} (${formatarPercentual(p.partePercentual)})` : p.nome))
                    .join(" · ")}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
