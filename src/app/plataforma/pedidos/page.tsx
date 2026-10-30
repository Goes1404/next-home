import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, UserPlus } from "lucide-react";
import { exigirAdminDaPlataformaNaPagina } from "@/lib/guardas";
import {
  hrefDeCriarConta,
  mascararWhatsapp,
  resumoDoPlano,
  ROTULO_DO_STATUS,
  STATUS_DO_PEDIDO,
  type PlanoContratavel,
} from "@/lib/plataforma/pedidoDeContratacao";
import { gruposParaVincular, lerFiltroDeStatus, listarPedidos, type FiltroDeStatus } from "@/lib/plataforma/pedidos";
import { AndamentoDoPedido } from "./AndamentoDoPedido";

export const metadata: Metadata = { title: "Pedidos de contratação" };

const DATA_E_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

/** Classes por extenso: montada em tempo de execução, a classe não existiria. */
const COR_DO_STATUS: Record<(typeof STATUS_DO_PEDIDO)[number], string> = {
  novo: "bg-acento-lavado text-titulo border-acento",
  em_contato: "bg-alerta-lavado text-alerta border-alerta-linha",
  convertido: "bg-ok-lavado text-ok border-ok-linha",
  descartado: "bg-vidro text-apoio border-linha",
};

const FILTROS: { valor: FiltroDeStatus | "abertos"; rotulo: string }[] = [
  { valor: "abertos", rotulo: "Em aberto" },
  ...STATUS_DO_PEDIDO.map((s) => ({ valor: s, rotulo: ROTULO_DO_STATUS[s] })),
  { valor: "todos", rotulo: "Todos" },
];

function hrefDoFiltro(f: FiltroDeStatus | "abertos"): string {
  return f === "abertos" ? "/plataforma/pedidos" : `/plataforma/pedidos?status=${f}`;
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-apoio text-fluid-xs">{rotulo}</dt>
      <dd className="text-titulo break-words">{children}</dd>
    </div>
  );
}

type Busca = Promise<{ status?: string | string[] }>;

/**
 * Os pedidos que chegam pelo assistente da página de vendas
 * (`/astro/contratar`, 29/10/2026). Mais novos primeiro; por padrão só os em
 * aberto (novo e em contato). Cada cartão tem o WhatsApp para chamar, o
 * "Criar conta" no formulário certo já preenchido com o pedido, e o
 * andamento (status, observação e a conta que nasceu dele).
 *
 * A guarda aqui, e não só no layout (layout não re-executa entre rotas
 * irmãs); é dela que sai a prova que a leitura pede.
 */
export default async function PedidosPage({ searchParams }: { searchParams: Busca }) {
  const prova = await exigirAdminDaPlataformaNaPagina();
  const filtro = lerFiltroDeStatus((await searchParams).status);
  const [pedidos, grupos] = await Promise.all([listarPedidos(prova, filtro), gruposParaVincular(prova)]);
  const nomeDoGrupo = new Map(grupos.map((g) => [g.id, g.nome]));

  return (
    <section className="flex flex-col gap-6">
      <div>
        <Link href="/plataforma" className="text-fluid-sm text-apoio hover:text-titulo inline-flex min-h-11 items-center">
          ← Contas
        </Link>
        <h1 className="font-display text-titulo text-fluid-2xl mt-1">Pedidos de contratação</h1>
        <p className="text-fluid-sm text-apoio mt-2 max-w-2xl">
          Quem escolheu um plano na página de vendas. A promessa é chamar no WhatsApp em até 1 dia útil, criar a conta e
          acompanhar a primeira semana.
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

      {pedidos.length === 0 ? (
        <p className="cartao text-fluid-sm text-apoio p-5">Nenhum pedido neste filtro.</p>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {pedidos.map((p) => {
            const conversa = `https://wa.me/${p.whatsapp}?text=${encodeURIComponent(
              `Olá, ${p.nome.split(" ")[0]}! Aqui é da Astro Soluções, sobre o seu pedido do plano ${resumoDoPlano(p.plano as PlanoContratavel, p.usuarios)}.`,
            )}`;
            return (
              <li key={p.id} className="cartao flex min-w-0 flex-col gap-4 p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-titulo text-fluid-lg font-medium break-words">{p.nome}</h2>
                    <p className="text-fluid-xs text-apoio">
                      {DATA_E_HORA.format(new Date(p.criado_em))} · {p.cidade}/{p.uf}
                    </p>
                  </div>
                  <span className={`text-fluid-xs rounded-full border px-2.5 py-1 ${COR_DO_STATUS[p.status]}`}>
                    {ROTULO_DO_STATUS[p.status]}
                  </span>
                </div>

                <dl className="text-fluid-sm grid grid-cols-2 gap-x-4 gap-y-2">
                  <div className="col-span-2">
                    <Dado rotulo="Plano">{resumoDoPlano(p.plano as PlanoContratavel, p.usuarios)}</Dado>
                  </div>
                  {p.imobiliaria && (
                    <div className="col-span-2">
                      <Dado rotulo="Imobiliária">{p.imobiliaria}</Dado>
                    </div>
                  )}
                  <Dado rotulo="WhatsApp">{mascararWhatsapp(p.whatsapp)}</Dado>
                  <Dado rotulo="CRECI">{p.creci ?? "não informado"}</Dado>
                  <div className="col-span-2">
                    <Dado rotulo="E-mail">
                      <a href={`mailto:${p.email}`} className="hover:text-acento underline-offset-4 hover:underline">
                        {p.email}
                      </a>
                    </Dado>
                  </div>
                  {p.grupo_criado_id && (
                    <div className="col-span-2">
                      <Dado rotulo="Conta criada">
                        <Link href={`/plataforma/grupos/${p.grupo_criado_id}`} className="hover:text-acento underline underline-offset-4">
                          {nomeDoGrupo.get(p.grupo_criado_id) ?? "abrir a conta"}
                        </Link>
                      </Dado>
                    </div>
                  )}
                </dl>

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <a
                    href={conversa}
                    target="_blank"
                    rel="noopener"
                    className="text-fluid-sm bg-acento hover:bg-acento-hover text-sobre-cor flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden /> Chamar no WhatsApp
                  </a>
                  {!p.grupo_criado_id && (
                    <Link
                      href={hrefDeCriarConta(p)}
                      className="text-fluid-sm botao-secundario text-titulo flex min-h-11 items-center justify-center gap-2 px-4 font-medium"
                    >
                      <UserPlus className="h-4 w-4" aria-hidden /> Criar conta
                    </Link>
                  )}
                </div>

                <div className="border-linha border-t pt-4">
                  <AndamentoDoPedido
                    id={p.id}
                    status={p.status}
                    observacao={p.observacao ?? ""}
                    grupoCriadoId={p.grupo_criado_id}
                    grupos={grupos}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
