import type { Metadata } from "next";
import Link from "next/link";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getVendas } from "@/lib/financeiro/dados";
import { montarPainelDeVendas } from "@/lib/financeiro/painelDeVendas";
import { formatarPercentual, formatarReais, hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { CabecalhoDeTela } from "../_componentes/CabecalhoDeTela";
import { PainelDeVendas } from "./PainelDeVendas";

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
  const painel = montarPainelDeVendas(vendas, { corretorId: gestor ? null : corretor.id, hoje: hojeEmSaoPaulo() });

  return (
    <div>
      {cabecalho}

      <PainelDeVendas painel={painel} gestor={gestor} />

      <h2 className="text-fluid-base text-titulo mt-6 font-medium">Todas as vendas</h2>
      {vendas.length === 0 ? (
        <div className="cartao mt-4 space-y-3 p-5">
          <p className="text-fluid-base text-titulo font-medium">Nenhuma venda registrada ainda.</p>
          <p className="text-fluid-sm text-corpo">
            Registre a primeira pelo botão acima, ou pela ficha do lead quando ele chegar a Fechado.
          </p>
        </div>
      ) : (
        <ul className="mt-3 space-y-3">
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
