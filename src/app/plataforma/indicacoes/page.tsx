import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import {
  descricaoDaRecompensa,
  ROTULO_DO_STATUS_DA_INDICACAO,
  type StatusDaIndicacao,
} from "@/lib/indicacoes/indicacao";
import { listarIndicacoes } from "@/lib/plataforma/indicacoes";
import { AplicarCredito } from "../AplicarCredito";

export const metadata: Metadata = { title: "Indicações" };

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short" });
const REAL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Classes por extenso: montada em tempo de execução, a classe não existiria. */
const COR_DO_STATUS: Record<StatusDaIndicacao, string> = {
  aguardando_pagamento: "bg-campo text-apoio border-linha-forte",
  credito_gerado: "bg-alerta-lavado text-alerta border-alerta-linha",
  credito_aplicado: "bg-ok-lavado text-ok border-ok-linha",
  conta_cancelada: "bg-perigo-lavado text-perigo border-perigo-linha",
};

/**
 * Todas as indicações do "indique e ganhe" (0247, 29/10/2026): quem indicou
 * quem, a situação e o crédito. Os créditos gerados e ainda não aplicados
 * vêm primeiro: são o trabalho da Astro (dar o desconto na cobrança de quem
 * indicou e marcar aqui). A guarda vem antes de tudo; a leitura pede a prova.
 */
export default async function IndicacoesPage() {
  const prova = await exigirAdminDaPlataformaNaPagina();
  const indicacoes = await listarIndicacoes(prova);
  const aAplicar = indicacoes.filter((i) => i.status === "credito_gerado");
  const resto = indicacoes.filter((i) => i.status !== "credito_gerado");

  const linha = (i: (typeof indicacoes)[number]) => (
    <li key={i.id} className="cartao flex min-w-0 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-fluid-sm text-corpo min-w-0 break-words">
          <Link href={`/plataforma/grupos/${i.indicadora.id}`} className="text-titulo font-medium underline-offset-4 hover:underline">
            {i.indicadora.nome}
          </Link>{" "}
          indicou{" "}
          <Link href={`/plataforma/grupos/${i.indicada.id}`} className="text-titulo font-medium underline-offset-4 hover:underline">
            {i.indicada.nome}
          </Link>
        </p>
        <span className={`text-fluid-xs shrink-0 rounded-full border px-2.5 py-1 ${COR_DO_STATUS[i.status]}`}>
          {ROTULO_DO_STATUS_DA_INDICACAO[i.status]}
        </span>
      </div>
      <p className="text-fluid-xs text-apoio">
        Em {DATA.format(new Date(i.criadoEm))} · código {i.codigo}
        {i.credito
          ? ` · crédito: ${i.credito.descricao}${i.credito.valorEstimado !== null ? ` (≈ ${REAL.format(i.credito.valorEstimado)})` : ""}`
          : ""}
      </p>
      {i.credito && !i.credito.aplicadoEm && <AplicarCredito grupoId={i.indicadora.id} creditoId={i.credito.id} />}
    </li>
  );

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <div>
        <Link href="/plataforma" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center">
          ← Contas
        </Link>
        <h1 className="font-display text-titulo text-fluid-2xl mt-1">Indicações</h1>
        <p className="text-fluid-sm text-apoio mt-2">
          Quando a conta indicada paga a primeira mensalidade, quem indicou ganha {descricaoDaRecompensa()}. O crédito
          não entra sozinho na cobrança: dê o desconto e marque como aplicado.
        </p>
      </div>

      <section aria-labelledby="titulo-a-aplicar" className="flex flex-col gap-3">
        <h2 id="titulo-a-aplicar" className="text-titulo text-fluid-lg font-display">
          Créditos a aplicar ({aAplicar.length})
        </h2>
        {aAplicar.length === 0 ? (
          <p className="cartao text-fluid-sm text-apoio p-5">Nenhum crédito esperando.</p>
        ) : (
          <ul className="flex flex-col gap-3">{aAplicar.map(linha)}</ul>
        )}
      </section>

      <section aria-labelledby="titulo-todas" className="flex flex-col gap-3">
        <h2 id="titulo-todas" className="text-titulo text-fluid-lg font-display">
          Todas as indicações ({resto.length})
        </h2>
        {resto.length === 0 ? (
          <p className="cartao text-fluid-sm text-apoio p-5">Nenhuma indicação ainda.</p>
        ) : (
          <ul className="flex flex-col gap-3">{resto.map(linha)}</ul>
        )}
      </section>
    </section>
  );
}
