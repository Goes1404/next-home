import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { lerVisitaRecebida } from "@/lib/agenda/lerVisitaRecebida";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { CartaoDaVisita } from "../../_componentes/CartaoDaVisita";

export const metadata: Metadata = { title: "Visita" };

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/**
 * A visita que o gestor passou para este corretor (0223). O lead é de outro:
 * a ficha normal não abre para ele, e a conversa do WhatsApp ele não vê.
 * Aqui vai o que a visita pede. Some quando a visita deixa de ser dele.
 */
export default async function VisitaRecebidaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const corretor = await getCorretorLogado();
  if (!corretor) return null;
  const recebida = await lerVisitaRecebida({ visitaId: id, corretorId: corretor.id, grupoId: corretor.grupoId });
  if (!recebida) notFound();

  return (
    <div>
      <CabecalhoDeTela
        secao="Agenda"
        titulo="Visita recebida"
        descricao="O gestor passou esta visita para você. O cliente continua com o corretor dele."
      />
      <div className="mt-6 space-y-4">
        <CartaoDaVisita visita={recebida.visita} preparo={recebida.preparo} comDia semFicha />
        {recebida.anotacoes.length > 0 && (
          <section className="cartao p-5" aria-labelledby="anotacoes-da-visita">
            <h2 id="anotacoes-da-visita" className="font-medium text-titulo">
              Anotações do cliente
            </h2>
            <ul className="mt-3 space-y-2">
              {recebida.anotacoes.map((a) => (
                <li key={a.id} className="text-fluid-sm break-words text-corpo">
                  <span className="text-apoio">{DATA.format(new Date(a.criadaEm))} · </span>
                  {a.texto}
                </li>
              ))}
            </ul>
          </section>
        )}
        <Link href="/corretor/agenda" className="botao-aba min-h-11">
          Voltar para a Agenda
        </Link>
      </div>
    </div>
  );
}
