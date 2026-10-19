import type { Metadata } from "next";
import Link from "next/link";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { lerFinanceiroDoDono } from "@/lib/financeiro/assistenteDados";
import type { Gravidade } from "@/lib/financeiro/alertas";
import { hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { CabecalhoDeTela } from "../../_componentes/CabecalhoDeTela";
import { ChatFinanceiro } from "./ChatFinanceiro";

export const metadata: Metadata = { title: "Alertas e IA" };

const COR: Record<Gravidade, string> = {
  perigo: "border-l-perigo",
  alerta: "border-l-alerta",
  info: "border-l-linha-forte",
};
const SELO: Record<Gravidade, string> = {
  perigo: "text-perigo",
  alerta: "text-alerta",
  info: "text-tenue",
};
const ROTULO: Record<Gravidade, string> = { perigo: "Urgente", alerta: "Atenção", info: "Para saber" };

/**
 * A IA do financeiro, só para o gestor (07/10/2026). Em cima, os alertas: são
 * contas (atraso, saldo negativo, mês aberto), não opinião, e saem sem IA. Em
 * baixo, a conversa, que só usa os números que o sistema já calculou.
 */
export default async function AssistenteFinanceiroPage() {
  await exigirGestorNaPagina();
  const leitura = await lerFinanceiroDoDono(hojeEmSaoPaulo());

  return (
    <div className="space-y-6">
      <CabecalhoDeTela
        secao="Financeiro"
        titulo="Alertas e IA"
        descricao="O que precisa da sua atenção no dinheiro da imobiliária, e um assistente para perguntar sobre ele."
      />

      <section className="space-y-3" aria-labelledby="alertas">
        <h2 id="alertas" className="text-titulo text-fluid-lg font-semibold">
          Alertas
        </h2>
        {!leitura.ok ? (
          <p className="cartao text-corpo p-4">
            {leitura.motivo === "sem_tabela" ? "O caixa ainda não foi ativado no banco." : "Não consegui ler os números agora. Recarregue a página."}
          </p>
        ) : leitura.alertas.length === 0 ? (
          <p className="cartao text-corpo p-4">Nada pendente: comissões em dia, contas pagas e o mês passado fechado.</p>
        ) : (
          <ul className="space-y-2">
            {leitura.alertas.map((a) => (
              <li key={a.id}>
                <Link
                  href={a.href}
                  className={`cartao hover:border-acento-linha block border-l-4 p-4 transition-colors ${COR[a.gravidade]}`}
                >
                  <span className={`text-[12px] font-semibold uppercase tracking-wide ${SELO[a.gravidade]}`}>{ROTULO[a.gravidade]}</span>
                  <span className="text-titulo mt-1 block font-medium break-words">{a.titulo} →</span>
                  <span className="text-corpo text-fluid-sm mt-1 block break-words">{a.detalhe}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3" aria-labelledby="pergunte">
        <h2 id="pergunte" className="text-titulo text-fluid-lg font-semibold">
          Pergunte
        </h2>
        <ChatFinanceiro />
      </section>
    </div>
  );
}
