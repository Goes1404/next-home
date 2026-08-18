import Link from "next/link";
import { CopiarLink } from "./CopiarLink";
import { TermometroFunil } from "./_componentes/TermometroFunil";
import { getCliquesWhatsappCorretor, getCorretorLogado, getMeusLeads } from "@/lib/corretorSessao";
import { site } from "@/lib/site";

const ATALHOS = [
  { href: "/corretor/leads", titulo: "Meus leads", texto: "Contatos que chegaram por você." },
  { href: "/corretor/links", titulo: "Links por imóvel", texto: "Link atribuído de cada empreendimento." },
  { href: "/corretor/imoveis", titulo: "Catálogo", texto: "Fotos, textos e preços dos imóveis." },
];

export default async function PainelInicio() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null; // o layout já mostra o aviso de conta sem vínculo

  const [leads, cliques] = await Promise.all([getMeusLeads(), getCliquesWhatsappCorretor()]);

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

  const primeiroNome = corretor.nome.split(" ")[0];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-titulo text-fluid-2xl">Olá, {primeiroNome}</h1>
        <p className="text-fluid-sm text-apoio mt-1">
          {novos === 0 && visitasHoje === 0
            ? "Nada pendente por aqui. Bom momento para divulgar seu link."
            : [
                novos > 0 && `${novos} lead${novos === 1 ? "" : "s"} sem primeiro atendimento`,
                visitasHoje > 0 && `${visitasHoje} visita${visitasHoje === 1 ? "" : "s"} hoje`,
              ]
                .filter(Boolean)
                .join(" · ")}
        </p>
      </div>

      {/*
        O link e os cliques ficam lado a lado porque são a mesma história: o
        link é o que o corretor distribui, e o contador é a resposta de quem
        usou. Separados em cartões distantes, o número perdia a causa.
      */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="border-linha bg-superficie shadow-painel rounded-2xl border p-5 sm:p-6">
          <p className="text-fluid-sm text-titulo font-medium">Seu link pessoal</p>
          <p className="text-fluid-sm text-apoio mt-1">
            Enquanto um cliente navegar por ele, todo botão de WhatsApp do site — em qualquer
            imóvel — fala com você.
          </p>
          <CopiarLink link={`${site.url}/?corretor=${corretor.slug}`} />
        </div>

        <div className="border-linha bg-superficie shadow-painel flex flex-col justify-center rounded-2xl border p-5 sm:p-6">
          <span className="text-tenue text-[11px] font-medium tracking-[0.14em] uppercase">
            Cliques hoje
          </span>
          {/* `null` = a contagem falhou. Mostrar "0" aqui faria o corretor
              achar que o link parou de converter. */}
          <p className="font-display text-titulo mt-1 text-4xl tabular-nums">
            {cliques ? cliques.hoje : "—"}
          </p>
          <p className="text-fluid-xs text-apoio mt-1">
            {cliques === null
              ? "Contagem indisponível — tente recarregar em instantes"
              : `${cliques.total} no total acumulado`}
          </p>
        </div>
      </section>

      <TermometroFunil leads={leads} />

      {(novos > 0 || visitasHoje > 0) && (
        <section className="grid gap-4 sm:grid-cols-2">
          {novos > 0 && (
            <Pendencia
              href="/corretor/funil"
              quantidade={novos}
              titulo={`Novo${novos === 1 ? "" : "s"} lead${novos === 1 ? "" : "s"}`}
              texto="Ainda sem primeiro atendimento"
              tom="acento"
            />
          )}
          {visitasHoje > 0 && (
            <Pendencia
              href="/corretor/visitas"
              quantidade={visitasHoje}
              titulo={`Visita${visitasHoje === 1 ? "" : "s"} hoje`}
              texto="Agendadas para as próximas horas"
              tom="azul"
            />
          )}
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        {ATALHOS.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="border-linha bg-superficie shadow-painel hover:border-acento-linha rounded-2xl border p-5 transition-colors"
          >
            <p className="font-display text-titulo">{a.titulo}</p>
            <p className="text-fluid-sm text-apoio mt-1">{a.texto}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}

/**
 * Cartão de pendência. Só aparece quando há o que fazer — um alerta que
 * mostra "0" ensina a ignorá-lo.
 */
function Pendencia({
  href,
  quantidade,
  titulo,
  texto,
  tom,
}: {
  href: string;
  quantidade: number;
  titulo: string;
  texto: string;
  tom: "acento" | "azul";
}) {
  const cor =
    tom === "acento"
      ? "border-acento-linha bg-acento-lavado text-acento-suave"
      : "border-etapa-azul-linha bg-etapa-azul-lavado text-etapa-azul";

  return (
    <Link
      href={href}
      className={`flex items-center gap-4 rounded-2xl border p-5 transition-opacity hover:opacity-85 ${cor}`}
    >
      <span className="font-display text-3xl tabular-nums">{quantidade}</span>
      <span className="min-w-0">
        <span className="text-fluid-sm block font-medium">{titulo}</span>
        <span className="text-fluid-xs text-apoio block">{texto}</span>
      </span>
      <span aria-hidden className="text-apoio ml-auto">
        →
      </span>
    </Link>
  );
}
