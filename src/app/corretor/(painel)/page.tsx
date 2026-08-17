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

      {novos > 0 && (
        <section className="rounded-2xl border border-brand-400/30 bg-brand-900/25 p-6">
          <p className="font-display text-lg text-mist-50">
            {novos} contato{novos === 1 ? "" : "s"} sem primeiro atendimento
          </p>
          <Link
            href="/corretor/funil"
            className="text-fluid-sm mt-2 inline-block font-medium text-brand-200 underline-offset-4 hover:underline"
          >
            Abrir o funil →
          </Link>
        </section>
      )}

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
