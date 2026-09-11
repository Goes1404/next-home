import type { Metadata } from "next";
import Link from "next/link";
import { AbasAdmin } from "@/app/corretor/(painel)/_componentes/AbasAdmin";
import { exigirGestorNaPagina } from "@/lib/guardas";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { metaAdsConfigurado } from "@/lib/metaAds";
import { idadeDaSincronizacao } from "@/lib/metaDiagnostico";
import { agregarPorCampanha } from "@/lib/admin/funilDeAnuncios";
import { janelaDeDias } from "@/lib/admin/janelaDeDias";
import { formatarMoedaBRL } from "@/lib/precos/moneyUtils";
import { BotaoSincronizar } from "./BotaoSincronizar";
import { GraficoGastoDia } from "./GraficoGastoDia";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";

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
  if (!href) return <div className="cartao p-4">{conteudo}</div>;
  /*
   * Mesmo tratamento do KPI da visão geral (07/09): seta FIXA no canto — no
   * celular não existe hover, e era lá que o link sumia por completo — e o
   * cartão levanta ao passar o mouse. Só trocar a borda não diz que navega.
   */
  return (
    <Link
      href={href}
      className="cartao hover:border-acento-linha group relative block p-4 transition-all hover:-translate-y-0.5 motion-reduce:transition-none"
    >
      <span
        aria-hidden
        className="text-tenue group-hover:text-acento-suave absolute top-3 right-3 transition-colors"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
          <path d="M7 17L17 7M9 7h8v8" />
        </svg>
      </span>
      {conteudo}
    </Link>
  );
}

/**
 * A faixa que diz que o gráfico congelou.
 *
 * Existe porque a tela não tinha como distinguir "a campanha gastou assim"
 * de "a sincronização parou" — os dois desenham o mesmo gráfico plano. Com
 * token de usuário, que vence em 60 dias, o segundo caso é questão de
 * tempo, e o sintoma seria eterno silêncio.
 *
 * Só aparece fora do caminho feliz (`estado !== "em_dia"`), pela régua da
 * `FaixaConexao`: aviso que aparece o tempo todo deixa de ser lido. E as
 * duas classes de cor estão escritas por extenso — `bg-${x}-lavado`
 * montado em tempo de execução não gera classe nenhuma no Tailwind, e o
 * aviso sairia sem cor justo no dia em que importa.
 */
function FaixaDeSincronizacao({ estado, texto }: { estado: "nunca" | "atrasado"; texto: string }) {
  const estilo =
    estado === "atrasado"
      ? { caixa: "border-alerta-linha bg-alerta-lavado", icone: "text-alerta" }
      : { caixa: "border-info-linha bg-info-lavado", icone: "text-info" };

  return (
    <div role="status" className={`flex items-start gap-3 rounded-xl border p-3 ${estilo.caixa}`}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`mt-0.5 h-4 w-4 shrink-0 ${estilo.icone}`}
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <p className="text-fluid-sm text-apoio min-w-0">
        <strong className="text-titulo">{texto}</strong>{" "}
        {estado === "atrasado"
          ? "A causa mais comum é o token ter vencido — token de usuário dura 60 dias. Confira com npm run meta:diag e, se preciso, gere outro pelo passo a passo abaixo."
          : "Clique em Sincronizar agora, ou confira o token com npm run meta:diag antes."}
      </p>
    </div>
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

  const [
    { data: metricas },
    { data: leadsDeAnuncio },
    { count: cliquesPorteiro },
    { data: ultimaSincronizacao },
  ] = await Promise.all([
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
    /*
     * Quando o gasto foi atualizado pela última vez — UMA linha, sem
     * janela de data: se a sincronização parou há 40 dias, o `max` dentro
     * da janela de 30 seria nulo e a tela diria "nunca sincronizou", que é
     * outro diagnóstico (configuração que nunca rodou × token que venceu
     * no meio do caminho).
     */
    sessao
      .from("meta_ads_metricas")
      .select("atualizado_em")
      .order("atualizado_em", { ascending: false })
      .limit(1)
      .maybeSingle(),
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
  const sincronizacao = idadeDaSincronizacao(ultimaSincronizacao?.atualizado_em ?? null);

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
        <CabecalhoDeTela secao="Administração" titulo="Anúncios" descricao="Quanto cada campanha do Meta custou e o que ela virou — atualizado uma vez por dia." />
      </div>

      <AbasAdmin ativa="/corretor/admin/anuncios" />

      {conectado && sincronizacao.estado !== "em_dia" && (
        <FaixaDeSincronizacao
          estado={sincronizacao.estado}
          texto={
            sincronizacao.texto ??
            "O Meta está configurado, mas o gasto nunca foi sincronizado nem uma vez."
          }
        />
      )}

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

      <section className="cartao p-4">
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
        <section className="cartao p-4">
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
        <section className="cartao overflow-x-auto p-4">
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
      <section className="cartao p-4">
        <h2 className="text-fluid-base text-titulo font-semibold">
          {conectado ? "Como esta tela foi conectada ao Meta" : "Como conectar o Meta a esta tela"}
        </h2>
        <p className="text-fluid-sm text-apoio mt-1">
          Feito uma vez, vale para sempre. Precisa de acesso de administrador ao Gerenciador de
          Negócios da conta que roda os anúncios.
        </p>
        <ol className="text-fluid-sm text-apoio mt-3 list-decimal space-y-2 pl-5">
          <li>
            Abra <span className="text-titulo">developers.facebook.com/tools/explorer</span>,
            escolha o aplicativo da empresa, marque a permissão{" "}
            <span className="text-titulo">ads_read</span> e clique em gerar token de acesso.
          </li>
          <li>
            No terminal do projeto, rode{" "}
            <code className="text-titulo">npm run meta:diag -- &lt;o token&gt;</code>. Ele diz se o
            token serve e <span className="text-titulo">lista as suas contas de anúncios com o
            nome de cada uma</span> — o ID sai pronto para colar, sem ninguém precisar adivinhar
            qual dos números da Meta é o certo.
          </li>
          <li>
            Na <span className="text-titulo">Vercel</span> → projeto next-home → Settings →
            Environment Variables (Production), cole as duas linhas que o comando imprimiu:{" "}
            <code className="text-titulo">META_ADS_ACCOUNT_ID</code> e{" "}
            <code className="text-titulo">META_ADS_TOKEN</code>.
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
        <p className="text-fluid-xs text-apoio border-linha mt-3 border-t pt-3">
          <strong className="text-titulo">O token acima vence em 60 dias.</strong> Quando vencer, a
          sincronização para e o gráfico congela — esta tela avisa quando isso acontecer. O caminho
          definitivo é um token de <span className="text-titulo">Usuário do Sistema</span>, que não
          vence: em <span className="text-titulo">business.facebook.com/settings/system-users</span>{" "}
          crie o usuário, em <span className="text-titulo">Adicionar ativos</span> dê a ele a conta
          de anúncios com permissão de ver desempenho, e gere o token com{" "}
          <span className="text-titulo">ads_read</span> e expiração &quot;nunca&quot;. Se esse menu
          não aparecer, é porque a conta de anúncios não está dentro de um Portfólio de Negócios ou
          você não é administrador do portfólio — e aí o caminho de cima resolve enquanto isso.
        </p>
      </section>
    </div>
  );
}
