import type { Metadata } from "next";
import { ListaLinks } from "./ListaLinks";
import { CopiarLink } from "../CopiarLink";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getEmpreendimentos } from "@/lib/queries";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Links" };

export default async function LinksPage() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const empreendimentos = await getEmpreendimentos();

  return (
    <div>
      <h1 className="text-fluid-2xl text-mist-50">Seus links</h1>
      <p className="text-fluid-sm mt-2 text-mist-400">
        Qualquer um destes links atribui o atendimento a você — inclusive em imóveis de outro
        corretor responsável.
      </p>

      <section className="mt-8 rounded-2xl border border-white/10 bg-ink-900/50 p-6">
        <p className="font-display text-mist-50">Portfólio completo</p>
        <p className="text-fluid-sm mt-1 text-mist-400">
          Para quando o cliente ainda não sabe o que procura.
        </p>
        <CopiarLink link={`${site.url}/?corretor=${corretor.slug}`} />
      </section>

      <section className="mt-10">
        <p className="font-display text-mist-50">Um imóvel específico</p>
        <p className="text-fluid-sm mt-1 mb-5 text-mist-400">
          {empreendimentos.length} empreendimentos disponíveis.
        </p>
        <ListaLinks
          itens={empreendimentos.map((e) => ({
            slug: e.slug,
            nome: e.nome,
            bairro: e.bairro,
            cidade: e.cidade,
          }))}
          slugCorretor={corretor.slug}
          baseUrl={site.url}
        />
      </section>
    </div>
  );
}
