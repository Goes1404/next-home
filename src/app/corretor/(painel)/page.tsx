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
        <div className="grid gap-3 grid-cols-2">
          {novos > 0 ? (
            <Link
              href="/corretor/funil"
              className="flex flex-col rounded-2xl border border-brand-400/30 bg-gradient-to-br from-brand-900/40 to-brand-950/20 p-5 transition-colors hover:border-brand-400/50"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/20 text-brand-300">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              </div>
              <p className="font-display text-2xl text-mist-50">{novos}</p>
              <p className="text-fluid-xs mt-1 text-brand-200/80 leading-tight">Novo{novos === 1 ? "" : "s"} Lead{novos === 1 ? "" : "s"}</p>
            </Link>
          ) : (
            <div className="flex flex-col rounded-2xl border border-white/5 bg-ink-900/30 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-mist-500">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              </div>
              <p className="font-display text-2xl text-mist-400">0</p>
              <p className="text-fluid-xs mt-1 text-mist-500 leading-tight">Novos Leads</p>
            </div>
          )}

          {visitasHoje > 0 ? (
            <Link
              href="/corretor/visitas"
              className="flex flex-col rounded-2xl border border-azure-400/30 bg-gradient-to-br from-azure-900/40 to-azure-950/20 p-5 transition-colors hover:border-azure-400/50"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-azure-500/20 text-azure-300">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
              </div>
              <p className="font-display text-2xl text-mist-50">{visitasHoje}</p>
              <p className="text-fluid-xs mt-1 text-azure-200/80 leading-tight">Visita{visitasHoje === 1 ? "" : "s"} Hoje</p>
            </Link>
          ) : (
            <div className="flex flex-col rounded-2xl border border-white/5 bg-ink-900/30 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-mist-500">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
              </div>
              <p className="font-display text-2xl text-mist-400">0</p>
              <p className="text-fluid-xs mt-1 text-mist-500 leading-tight">Visitas Hoje</p>
            </div>
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
