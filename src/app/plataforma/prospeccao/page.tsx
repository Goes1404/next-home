import type { Metadata } from "next";
import Link from "next/link";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import { exigirEquipeDaProspeccaoNaPagina } from "@/lib/prospeccao/equipe";
import { createServiceClient } from "@/lib/supabase/service";
import { ETAPAS, ROTULO_DA_ETAPA, ehEtapa } from "@/lib/prospeccao/tipos";
import { ordenarParaOFunil, proximaAcao, temperatura, type Temperatura } from "@/lib/prospeccao/funil";
import { linkDaAmostra, linkDoWhatsapp, mensagemDeFollowup } from "@/lib/prospeccao/abordagem";
import { EnviarNoWhatsapp, NovaLoja } from "./Componentes";

export const metadata: Metadata = { title: "Prospecção" };

const DATA_E_HORA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

const COR_DA_TEMPERATURA: Record<Temperatura, string> = {
  quente: "bg-ok-lavado text-ok border-ok-linha",
  morna: "bg-alerta-lavado text-alerta border-alerta-linha",
  fria: "bg-vidro text-apoio border-linha",
  parada: "bg-vidro text-apoio border-linha",
};

/**
 * A aba Prospecção (0253, 02/11/2026): o funil das lojas abordadas pela
 * Astro, com quem abriu a amostra em destaque. Só o administrador da
 * plataforma; a chave de serviço só depois da guarda, e só nas tabelas
 * globais `prospeccao_*`.
 */
export default async function ProspeccaoPage({ searchParams }: { searchParams: Promise<{ etapa?: string }> }) {
  const prova = await exigirAdminDaPlataformaNaPagina();
  await exigirEquipeDaProspeccaoNaPagina(prova);
  const { etapa: filtro } = await searchParams;
  const etapa = ehEtapa(filtro) ? filtro : null;

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("prospeccao_leads")
    .select("id, nome, segmento, cidade, bairro, etapa, whatsapp, mensagem, slug, nao_contatar, enviado_em, visitas, ultima_visita_em, updated_at")
    .order("updated_at", { ascending: false })
    .limit(500);
  const todas = data ?? [];
  const contagem = Object.fromEntries(ETAPAS.map((e) => [e, todas.filter((l) => l.etapa === e).length])) as Record<string, number>;
  const agora = new Date();
  const lista = ordenarParaOFunil(etapa ? todas.filter((l) => l.etapa === etapa) : todas, agora);
  const quentes = todas.filter((l) => temperatura(l, agora) === "quente").length;
  const abordadas = todas.filter((l) => l.enviado_em).length;
  const abriram = todas.filter((l) => l.enviado_em && l.visitas > 0).length;

  const chip = (rotulo: string, href: string, ativo: boolean, n: number) => (
    <Link
      key={href}
      href={href}
      aria-current={ativo ? "page" : undefined}
      className={`text-fluid-sm inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 ${ativo ? "bg-acento-lavado text-titulo border-acento font-semibold" : "border-linha text-corpo hover:text-titulo"}`}
    >
      {rotulo}
      <span className="text-fluid-xs text-apoio">{n}</span>
    </Link>
  );

  return (
    <section className="flex max-w-5xl flex-col gap-6">
      <div>
        <h1 className="font-display text-fluid-2xl text-titulo font-semibold">Prospecção</h1>
        <p className="text-fluid-sm text-apoio mt-1 text-pretty">
          As lojas abordadas pela Astro, cada uma com a amostra de site dela. Quem abriu a amostra e ainda não respondeu
          aparece primeiro: é o melhor momento do follow-up.
        </p>
      </div>

      {error ? (
        <p className="cartao text-fluid-sm text-perigo p-5">Não consegui ler as lojas. A migration 0253 foi aplicada?</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Lojas", todas.length],
              ["Abordadas", abordadas],
              ["Abriram a amostra", abriram],
              ["Quentes agora", quentes],
            ].map(([rotulo, n]) => (
              <div key={rotulo as string} className="cartao flex flex-col gap-1 p-4">
                <dt className="text-fluid-xs text-apoio">{rotulo}</dt>
                <dd className="font-display text-titulo text-fluid-2xl">{n}</dd>
              </div>
            ))}
          </dl>

          <nav aria-label="Etapas do funil" className="flex gap-2 overflow-x-auto pb-1">
            {chip("Todas", "/plataforma/prospeccao", !etapa, todas.length)}
            {ETAPAS.map((e) => chip(ROTULO_DA_ETAPA[e], `/plataforma/prospeccao?etapa=${e}`, etapa === e, contagem[e]))}
          </nav>

          <NovaLoja />

          {lista.length === 0 ? (
            <p className="cartao text-fluid-sm text-apoio p-5">Nenhuma loja nesta etapa.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {lista.map((l) => {
                const t = temperatura(l, agora);
                const followup = t === "fria";
                const texto = followup ? mensagemDeFollowup({ link: linkDaAmostra(l.slug) }) : l.mensagem;
                const link = l.whatsapp && texto ? linkDoWhatsapp(l.whatsapp, texto) : null;
                const bloqueado = l.nao_contatar ? "Pediu para não receber mensagens" : null;
                return (
                  <li key={l.id} className="cartao flex flex-col gap-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={`/plataforma/prospeccao/${l.id}`} className="text-titulo text-fluid-base font-medium underline-offset-4 hover:underline">
                          {l.nome}
                        </Link>
                        <p className="text-fluid-xs text-apoio">
                          {[l.segmento, [l.cidade, l.bairro].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <span className="text-fluid-xs border-linha text-corpo shrink-0 rounded-full border px-2.5 py-1">
                        {ehEtapa(l.etapa) ? ROTULO_DA_ETAPA[l.etapa] : l.etapa}
                      </span>
                    </div>
                    <p className="text-fluid-sm flex flex-wrap items-center gap-2">
                      <span className={`text-fluid-xs rounded-full border px-2.5 py-1 ${COR_DA_TEMPERATURA[t]}`}>{proximaAcao(l, agora)}</span>
                      <span className="text-fluid-xs text-apoio">
                        {l.visitas > 0
                          ? `Abriu ${l.visitas}x · última vez em ${DATA_E_HORA.format(new Date(l.ultima_visita_em!))}`
                          : "Ainda não abriu a amostra"}
                        {l.enviado_em ? ` · abordada em ${DATA_E_HORA.format(new Date(l.enviado_em))}` : ""}
                      </span>
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {l.etapa === "novo" || l.etapa === "aprovado" || t === "fria" ? (
                        <EnviarNoWhatsapp id={l.id} link={link} bloqueado={bloqueado} rotulo={followup ? "Enviar follow-up" : "Enviar no WhatsApp"} />
                      ) : null}
                      <a
                        href={`/astro/amostra/${l.slug}?previa=1`}
                        target="_blank"
                        rel="noopener"
                        className="botao-secundario text-fluid-sm text-titulo inline-flex min-h-11 items-center rounded-full px-4 font-medium"
                      >
                        Ver amostra
                      </a>
                      <Link
                        href={`/plataforma/prospeccao/${l.id}`}
                        className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center px-2"
                      >
                        Abrir ficha
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
