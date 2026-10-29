import type { Metadata } from "next";
import Link from "next/link";
import { Mail, MessageCircle } from "lucide-react";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import {
  ROTULO_DA_ORIGEM,
  ROTULO_DO_ASSUNTO,
  ROTULO_DO_STATUS_DO_CHAMADO,
  STATUS_DO_CHAMADO,
  type StatusDoChamado,
} from "@/lib/plataforma/chamadoDeSuporte";
import { lerFiltroDoChamado, listarChamados, nomesDasContas, type FiltroDoChamado } from "@/lib/plataforma/chamados";
import { mascararWhatsapp, primeiroNome } from "@/lib/plataforma/pedidoDeContratacao";
import { AndamentoDoChamado } from "./AndamentoDoChamado";

export const metadata: Metadata = { title: "Suporte e contato" };

const DATA_E_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

/** Classes por extenso: montada em tempo de execução, a classe não existiria. */
const COR_DO_STATUS: Record<StatusDoChamado, string> = {
  novo: "bg-acento-lavado text-titulo border-acento",
  em_atendimento: "bg-alerta-lavado text-alerta border-alerta-linha",
  resolvido: "bg-ok-lavado text-ok border-ok-linha",
};

const COR_DA_ORIGEM = {
  site: "bg-vidro text-corpo border-linha-forte",
  painel: "bg-acento-lavado text-acento-suave border-acento-linha",
} as const;

const FILTROS: { valor: FiltroDoChamado; rotulo: string }[] = [
  { valor: "abertos", rotulo: "Em aberto" },
  ...STATUS_DO_CHAMADO.map((s) => ({ valor: s, rotulo: ROTULO_DO_STATUS_DO_CHAMADO[s] })),
  { valor: "todos", rotulo: "Todos" },
];

function hrefDoFiltro(f: FiltroDoChamado): string {
  return f === "abertos" ? "/plataforma/suporte" : `/plataforma/suporte?status=${f}`;
}

type Busca = Promise<{ status?: string | string[] }>;

/**
 * Suporte e contato (29/10/2026, 0240): os chamados que chegam pelo painel
 * (`/corretor/suporte`) e os contatos do site (`/astro/contato`). Mais novos
 * primeiro; por padrão só os em aberto (novo e em atendimento). Cada cartão
 * tem a origem, o assunto, a mensagem, o contato (WhatsApp para o contato do
 * site, e-mail para os dois), a conta de onde veio o chamado do painel e o
 * andamento (status e anotação interna).
 *
 * A guarda aqui, e não só no layout (layout não re-executa entre rotas
 * irmãs); é dela que sai a prova que a leitura pede.
 */
export default async function SuportePage({ searchParams }: { searchParams: Busca }) {
  const prova = await exigirAdminDaPlataformaNaPagina();
  const filtro = lerFiltroDoChamado((await searchParams).status);
  const chamados = await listarChamados(prova, filtro);
  const contas = await nomesDasContas(
    prova,
    chamados.map((c) => c.grupo_origem_id).filter((id): id is string => Boolean(id)),
  );

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/plataforma" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center">
          ← Contas
        </Link>
        <h1 className="font-display text-titulo text-fluid-2xl mt-1">Suporte e contato</h1>
        <p className="text-fluid-sm text-apoio mt-2 max-w-2xl">
          Quem escreveu para a Astro: clientes pelo painel e visitantes pelo site. A promessa é responder em até 1 dia
          útil.
        </p>
      </div>

      <nav aria-label="Filtrar por status" className="flex flex-wrap gap-2">
        {FILTROS.map((f) => (
          <Link
            key={f.valor}
            href={hrefDoFiltro(f.valor)}
            aria-current={filtro === f.valor ? "page" : undefined}
            className={`text-fluid-sm flex min-h-11 items-center rounded-full border px-4 ${
              filtro === f.valor ? "border-acento bg-acento-lavado text-titulo font-bold" : "border-linha-forte text-corpo"
            }`}
          >
            {f.rotulo}
          </Link>
        ))}
      </nav>

      {chamados.length === 0 ? (
        <p className="cartao text-fluid-sm text-apoio p-5">Nenhum chamado neste filtro.</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {chamados.map((ch) => {
            const conversa = ch.whatsapp
              ? `https://wa.me/${ch.whatsapp}?text=${encodeURIComponent(
                  `Olá, ${primeiroNome(ch.nome)}! Aqui é da Astro Soluções, sobre a sua mensagem pelo site.`,
                )}`
              : null;
            const email = ch.email
              ? `mailto:${ch.email}?subject=${encodeURIComponent(`Astro Soluções: ${ROTULO_DO_ASSUNTO[ch.assunto]}`)}`
              : null;
            const conta = ch.grupo_origem_id ? (contas.get(ch.grupo_origem_id) ?? "abrir a conta") : null;
            return (
              <li key={ch.id} className="cartao flex min-w-0 flex-col gap-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-titulo text-fluid-lg font-medium break-words">{ch.nome}</h2>
                    <p className="text-fluid-xs text-apoio">
                      {DATA_E_HORA.format(new Date(ch.criado_em))} · {ROTULO_DO_ASSUNTO[ch.assunto]}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={`text-fluid-xs rounded-full border px-2.5 py-1 ${COR_DA_ORIGEM[ch.origem]}`}>
                      {ROTULO_DA_ORIGEM[ch.origem]}
                    </span>
                    <span className={`text-fluid-xs rounded-full border px-2.5 py-1 ${COR_DO_STATUS[ch.status]}`}>
                      {ROTULO_DO_STATUS_DO_CHAMADO[ch.status]}
                    </span>
                  </div>
                </div>

                <p className="text-fluid-sm text-corpo break-words whitespace-pre-line">{ch.mensagem}</p>

                <dl className="text-fluid-sm grid grid-cols-2 gap-x-4 gap-y-2">
                  {conta && ch.grupo_origem_id && (
                    <div className="col-span-2 min-w-0">
                      <dt className="text-apoio text-fluid-xs">Conta</dt>
                      <dd className="text-titulo break-words">
                        <Link href={`/plataforma/grupos/${ch.grupo_origem_id}`} className="hover:text-acento underline underline-offset-4">
                          {conta}
                        </Link>
                      </dd>
                    </div>
                  )}
                  {ch.whatsapp && (
                    <div className="min-w-0">
                      <dt className="text-apoio text-fluid-xs">WhatsApp</dt>
                      <dd className="text-titulo">{mascararWhatsapp(ch.whatsapp)}</dd>
                    </div>
                  )}
                  {ch.email && (
                    <div className="col-span-2 min-w-0">
                      <dt className="text-apoio text-fluid-xs">E-mail</dt>
                      <dd className="text-titulo break-all">{ch.email}</dd>
                    </div>
                  )}
                </dl>

                <div className="flex flex-col gap-2 sm:flex-row">
                  {conversa && (
                    <a
                      href={conversa}
                      target="_blank"
                      rel="noopener"
                      className="text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium"
                    >
                      <MessageCircle className="h-4 w-4" aria-hidden /> Chamar no WhatsApp
                    </a>
                  )}
                  {email && (
                    <a
                      href={email}
                      className="text-fluid-sm botao-secundario text-titulo flex min-h-11 items-center justify-center gap-2 px-4 font-medium"
                    >
                      <Mail className="h-4 w-4" aria-hidden /> Responder por e-mail
                    </a>
                  )}
                </div>

                <div className="border-linha border-t pt-4">
                  <AndamentoDoChamado id={ch.id} status={ch.status} respostaInterna={ch.resposta_interna ?? ""} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
