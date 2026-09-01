import type { Metadata } from "next";
import Link from "next/link";
import { AbasAdmin } from "@/app/corretor/(painel)/_componentes/AbasAdmin";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { metaAdsConfigurado } from "@/lib/metaAds";
import { agregarPorCampanha } from "@/lib/admin/funilDeAnuncios";
import { janelaDeDias } from "@/lib/admin/janelaDeDias";
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

  /*
   * O relógio mora FORA do render (`janelaDeDias`): `Date.now()` no corpo
   * de um Server Component é impureza durante o render, e componente que
   * não é idempotente dá resultado instável se o React renderizar de novo.
   */
  const { corte, corteDia, dias: diasDaJanela } = janelaDeDias(DIAS_DA_JANELA);

  const [{ data: metricas }, { data: leadsDeAnuncio }, { count: cliquesPorteiro }] = await Promise.all([
    sessao
      .from("meta_ads_metricas")
      .select("dia, campanha_id, campanha_nome, gasto, cliques, resultados_meta")
      .gte("dia", corteDia)
      .order("dia"),
    /*
     * Quatro colunas, não uma: a junção por campanha (F2) precisa do ID da
     * campanha e dos dois FATOS do funil que só existem aqui — visita
     * marcada e negócio fechado. Continua sendo consulta magra: nenhum
     * join, nenhuma coluna de texto longo.
     */
    sessao
      .from("leads")
      .select("id, meta_campanha_id, visita_agendada_em, etapa")
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
  const dias = diasDaJanela.map(({ chave, rotulo }) => ({
    rotulo,
    valor: porDia.get(chave) ?? 0,
  }));

  const resultadosMetaPorCampanha = new Map<string, number>();
  for (const l of linhas) {
    resultadosMetaPorCampanha.set(
      l.campanha_id,
      (resultadosMetaPorCampanha.get(l.campanha_id) ?? 0) + (l.resultados_meta ?? 0),
    );
  }

  /*
   * A junção por ID (F2): o gasto de cada campanha encontra os leads que
   * ela trouxe, e daí saem custo por lead, por visita e por fechado — os
   * dois últimos a Meta não tem como calcular, porque o que acontece depois
   * do formulário só existe neste banco.
   */
  const { campanhas, naoAtribuidos } = agregarPorCampanha({
    gastos: linhas.map((l) => ({
      campanhaId: l.campanha_id,
      nome: l.campanha_nome ?? "",
      gasto: l.gasto,
    })),
    leads: (leadsDeAnuncio ?? []).map((l) => ({
      id: l.id,
      metaCampanhaId: l.meta_campanha_id,
      visitaAgendadaEm: l.visita_agendada_em,
      etapa: l.etapa,
    })),
    dossies: (dossies ?? []).map((d) => ({
      leadId: d.lead_id,
      temperaturaLabel: d.temperatura_label,
    })),
  });

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
          <h2 className="text-fluid-base text-titulo mb-1 font-semibold">Por campanha (30 dias)</h2>
          <p className="text-fluid-xs text-apoio mb-3">
            Custo por visita e por fechado são o que a Meta não tem como calcular — o que acontece
            depois do clique só existe aqui.
          </p>
          <table className="text-fluid-sm w-full min-w-[44rem] text-left">
            <thead>
              <tr className="text-tenue text-fluid-xs">
                <th className="pb-2 font-medium">Campanha</th>
                <th className="pb-2 text-right font-medium">Investido</th>
                <th className="pb-2 text-right font-medium">Leads (CRM)</th>
                <th className="pb-2 text-right font-medium">Por lead</th>
                <th className="pb-2 text-right font-medium">Visitas</th>
                <th className="pb-2 text-right font-medium">Por visita</th>
                <th className="pb-2 text-right font-medium">Fechados</th>
                <th className="pb-2 text-right font-medium">Por fechado</th>
              </tr>
            </thead>
            <tbody className="text-apoio">
              {campanhas.map((c) => (
                <tr key={c.campanhaId} className="border-linha border-t">
                  <td className="text-titulo py-2 pr-3">
                    {c.nome || "(sem nome)"}
                    {/* Gasto sem lead nenhum é o achado que a tabela existe
                        para entregar — não pode passar como uma linha igual
                        às outras. */}
                    {c.gasto > 0 && c.leads === 0 && (
                      <span className="text-alerta text-fluid-xs ml-2 whitespace-nowrap">
                        · sem lead
                      </span>
                    )}
                    {/*
                      Os DOIS números, e a diferença é informação: a Meta
                      conta o formulário preenchido, nós contamos o lead que
                      chegou ao banco. Divergência grande é alerta de
                      INGESTÃO — formulário duplicado, telefone inválido,
                      webhook fora do ar —, não detalhe. Fica calado quando
                      os dois batem, para não virar ruído em toda linha.
                    */}
                    {(() => {
                      const meta = resultadosMetaPorCampanha.get(c.campanhaId) ?? 0;
                      if (meta === 0 || meta === c.leads) return null;
                      return (
                        <span className="text-tenue text-fluid-xs block">
                          a Meta contou {meta}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatarMoedaBRL(c.gasto)}</td>
                  {/* Cada número leva à lista já filtrada: KPI que não leva
                      a lugar nenhum obriga o gestor a refazer o filtro à
                      mão para ver de quem ele é feito. */}
                  <td className="py-2 text-right tabular-nums">
                    {c.leads > 0 ? (
                      <Link
                        href={`/corretor/leads?campanha=${encodeURIComponent(c.campanhaId)}`}
                        className="hover:text-titulo underline underline-offset-2"
                      >
                        {c.leads}
                      </Link>
                    ) : (
                      c.leads
                    )}
                  </td>
                  <td className="text-titulo py-2 text-right font-medium tabular-nums">
                    {c.custoPorLead === null ? "—" : formatarMoedaBRL(c.custoPorLead)}
                  </td>
                  <td className="py-2 text-right tabular-nums">{c.visitas}</td>
                  <td className="py-2 text-right tabular-nums">
                    {c.custoPorVisita === null ? "—" : formatarMoedaBRL(c.custoPorVisita)}
                  </td>
                  <td className="py-2 text-right tabular-nums">{c.fechados}</td>
                  <td className="py-2 text-right tabular-nums">
                    {c.custoPorFechado === null ? "—" : formatarMoedaBRL(c.custoPorFechado)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/*
            A honestidade da tabela. Hoje é a maioria por construção: o
            formato que o cliente usa é Click-to-WhatsApp, que entra pelo
            link porteiro e nasce sem ID de campanha. Somar esses leads em
            campanha nenhuma faria a tabela mentir para baixo; escondê-los
            faria o gestor achar que a campanha rendeu menos do que rendeu.
          */}
          {naoAtribuidos > 0 && (
            <p className="text-fluid-xs text-apoio border-linha mt-3 border-t pt-3">
              <strong className="text-titulo">
                {naoAtribuidos} {naoAtribuidos === 1 ? "lead" : "leads"} de anúncio sem campanha
                identificada
              </strong>{" "}
              — não entram em nenhuma linha acima. É o esperado para anúncios de
              Click-to-WhatsApp: eles chegam pelo link e não pelo formulário da Meta. Para o ID
              começar a vir, o anúncio precisa apontar para{" "}
              <code className="text-corpo">/wa/&lt;campanha&gt;?mc=&#123;&#123;campaign.id&#125;&#125;</code>.
            </p>
          )}
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
