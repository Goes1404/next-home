import Link from "next/link";
import { CopiarLink } from "./CopiarLink";
import { getCorretorLogado, getMeusLeads } from "@/lib/corretorSessao";
import { site } from "@/lib/site";

const ATALHOS = [
  { href: "/corretor/funil", titulo: "Funil de vendas", texto: "Da chegada ao fechamento." },
  { href: "/corretor/leads", titulo: "Meus leads", texto: "Contatos que chegaram por você." },
  { href: "/corretor/links", titulo: "Links por imóvel", texto: "Link atribuído de cada empreendimento." },
];

export default async function PainelInicio() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null; // o layout já mostra o aviso de conta sem vínculo

  const leads = await getMeusLeads();
  // Só a etapa "novo" é uma pendência de verdade. Contar o funil inteiro
  // transformaria o aviso num número que nunca desce, e todo aviso que nunca
  // desce vira paisagem.
  const novos = leads.filter((lead) => lead.etapa === "novo").length;

  const hoje = new Date();
  const visitasHoje = leads.filter((lead) => {
    if (lead.etapa !== "visita_agendada" || !lead.visitaAgendadaEm) return false;
    const data = new Date(lead.visitaAgendadaEm);
    return (
      data.getFullYear() === hoje.getFullYear() &&
      data.getMonth() === hoje.getMonth() &&
      data.getDate() === hoje.getDate()
    );
  }).length;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/10 bg-ink-900/50 p-6 sm:p-7">
        <p className="text-fluid-sm text-mist-400">Seu link pessoal</p>
        <p className="text-fluid-sm mt-1 text-mist-300">
          Enquanto um cliente navegar por ele, todo botão de WhatsApp do site — em qualquer
          imóvel — fala com você.
        </p>
        <CopiarLink link={`${site.url}/?corretor=${corretor.slug}`} />
      </section>

      <section className="space-y-3">
        <h2 className="text-fluid-sm font-medium text-mist-400 uppercase tracking-wider">Resumo do Dia</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {novos > 0 && (
            <Link
              href="/corretor/funil"
              className="block rounded-2xl border border-brand-400/30 bg-brand-900/25 p-5 transition-colors hover:border-brand-400/50"
            >
              <p className="font-display text-lg text-mist-50">
                {novos} lead{novos === 1 ? "" : "s"} novo{novos === 1 ? "" : "s"}
              </p>
              <p className="text-fluid-xs mt-1 text-brand-200/80">Sem primeiro atendimento</p>
            </Link>
          )}

          {visitasHoje > 0 && (
            <Link
              href="/corretor/visitas"
              className="block rounded-2xl border border-azure-400/30 bg-azure-900/25 p-5 transition-colors hover:border-azure-400/50"
            >
              <p className="font-display text-lg text-mist-50">
                {visitasHoje} visita{visitasHoje === 1 ? "" : "s"} agendada
                {visitasHoje === 1 ? "" : "s"}
              </p>
              <p className="text-fluid-xs mt-1 text-azure-200/80">Para hoje</p>
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {ATALHOS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="rounded-2xl border border-white/10 bg-ink-900/50 p-5 transition-colors hover:border-brand-300/40"
          >
            <p className="font-display text-mist-50">{a.titulo}</p>
            <p className="text-fluid-sm mt-1 text-mist-400">{a.texto}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
