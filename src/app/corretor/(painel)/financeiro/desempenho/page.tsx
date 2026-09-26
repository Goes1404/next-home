import type { Metadata } from "next";
import Link from "next/link";
import { getCorretorLogado, getEmpreendimentosParaFiltro, getEquipeAtiva } from "@/lib/corretorSessao";
import { getLeadsLeves, getPrimeirasRespostas, getVendas } from "@/lib/financeiro/dados";
import {
  desempenhoPorCorretor,
  formatarMinutos,
  oQueOsMelhoresFazem,
  tempoDeRespostaPorCorretor,
  type DesempenhoDoCorretor,
} from "@/lib/financeiro/desempenho";
import { intervaloDo, lerPeriodo, PERIODOS } from "@/lib/financeiro/periodo";
import { formatarReais, hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import { CabecalhoDeTela } from "../../_componentes/CabecalhoDeTela";
import { AbasFinanceiro } from "../../_componentes/AbasFinanceiro";

export const metadata: Metadata = { title: "Desempenho" };

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

function Numero({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="cartao flex flex-col-reverse gap-1 p-4">
      <dt className="text-fluid-xs text-tenue">{rotulo}</dt>
      <dd className="text-fluid-lg text-titulo font-bold break-words">{valor}</dd>
    </div>
  );
}

function PainelDoCorretor({ d, tempo }: { d: DesempenhoDoCorretor; tempo: string | null }) {
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Numero rotulo="Atendidos" valor={String(d.atendidos)} />
        <Numero rotulo="Viraram visita" valor={`${d.visitas} · ${pct(d.leadParaVisita)}`} />
        <Numero rotulo="Vendas" valor={`${d.vendas}${d.distratos ? ` (+${d.distratos} distr.)` : ""}`} />
        <Numero rotulo="VGV" valor={formatarReais(d.vgv)} />
        <Numero rotulo="Visita que vira venda" valor={pct(d.visitaParaVenda)} />
        <Numero rotulo="Atendimento que vira venda" valor={pct(d.leadParaVenda)} />
        <Numero rotulo="Dias até a venda (mediana)" valor={d.diasAteVenda === null ? "—" : String(Math.round(d.diasAteVenda))} />
        <Numero rotulo="Primeira resposta (mediana)" valor={tempo ?? "—"} />
      </dl>

      <section className="space-y-2">
        <h2 className="text-fluid-base text-titulo font-medium">Por imóvel</h2>
        {d.porImovel.length === 0 ? (
          <p className="cartao text-fluid-sm text-corpo p-4">Nenhum atendimento ligado a imóvel neste período.</p>
        ) : (
          <ul className="space-y-2">
            {d.porImovel.slice(0, 12).map((l) => (
              <li key={l.imovelId} className="cartao flex flex-wrap items-center justify-between gap-2 p-3 sm:p-4">
                <span className="text-fluid-sm text-titulo min-w-0 font-medium break-words">{l.imovel}</span>
                <span className="text-fluid-xs text-apoio tabular-nums">
                  {l.atendidos} atend. · {l.visitas} visitas · {l.vendas} vendas
                  {l.vgv > 0 ? ` · ${formatarReais(l.vgv)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/**
 * Desempenho (F4) e o que os melhores fazem (F8).
 *
 * O corretor vê o próprio: quantos atendeu, quantos viraram visita e venda,
 * em que imóvel é referência. O gestor vê a equipe inteira numa tabela e,
 * quando a amostra sustenta, uma frase dizendo o que o corretor que mais
 * converte faz diferente. Tudo sai do que o banco já tem — nenhum campo novo
 * pedido ao corretor além da venda.
 */
export default async function DesempenhoPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;
  const gestor = corretor.papel === "gestor";

  const params = await searchParams;
  const periodo = lerPeriodo(params.periodo);
  const escolhido = gestor && typeof params.corretor === "string" ? params.corretor : null;
  const { inicio, fim } = intervaloDo(periodo, hojeEmSaoPaulo());

  const [leads, leitura, empreendimentos, respostas, equipe] = await Promise.all([
    getLeadsLeves(inicio),
    getVendas({ inicio, fim }),
    getEmpreendimentosParaFiltro(),
    getPrimeirasRespostas(`${inicio}T00:00:00-03:00`),
    getEquipeAtiva(),
  ]);

  const vendas = leitura.ok ? leitura.vendas : [];
  const nomeDoImovel = new Map(empreendimentos.map((e) => [e.id, e.nome]));
  const desempenho = desempenhoPorCorretor({
    leads: leads.filter((l) => l.criadoEm <= fim),
    vendas: vendas.map((v) => ({ ...v, participantes: v.participantes })),
    nomeDoImovel,
  });
  const tempos = tempoDeRespostaPorCorretor(respostas);
  const nomes = new Map(equipe.map((c) => [c.id, c.nome]));
  nomes.set(corretor.id, corretor.nome);

  const vazio = (id: string): DesempenhoDoCorretor => ({
    corretorId: id,
    atendidos: 0,
    visitas: 0,
    vendas: 0,
    distratos: 0,
    vgv: 0,
    leadParaVisita: null,
    visitaParaVenda: null,
    leadParaVenda: null,
    diasAteVenda: null,
    porImovel: [],
  });
  const tempoDe = (id: string) => {
    const t = tempos.get(id);
    return t?.medianaMin != null ? formatarMinutos(t.medianaMin) : null;
  };

  const alvo = gestor ? escolhido : corretor.id;
  const hrefPeriodo = (p: string) => {
    const q = new URLSearchParams();
    if (p !== "mes") q.set("periodo", p);
    if (escolhido) q.set("corretor", escolhido);
    const s = q.toString();
    return `/corretor/financeiro/desempenho${s ? `?${s}` : ""}`;
  };

  const linhasEquipe = gestor
    ? [...new Set([...equipe.map((c) => c.id), ...desempenho.keys()])]
        .map((id) => desempenho.get(id) ?? vazio(id))
        .sort((a, b) => b.vgv - a.vgv || b.vendas - a.vendas || b.atendidos - a.atendidos)
    : [];
  const frase = gestor ? oQueOsMelhoresFazem({ desempenho, tempos, nomes }) : null;

  return (
    <div className="space-y-4">
      <CabecalhoDeTela
        secao="Financeiro"
        titulo="Desempenho"
        descricao={
          gestor
            ? "Quem atende, quem leva à visita, quem vende — e em que imóvel cada um é referência."
            : "Quantos você atendeu, quantos viraram visita e venda, e em que imóvel você é referência."
        }
      />
      <div className="mt-6">
        <AbasFinanceiro ativa="/corretor/financeiro/desempenho" />
      </div>

      <nav aria-label="Período" className="flex flex-wrap gap-2">
        {PERIODOS.map((p) => (
          <Link
            key={p.chave}
            href={hrefPeriodo(p.chave)}
            aria-current={p.chave === periodo ? "page" : undefined}
            className={`text-fluid-sm inline-flex min-h-11 items-center rounded-full border px-4 font-medium transition-colors ${
              p.chave === periodo ? "bg-acento text-sobre-cor border-transparent" : "border-linha-forte text-apoio hover:text-titulo"
            }`}
          >
            {p.rotulo}
          </Link>
        ))}
      </nav>

      {!leitura.ok && leitura.motivo === "sem_tabela" && (
        <p className="text-fluid-xs text-tenue">
          O registro de vendas ainda não foi ativado no banco: por enquanto só atendimentos e visitas entram na conta.
        </p>
      )}

      {alvo ? (
        <>
          {gestor && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-fluid-base text-titulo font-medium">{nomes.get(alvo) ?? "Corretor"}</h2>
              <Link
                href={hrefPeriodo(periodo).replace(/[?&]corretor=[^&]*/, "").replace(/\?$/, "")}
                className="text-fluid-sm text-apoio hover:text-titulo min-h-11 inline-flex items-center underline"
              >
                ← Equipe inteira
              </Link>
            </div>
          )}
          <PainelDoCorretor d={desempenho.get(alvo) ?? vazio(alvo)} tempo={tempoDe(alvo)} />
        </>
      ) : (
        <>
          {frase ? (
            <section className="border-acento-linha bg-acento-lavado rounded-2xl border-2 p-4">
              <h2 className="text-fluid-sm text-titulo font-bold">O que os melhores fazem</h2>
              <p className="text-fluid-sm text-corpo mt-1">{frase}</p>
            </section>
          ) : (
            <p className="text-fluid-xs text-tenue">
              A comparação &quot;o que os melhores fazem&quot; aparece quando dois corretores tiverem pelo menos 10
              atendimentos e 5 conversas no período. Antes disso ela seria anedota.
            </p>
          )}

          <section className="space-y-2">
            <h2 className="text-fluid-base text-titulo font-medium">A equipe</h2>
            <ul className="space-y-2">
              {linhasEquipe.map((d) => (
                <li key={d.corretorId}>
                  <Link
                    href={`/corretor/financeiro/desempenho?${new URLSearchParams({
                      ...(periodo !== "mes" ? { periodo } : {}),
                      corretor: d.corretorId,
                    }).toString()}`}
                    className="cartao hover:border-acento-linha block space-y-1 p-3 transition-colors sm:p-4"
                  >
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-fluid-sm text-titulo font-medium break-words">{nomes.get(d.corretorId) ?? "Corretor"}</span>
                      <span className="text-fluid-sm text-titulo font-bold tabular-nums">{formatarReais(d.vgv)}</span>
                    </span>
                    <span className="text-fluid-xs text-apoio block tabular-nums">
                      {d.atendidos} atendidos · {pct(d.leadParaVisita)} viram visita · {d.vendas}{" "}
                      {d.vendas === 1 ? "venda" : "vendas"}
                      {tempoDe(d.corretorId) ? ` · responde em ${tempoDe(d.corretorId)}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

        </>
      )}
    </div>
  );
}
