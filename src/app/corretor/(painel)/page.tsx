import Link from "next/link";
import { CopiarLink } from "./CopiarLink";
import { getCorretorLogado, getMeusLeads } from "@/lib/corretorSessao";
import { site } from "@/lib/site";

const ATALHOS = [
  { href: "/corretor/leads", titulo: "Meus leads", texto: "Contatos que chegaram por você." },
  { href: "/corretor/links", titulo: "Links por imóvel", texto: "Link atribuído de cada empreendimento." },
  { href: "/corretor/perfil", titulo: "Meu perfil", texto: "Foto, WhatsApp e apresentação." },
];

export default async function PainelInicio() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null; // o layout já mostra o aviso de conta sem vínculo

  const leads = await getMeusLeads();

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

      {leads.length > 0 && (
        <section className="rounded-2xl border border-brand-400/30 bg-brand-900/25 p-6">
          <p className="font-display text-lg text-mist-50">
            {leads.length} contato{leads.length === 1 ? "" : "s"} esperando você
          </p>
          <Link
            href="/corretor/leads"
            className="text-fluid-sm mt-2 inline-block font-medium text-brand-200 underline-offset-4 hover:underline"
          >
            Ver meus leads →
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
