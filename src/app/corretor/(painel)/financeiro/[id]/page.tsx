import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCorretorLogado, getEmpreendimentosParaFiltro, getEquipeAtiva } from "@/lib/corretorSessao";
import { getVenda } from "@/lib/financeiro/dados";
import { formatarPercentual, formatarReais } from "@/lib/financeiro/venda";
import { CabecalhoDeTela } from "../../_componentes/CabecalhoDeTela";
import { FormularioVenda } from "../FormularioVenda";

export const metadata: Metadata = { title: "Venda" };

const dataCurta = (iso: string) => {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

/**
 * Uma venda. Quem registrou edita até a comissão entrar; o gestor, sempre.
 * Os outros participantes LEEM (a RLS mostra, a policy de update não deixa
 * gravar) — por isso a tela decide entre formulário e leitura pela mesma
 * regra da policy, e não oferece um botão que o banco recusaria.
 */
export default async function VendaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const venda = await getVenda(id);
  if (!venda) notFound();

  const gestor = corretor.papel === "gestor";
  const editavel = gestor || (venda.registradaPor === corretor.id && !venda.comissaoRecebidaEm);

  const voltar = (
    <Link href="/corretor/financeiro" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center gap-1.5">
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
            venda.comissaoRecebidaEm
              ? "A comissão desta venda já entrou; só o gestor corrige."
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
        <ul className="cartao divide-linha divide-y p-2">
          {venda.participantes.map((p) => (
            <li key={p.corretorId} className="text-fluid-sm flex flex-wrap justify-between gap-2 p-3">
              <span className="text-titulo">
                {p.nome} · {formatarPercentual(p.partePercentual)} da venda
              </span>
              <span className="text-corpo">
                Repasse {formatarReais(p.repasseValor)} · {p.repassePagoEm ? "pago" : "a pagar"}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const [empreendimentos, equipe] = await Promise.all([getEmpreendimentosParaFiltro(), getEquipeAtiva()]);

  return (
    <div className="space-y-4">
      {voltar}
      <CabecalhoDeTela secao="Vendas" titulo="Editar venda" descricao={`${venda.imovel} · ${dataCurta(venda.dataVenda)}`} />
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
          status: venda.status,
          distratadaEm: venda.distratadaEm,
          observacao: venda.observacao ?? "",
          participantes: venda.participantes.map((p) => ({
            corretorId: p.corretorId,
            partePercentual: p.partePercentual,
            repassePercentual: p.repassePercentual,
            repasseValor: p.repasseValor,
          })),
        }}
        leadInicial={null}
        empreendimentos={empreendimentos}
        equipe={equipe.map((c) => ({ id: c.id, nome: c.nome }))}
        eu={{ id: corretor.id, nome: corretor.nome }}
        ultimoRepasse={null}
        podeExcluir={editavel}
      />
    </div>
  );
}
