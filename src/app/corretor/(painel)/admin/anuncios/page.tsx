import type { Metadata } from "next";
import Link from "next/link";
import { AbasAdmin } from "@/app/corretor/(painel)/_componentes/AbasAdmin";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { metaAdsConfigurado } from "@/lib/metaAds";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { BotaoSincronizar } from "./BotaoSincronizar";
import { GraficoGastoDia } from "./GraficoGastoDia";

export const metadata: Metadata = { title: "Anúncios" };

const DIAS_DA_JANELA = 30;

function Kpi({ rotulo, valor, detalhe, href }: { rotulo: string; valor: string; detalhe?: string; href?: string }) {
  const conteudo = (
    <>
      <p className="text-fluid-xs text-tenue">{rotulo}</p>
      <p className="text-fluid-xl text-titulo font-bold tabular-nums">{valor}</p>
      {detalhe && <p className="text-fluid-xs text-apoio mt-0.5">{detalhe}</p>}
    </>
  );
  if (!href) return <div className="border-linha bg-superficie rounded-2xl border p-4">{conteudo}</div>;
  return (
    <Link href={href} className="border-linha bg-superficie hover:border-acento-linha rounded-2xl border p-4 transition-colors">
      {conteudo}
    </Link>
  );
}

/**
 * Quanto cada campanha do Meta custou e o que ela virou — sem abrir o
 * Gerenciador de Anúncios (roadmap Meta Ads, F1-F3).
 *
 * Tudo aqui lê do NOSSO banco: o gasto entra pelo cron diário
 * (/api/cron/meta-ads) e o resto (leads, cliques do link porteiro) já é
 * nosso. A tela nunca chama a Graph API — token no caminho da requisição,
 * latência e rate limit da Meta não pertencem ao clique do gestor.
 */
