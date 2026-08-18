import Link from "next/link";
import { CopiarLink } from "./CopiarLink";
import { getCliquesWhatsappCorretor, getCorretorLogado, getMeusLeads } from "@/lib/corretorSessao";
import { site } from "@/lib/site";

const ATALHOS = [
  { href: "/corretor/funil", titulo: "Funil de vendas", texto: "Da chegada ao fechamento." },
  { href: "/corretor/leads", titulo: "Meus leads", texto: "Contatos que chegaram por você." },
  { href: "/corretor/links", titulo: "Links por imóvel", texto: "Link atribuído de cada empreendimento." },
];

export default async function PainelInicio() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null; // o layout já mostra o aviso de conta sem vínculo

  const [leads, cliques] = await Promise.all([
    getMeusLeads(),
    getCliquesWhatsappCorretor(),
  ]);

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
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
          {/* Widget 1: Cliques no WhatsApp */}
          <div className="flex flex-col rounded-2xl border border-[#25D366]/30 bg-gradient-to-br from-[#25D366]/15 via-ink-900/40 to-ink-950/20 p-5 shadow-[0_4px_20px_rgba(0,0,0,0.3)]">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366]/20 text-[#25D366]">
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M12.04 2c-5.52 0-10 4.48-10 10 0 1.77.46 3.45 1.27 4.9L2 22l5.25-1.38a9.96 9.96 0 0 0 4.79 1.22h.01c5.52 0 10-4.48 10-10s-4.48-9.84-10.01-9.84Zm5.85 14.1c-.25.7-1.45 1.34-2 1.42-.51.08-1.16.11-1.87-.12-.43-.14-.98-.32-1.69-.62-2.97-1.28-4.9-4.27-5.05-4.47-.15-.2-1.21-1.6-1.21-3.06s.77-2.17 1.04-2.47c.27-.3.6-.37.8-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.25.6.85 2.07.92 2.22.07.15.12.33.02.53-.1.2-.15.32-.3.5-.15.18-.31.4-.44.53-.15.15-.3.31-.13.6.17.3.77 1.27 1.65 2.06 1.14 1.02 2.1 1.33 2.4 1.48.3.15.47.13.65-.08.18-.2.75-.87.95-1.17.2-.3.4-.25.67-.15.27.1 1.73.82 2.02.97.3.15.5.22.57.35.07.13.07.75-.18 1.45Z"/></svg>
            </div>
            {/* `null` = a contagem falhou. Mostrar "0" aqui faria o corretor
                achar que o link parou de converter. */}
            <p className="font-display text-2xl text-mist-50">{cliques ? cliques.hoje : "—"}</p>
            <p className="text-fluid-xs mt-1 text-[#25D366] leading-tight">
              {cliques === null
                ? "Contagem indisponível"
                : cliques.hoje === 1
                ? "Redirecionamento hoje"
                : "Redirecionamentos hoje"}
            </p>
            <p className="text-[11px] mt-1 text-mist-500">
              {cliques ? `${cliques.total} no total acumulado` : "Tente recarregar em instantes"}
            </p>
          </div>

          {/* Widget 2: Novos Leads */}
          {novos > 0 ? (
            <Link
              href="/corretor/funil"
              className="flex flex-col rounded-2xl border border-brand-400/30 bg-gradient-to-br from-brand-900/40 to-brand-950/20 p-5 transition-colors hover:border-brand-400/50 shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand-500/20 text-brand-300">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              </div>
              <p className="font-display text-2xl text-mist-50">{novos}</p>
              <p className="text-fluid-xs mt-1 text-brand-200/80 leading-tight">Novo{novos === 1 ? "" : "s"} Lead{novos === 1 ? "" : "s"}</p>
              <p className="text-[11px] mt-1 text-mist-500">Sem primeiro atendimento</p>
            </Link>
          ) : (
            <div className="flex flex-col rounded-2xl border border-white/5 bg-ink-900/30 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-mist-500">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
              </div>
              <p className="font-display text-2xl text-mist-400">0</p>
              <p className="text-fluid-xs mt-1 text-mist-500 leading-tight">Novos Leads</p>
              <p className="text-[11px] mt-1 text-mist-500">Tudo em dia</p>
            </div>
          )}

          {/* Widget 3: Visitas Hoje */}
          {visitasHoje > 0 ? (
            <Link
              href="/corretor/visitas"
              className="flex flex-col rounded-2xl border border-azure-400/30 bg-gradient-to-br from-azure-900/40 to-azure-950/20 p-5 transition-colors hover:border-azure-400/50 shadow-[0_4px_20px_rgba(0,0,0,0.3)]"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-azure-500/20 text-azure-300">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
              </div>
              <p className="font-display text-2xl text-mist-50">{visitasHoje}</p>
              <p className="text-fluid-xs mt-1 text-azure-200/80 leading-tight">Visita{visitasHoje === 1 ? "" : "s"} Hoje</p>
              <p className="text-[11px] mt-1 text-mist-500">Agendadas para hoje</p>
            </Link>
          ) : (
            <div className="flex flex-col rounded-2xl border border-white/5 bg-ink-900/30 p-5">
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-mist-500">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>
              </div>
              <p className="font-display text-2xl text-mist-400">0</p>
              <p className="text-fluid-xs mt-1 text-mist-500 leading-tight">Visitas Hoje</p>
              <p className="text-[11px] mt-1 text-mist-500">Nenhuma visita marcada</p>
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
