import type { Metadata } from "next";
import Link from "next/link";
import { getMeusLeads } from "@/lib/corretorSessao";
import { linkWhatsappPara } from "@/lib/site";
import type { Lead } from "@/lib/types";

export const metadata: Metadata = { title: "Meus leads" };

const ROTULO_DETALHE: Record<string, string> = {
  imovelTipo: "Tipo",
  imovelCidade: "Cidade",
  imovelBairro: "Bairro",
  intencao: "Intenção",
};

const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function CartaoLead({ lead }: { lead: Lead }) {
  const ehProprietario = lead.tipo === "proprietario";
  const whatsapp = lead.telefone
    ? linkWhatsappPara(
        lead.telefone.replace(/\D/g, "").length <= 11
          ? `55${lead.telefone.replace(/\D/g, "")}`
          : lead.telefone.replace(/\D/g, ""),
        `Olá, ${lead.nome.split(" ")[0]}! Aqui é da Next Home, recebi seu contato pelo site.`,
      )
    : null;

  return (
    <article className="rounded-2xl border border-white/10 bg-ink-900/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-display text-lg text-mist-50">{lead.nome}</p>
          <p className="text-fluid-xs mt-0.5 text-mist-500">
            {dataHora.format(new Date(lead.criadoEm))}
          </p>
        </div>
        <span
          className={
            ehProprietario
              ? "text-fluid-xs rounded-full bg-sand-400/90 px-2.5 py-1 font-medium text-ink-950"
              : "text-fluid-xs rounded-full bg-brand-500/20 px-2.5 py-1 font-medium text-brand-200"
          }
        >
          {ehProprietario ? "Tem imóvel" : "Quer comprar"}
        </span>
      </div>

      <dl className="text-fluid-sm mt-4 space-y-1 text-mist-300">
        {lead.telefone && (
          <div>
            <dt className="inline text-mist-500">Telefone </dt>
            <dd className="inline">{lead.telefone}</dd>
          </div>
        )}
        {lead.email && (
          <div>
            <dt className="inline text-mist-500">E-mail </dt>
            <dd className="inline break-all">{lead.email}</dd>
          </div>
        )}
        {lead.empreendimento && (
          <div>
            <dt className="inline text-mist-500">Interesse </dt>
            <dd className="inline">
              <Link
                href={`/empreendimentos/${lead.empreendimento.slug}`}
                className="text-brand-200 underline-offset-4 hover:underline"
              >
                {lead.empreendimento.nome}
              </Link>
            </dd>
          </div>
        )}
        {lead.detalhes &&
          Object.entries(lead.detalhes).map(([chave, valor]) => (
            <div key={chave}>
              <dt className="inline text-mist-500">{ROTULO_DETALHE[chave] ?? chave} </dt>
              <dd className="inline">{valor}</dd>
            </div>
          ))}
      </dl>

      {lead.mensagem && (
        <p className="text-fluid-sm mt-3 rounded-xl border border-white/5 bg-ink-950/50 px-4 py-3 whitespace-pre-line text-mist-200">
          {lead.mensagem}
        </p>
      )}

      {whatsapp && (
        <a
          href={whatsapp}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex rounded-full bg-brand-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-400"
        >
          Responder no WhatsApp
        </a>
      )}
    </article>
  );
}

export default async function LeadsPage() {
  const { leads, permitido } = await getMeusLeads();

  return (
    <div>
      <h1 className="text-fluid-2xl text-mist-50">Meus leads</h1>
      <p className="text-fluid-sm mt-2 text-mist-400">
        Contatos recebidos pelos formulários do site que chegaram atribuídos a você.
      </p>

      {/*
        Distingue "não tenho permissão" de "não tem lead". Sem isso, enquanto a
        migration 0006 não roda a tela mentiria dizendo que não há contatos.
      */}
      {!permitido ? (
        <div className="mt-8 rounded-2xl border border-sand-400/30 bg-sand-400/10 p-6">
          <p className="font-display text-mist-50">Permissão ainda não liberada</p>
          <p className="text-fluid-sm mt-2 text-mist-300">
            A leitura de leads depende de um ajuste no banco de dados que ainda não foi
            aplicado. Assim que ele rodar, seus contatos aparecem aqui automaticamente.
          </p>
        </div>
      ) : leads.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-white/10 bg-ink-900/50 p-6">
          <p className="text-fluid-sm text-mist-300">
            Nenhum contato ainda. Compartilhe seu link pessoal — todo formulário preenchido a
            partir dele chega aqui com seu nome.
          </p>
          <Link
            href="/corretor/links"
            className="text-fluid-sm mt-3 inline-block font-medium text-brand-200 underline-offset-4 hover:underline"
          >
            Pegar meus links →
          </Link>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {leads.map((lead) => (
            <CartaoLead key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </div>
  );
}
