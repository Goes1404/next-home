import type { Metadata } from "next";
import Link from "next/link";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getRankingVgv } from "@/lib/financeiro/dados";
import { intervaloDo, lerPeriodo, nomeDoMes, PERIODOS } from "@/lib/financeiro/periodo";
import { formatarReais, hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { CabecalhoDeTela } from "../../_componentes/CabecalhoDeTela";
import { AbasFinanceiro } from "../../_componentes/AbasFinanceiro";

export const metadata: Metadata = { title: "Ranking de VGV" };

const MEDALHA = ["🥇", "🥈", "🥉"];

function iniciais(nome: string): string {
  return nome
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/**
 * Ranking de VGV (F3). Todos os corretores veem as posições — decisão de
 * 25/09/2026 —, e por isso a consulta é uma função do banco que devolve só
 * VGV e contagens: comissão e repasse de colega nunca chegam a esta tela.
 *
 * A temporada padrão é o MÊS: ranking do ano inteiro deixa a mesma pessoa em
 * primeiro por meses, e quem está atrás para de olhar. O mês recomeça a
 * disputa todo dia 1º.
 *
 * Distrato fica ao lado do VGV, não escondido: quem vende muito e perde
 * muito precisa aparecer assim.
 */
export default async function RankingPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const periodo = lerPeriodo((await searchParams).periodo);
  const hoje = hojeEmSaoPaulo();
  const { inicio, fim } = intervaloDo(periodo, hoje);
  const ranking = await getRankingVgv(inicio, fim);

  const titulo =
    periodo === "mes"
      ? `Temporada de ${nomeDoMes(inicio)}`
      : periodo === "trimestre"
        ? `Trimestre de ${nomeDoMes(inicio)} a ${nomeDoMes(fim)}`
        : `Ano de ${inicio.slice(0, 4)}`;

  const lideres = (ranking ?? []).filter((r) => r.vgv > 0);
  const semVenda = (ranking ?? []).filter((r) => r.vgv === 0);
  const minhaPosicao = lideres.findIndex((r) => r.corretorId === corretor.id);

  return (
    <div className="space-y-4">
      <CabecalhoDeTela
        secao="Financeiro"
        titulo="Ranking de VGV"
        descricao="Quem mais vendeu na equipe. Todos veem as posições; a comissão de cada um continua privada."
      />
      <div className="mt-6">
        <AbasFinanceiro ativa="/corretor/financeiro/ranking" />
      </div>

      <nav aria-label="Período" className="flex flex-wrap gap-2">
        {PERIODOS.map((p) => (
          <Link
            key={p.chave}
            href={p.chave === "mes" ? "/corretor/financeiro/ranking" : `/corretor/financeiro/ranking?periodo=${p.chave}`}
            aria-current={p.chave === periodo ? "page" : undefined}
            className={`text-fluid-sm inline-flex min-h-11 items-center rounded-full border px-4 font-medium transition-colors ${
              p.chave === periodo ? "bg-acento text-sobre-cor border-transparent" : "border-linha-forte text-apoio hover:text-titulo"
            }`}
          >
            {p.rotulo}
          </Link>
        ))}
      </nav>

      {ranking === null ? (
        <p className="cartao text-fluid-sm text-corpo p-4">
          O ranking ainda não foi ativado no banco. Assim que for, ele aparece aqui.
        </p>
      ) : (
        <section className="space-y-3">
          <div>
            <h2 className="text-fluid-base text-titulo font-medium first-letter:uppercase">{titulo}</h2>
            <p className="text-fluid-xs text-tenue">
              {minhaPosicao >= 0
                ? `Você está em ${minhaPosicao + 1}º lugar.`
                : lideres.length > 0
                  ? "Você ainda não pontuou neste período. Uma venda te coloca na lista."
                  : "Ninguém vendeu ainda neste período. A primeira venda lidera."}
            </p>
          </div>

          {lideres.length > 0 && (
            <ol className="space-y-2">
              {lideres.map((r, i) => {
                const eu = r.corretorId === corretor.id;
                return (
                  <li
                    key={r.corretorId}
                    className={`cartao flex items-center gap-3 p-3 sm:p-4 ${eu ? "border-acento-linha ring-acento-linha ring-2" : ""}`}
                  >
                    <span className="text-fluid-lg w-9 shrink-0 text-center font-bold tabular-nums" aria-label={`${i + 1}º lugar`}>
                      {MEDALHA[i] ?? `${i + 1}º`}
                    </span>
                    {r.fotoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.fotoUrl} alt="" className="size-11 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span aria-hidden className="bg-acento-lavado text-titulo text-fluid-sm flex size-11 shrink-0 items-center justify-center rounded-full font-bold">
                        {iniciais(r.nome)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="text-fluid-sm text-titulo block font-medium break-words">
                        {r.nome}
                        {eu ? " (você)" : ""}
                      </span>
                      <span className="text-fluid-xs text-tenue">
                        {r.vendas} {r.vendas === 1 ? "venda" : "vendas"}
                        {r.distratos > 0 ? ` · ${r.distratos} ${r.distratos === 1 ? "distrato" : "distratos"}` : ""}
                      </span>
                    </span>
                    <span className="text-fluid-base text-titulo shrink-0 font-bold tabular-nums">{formatarReais(r.vgv)}</span>
                  </li>
                );
              })}
            </ol>
          )}

          {semVenda.length > 0 && (
            <p className="text-fluid-xs text-tenue">
              Sem venda no período: {semVenda.map((r) => (r.corretorId === corretor.id ? `${r.nome} (você)` : r.nome)).join(", ")}.
            </p>
          )}
          <p className="text-fluid-xs text-tenue">
            VGV conta a parte de cada corretor na venda (em co-corretagem, dividido pelas partes). Venda distratada sai do VGV.
            Período de {inicio.split("-").reverse().join("/")} a {fim.split("-").reverse().join("/")}, até hoje ({hoje.split("-").reverse().join("/")}).
          </p>
        </section>
      )}
    </div>
  );
}