export default async function AnunciosPage() {
  await exigirGestorNaPagina();

  const sessao = await createClient();
  // Cliques do link porteiro: a tabela é escrita pelo público (site e
  // /wa/*) e não tem policy de leitura para authenticated — a página já
  // passou pela guarda de gestor, e a service key só executa a leitura.
  const servico = createServiceClient();

  const corte = new Date(Date.now() - DIAS_DA_JANELA * 86_400_000);
  const corteDia = corte.toISOString().slice(0, 10);

  const [{ data: metricas }, { data: leadsDeAnuncio }, { count: cliquesPorteiro }] = await Promise.all([
    sessao
      .from("meta_ads_metricas")
      .select("dia, campanha_id, campanha_nome, gasto, cliques, resultados_meta")
      .gte("dia", corteDia)
      .order("dia"),
    sessao
      .from("leads")
      .select("id")
      .in("origem", ["meta/leadads", "meta/ctwa"])
      .gte("created_at", corte.toISOString()),
    servico
      .from("cliques_whatsapp")
      .select("id", { count: "exact", head: true })
      .like("origem", "anuncio/%")
      .gte("created_at", corte.toISOString()),
  ]);

  // `numeric` do Postgres chega como STRING no supabase-js — sem a
  // conversão o gasto concatenaria em vez de somar (lição da casa).
  const linhas = (metricas ?? []).map((m) => ({ ...m, gasto: Number(m.gasto) || 0 }));
  const leadsCrm = (leadsDeAnuncio ?? []).length;

  /*
   * A QUALIDADE do lead vem do dossiê da IA (pedido de 26/08): a Sofia já
   * dá nota 0-100 (quente/morno/frio) para todo lead que conversa. Quem
   * nunca respondeu não tem dossiê e entra como "não engajou" — que NÃO é
   * frio: é uma faixa própria, e o % dela é um termômetro da campanha por
   * si só (campanha que atrai curioso que some).
   */
  const idsDeAnuncio = (leadsDeAnuncio ?? []).map((l) => l.id);
  const { data: dossies } = idsDeAnuncio.length
    ? await sessao
        .from("lead_observacoes_ia")
        .select("lead_id, temperatura_label")
        .in("lead_id", idsDeAnuncio)
    : { data: [] as { lead_id: string; temperatura_label: string }[] };

  const temperatura = { quente: 0, morno: 0, frio: 0 };
  for (const d of dossies ?? []) {
    if (d.temperatura_label === "quente") temperatura.quente++;
    else if (d.temperatura_label === "morno") temperatura.morno++;
    else if (d.temperatura_label === "frio") temperatura.frio++;
  }
  const naoEngajou = Math.max(0, leadsCrm - (dossies?.length ?? 0));

  const totalGasto = linhas.reduce((s, l) => s + l.gasto, 0);
  const totalResultadosMeta = linhas.reduce((s, l) => s + (l.resultados_meta ?? 0), 0);

  const porDia = new Map<string, number>();
  for (const l of linhas) porDia.set(l.dia, (porDia.get(l.dia) ?? 0) + l.gasto);
  const dias = Array.from({ length: DIAS_DA_JANELA }, (_, i) => {
    const d = new Date(Date.now() - (DIAS_DA_JANELA - 1 - i) * 86_400_000);
    const chave = d.toISOString().slice(0, 10);
    return {
      rotulo: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      valor: porDia.get(chave) ?? 0,
    };
  });

  const porCampanha = new Map<string, { nome: string; gasto: number; resultados: number }>();
  for (const l of linhas) {
    const atual = porCampanha.get(l.campanha_id) ?? { nome: l.campanha_nome, gasto: 0, resultados: 0 };
    atual.nome = l.campanha_nome || atual.nome;
    atual.gasto += l.gasto;
    atual.resultados += l.resultados_meta ?? 0;
    porCampanha.set(l.campanha_id, atual);
  }
  const campanhas = [...porCampanha.values()].sort((a, b) => b.gasto - a.gasto);

  const cplCrm = leadsCrm > 0 ? totalGasto / leadsCrm : null;
  const custoPorQuente = temperatura.quente > 0 ? totalGasto / temperatura.quente : null;
  const conectado = metaAdsConfigurado();

  const faixasDeQualidade = [
    { rotulo: "Quentes", valor: temperatura.quente, cor: "var(--color-sand-400)" },
    { rotulo: "Mornos", valor: temperatura.morno, cor: "var(--color-azure-300)" },
    { rotulo: "Frios", valor: temperatura.frio, cor: "var(--color-mist-400)" },
    { rotulo: "Não engajaram", valor: naoEngajou, cor: "var(--color-ink-500)" },
  ];
  const totalComFaixa = faixasDeQualidade.reduce((s, f) => s + f.valor, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-fluid-2xl text-titulo font-bold">Anúncios</h1>
        <p className="text-fluid-sm text-apoio mt-1">
          Quanto cada campanha do Meta custou e o que ela virou — atualizado uma vez por dia.
        </p>
      </div>

      <AbasAdmin ativa="anuncios" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi rotulo="Investido (30 dias)" valor={formatarMoedaBRL(totalGasto)} detalhe={conectado ? undefined : "Meta ainda não conectado"} />
        <Kpi rotulo="Resultados que a Meta contou" valor={String(totalResultadosMeta)} detalhe="formulários + conversas" />
        <Kpi
          rotulo="Leads de anúncio no CRM"
          valor={String(leadsCrm ?? 0)}
          detalhe="o que chegou de verdade"
          href="/corretor/leads"
        />
        <Kpi
          rotulo="Custo por lead (CRM)"
          valor={cplCrm === null ? "—" : formatarMoedaBRL(cplCrm)}
          detalhe="investido ÷ leads no CRM"
        />
      </div>

      <section className="border-linha bg-superficie rounded-2xl border p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-fluid-base text-titulo font-semibold">Investimento por dia</h2>
          <p className="text-fluid-xs text-tenue tabular-nums">
            Cliques no link de anúncio (30d): {cliquesPorteiro ?? 0}
          </p>
        </div>
        <div className="text-apoio">
          <GraficoGastoDia dias={dias} />
        </div>
      </section>

      {leadsCrm > 0 && (
        <section className="border-linha bg-superficie rounded-2xl border p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-fluid-base text-titulo font-semibold">
              Qualidade dos leads de anúncio (nota da IA)
            </h2>
            <p className="text-fluid-sm text-apoio tabular-nums">
              Custo por lead quente:{" "}
              <span className="text-titulo font-semibold">
                {custoPorQuente === null ? "—" : formatarMoedaBRL(custoPorQuente)}
              </span>
            </p>
          </div>

          {/* Distribuição em barra única com respiro entre segmentos; o
              rótulo com a contagem fica SEMPRE no texto ao lado — cor
              sozinha não identifica nada. */}
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label="Distribuição de qualidade dos leads de anúncio">
            {faixasDeQualidade
              .filter((f) => f.valor > 0)
              .map((f) => (
                <div
                  key={f.rotulo}
                  style={{ width: `${(f.valor / Math.max(totalComFaixa, 1)) * 100}%`, background: f.cor }}
                  title={`${f.rotulo}: ${f.valor}`}
                />
              ))}
          </div>
          <ul className="text-fluid-xs text-apoio mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {faixasDeQualidade.map((f) => (
              <li key={f.rotulo} className="flex items-center gap-1.5 tabular-nums">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: f.cor }} />
                {f.rotulo}: {f.valor}
              </li>
            ))}
          </ul>
          <p className="text-fluid-xs text-tenue mt-2">
            A nota vem da conversa: quem nunca respondeu não tem nota — e muita gente sem resposta
            é sinal de campanha que atrai curioso.
          </p>
        </section>
      )}

      {campanhas.length > 0 && (
        <section className="border-linha bg-superficie overflow-x-auto rounded-2xl border p-4">
          <h2 className="text-fluid-base text-titulo mb-3 font-semibold">Por campanha (30 dias)</h2>
          <table className="w-full min-w-[28rem] text-left text-fluid-sm">
            <thead>
              <tr className="text-tenue text-fluid-xs">
                <th className="pb-2 font-medium">Campanha</th>
                <th className="pb-2 text-right font-medium">Investido</th>
                <th className="pb-2 text-right font-medium">Resultados (Meta)</th>
                <th className="pb-2 text-right font-medium">Custo por resultado</th>
              </tr>
            </thead>
            <tbody className="text-apoio">
              {campanhas.map((c) => (
                <tr key={c.nome} className="border-linha border-t">
                  <td className="text-titulo py-2 pr-3">{c.nome || "(sem nome)"}</td>
                  <td className="py-2 text-right tabular-nums">{formatarMoedaBRL(c.gasto)}</td>
                  <td className="py-2 text-right tabular-nums">{c.resultados}</td>
                  <td className="py-2 text-right tabular-nums">
                    {c.resultados > 0 ? formatarMoedaBRL(c.gasto / c.resultados) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {conectado && <BotaoSincronizar />}

      {/* O passo a passo mora AQUI, abaixo do gráfico, a pedido (26/08):
          quem for conectar depois encontra o caminho na própria tela. */}
      <section className="border-linha bg-superficie rounded-2xl border p-4">
        <h2 className="text-fluid-base text-titulo font-semibold">
          {conectado ? "Como esta tela foi conectada ao Meta" : "Como conectar o Meta a esta tela"}
        </h2>
        <p className="text-fluid-sm text-apoio mt-1">
          Feito uma vez, vale para sempre. Precisa de acesso de administrador ao Gerenciador de
          Negócios da conta que roda os anúncios.
        </p>
        <ol className="text-fluid-sm text-apoio mt-3 list-decimal space-y-2 pl-5">
          <li>
            Abra <span className="text-titulo">business.facebook.com</span> → Configurações do
            negócio.
          </li>
          <li>
            Em <span className="text-titulo">Usuários → Usuários do sistema</span>, crie um usuário
            do sistema (ex.: &quot;crm-next-home&quot;, função Funcionário).
          </li>
          <li>
            Em <span className="text-titulo">Adicionar ativos</span>, dê a ele acesso à conta de
            anúncios do cliente com a permissão de <span className="text-titulo">visualizar
            desempenho</span> (leitura — ele nunca edita campanha).
          </li>
          <li>
            Clique em <span className="text-titulo">Gerar token</span>: escolha o aplicativo da
            empresa (o mesmo do webhook de leads, se já existir), marque a permissão{" "}
            <span className="text-titulo">ads_read</span> e expiração &quot;nunca&quot;. Copie o
            token — ele só aparece uma vez.
          </li>
          <li>
            Anote o <span className="text-titulo">ID da conta de anúncios</span>: no Gerenciador de
            Anúncios, é o número ao lado do nome da conta (use só os dígitos, sem o
            &quot;act_&quot;).
          </li>
          <li>
            Na <span className="text-titulo">Vercel</span> → projeto next-home → Settings →
            Environment Variables (Production), crie:{" "}
            <code className="text-titulo">META_ADS_TOKEN</code> (o token do passo 4) e{" "}
            <code className="text-titulo">META_ADS_ACCOUNT_ID</code> (o número do passo 5).
          </li>
          <li>
            Faça um <span className="text-titulo">redeploy</span> — variável nova só vale depois
            dele (as funções congelam o ambiente no build).
          </li>
          <li>
            Volte a esta tela e clique em <span className="text-titulo">Sincronizar agora</span>. O
            gasto dos últimos 3 dias aparece no gráfico; daí em diante a atualização é diária e
            automática.
          </li>
        </ol>
      </section>
    </div>
  );
}
