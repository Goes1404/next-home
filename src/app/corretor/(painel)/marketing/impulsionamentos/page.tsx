import type { Metadata } from "next";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { getEmpreendimentosDoPainel } from "@/lib/imoveis/catalogoDoPainel";
import { createClient } from "@/lib/supabase/server";
import { clienteParaNumerosDaEquipe } from "@/lib/admin/numerosDaEquipe";
import { nomeParaExibir } from "@/lib/leads/nomeExibido";
import { hojeEmSaoPaulo } from "@/lib/financeiro/venda";
import {
  resumirImpulsionamentos,
  serieDeCusto,
  totaisDosImpulsionamentos,
  type LeadDeAnuncio,
  type LinhaImpulsionamento,
  type PontoDeGasto,
  type Temperatura,
} from "@/lib/crm/impulsionamentosCalculo";
import { Suspense } from "react";
import { ContaDaMeta } from "@/app/corretor/(painel)/admin/anuncios/ContaDaMeta";
import { ListaDeImpulsionamentos, type ClienteDaLista } from "./ListaDeImpulsionamentos";
import { DoCliqueAConversa } from "./DoCliqueAConversa";
import { PainelDeIndicadores } from "./PainelDeIndicadores";
import { montarDadosDoPainel } from "@/lib/crm/painelDosAnuncios";

export const metadata: Metadata = { title: "Anúncios pagos" };
export const dynamic = "force-dynamic";

/**
 * Quanto rendeu cada anúncio e cada campanha paga (27/09/2026; campanhas
 * cadastradas pelo corretor desde 30/09, 0132).
 *
 * O anúncio do Instagram/Facebook com botão de WhatsApp aparece sozinho
 * quando o primeiro cliente chega por ele (o webhook reconhece a etiqueta da
 * Meta). A campanha de outro canal, ou a que ainda não rendeu, o corretor
 * cadastra à mão, com o valor, e diz quais clientes vieram dela.
 *
 * A qualidade do cliente é o que ele FEZ (`contarDegraus`): conversou,
 * disse renda ou orçamento, visitou, fechou. A temperatura da IA só conta
 * como uma das portas para "qualificado", porque ela oscila de uma leitura
 * para a outra.
 *
 * A RLS recorta: o corretor vê as campanhas dele; o ADM vê as da equipe
 * inteira, inclusive as da imobiliária que ele mesmo cadastra (só o dono
 * edita).
 */
export default async function PaginaImpulsionamentos() {
  const corretor = await getCorretorLogado();
  if (!corretor) return null;

  const supabase = await createClient();
  const [{ data: linhas, error }, { data: leads }, catalogo, { data: corretores }, { data: candidatos }, { data: gastos }] =
    await Promise.all([
      supabase
        .from("impulsionamentos")
        .select(
          "id, corretor_id, chave, titulo, url, empreendimento_id, valor_gasto, primeiro_lead_em, ultimo_lead_em, criada_pelo_corretor, canal, inicio, fim, agrupado_em",
        )
        .order("ultimo_lead_em", { ascending: false })
        .limit(200),
      supabase
        .from("leads")
        .select(
          "id, nome, telefone, corretor_id, meta_ad_id, anuncio_origem, etapa, visita_agendada_em, impulsionamento_id, created_at, renda_mensal, orcamento_min, orcamento_max, nao_contatar_em",
        )
        .or("origem.eq.meta/ctwa,impulsionamento_id.not.is.null")
        .is("arquivado_em", null)
        .limit(5000),
      getEmpreendimentosDoPainel(),
      supabase.from("corretores").select("id, nome"),
      // Quem o corretor pode ligar a uma campanha: os dele, que não vieram
      // pela etiqueta da Meta e ainda não estão em campanha nenhuma.
      supabase
        .from("leads")
        .select("id, nome, telefone, created_at")
        .eq("corretor_id", corretor.id)
        .is("arquivado_em", null)
        .is("meta_ad_id", null)
        .is("impulsionamento_id", null)
        .order("created_at", { ascending: false })
        .limit(150),
      // A linha do tempo do gasto (0133): "até este dia, tinha gastado X".
      supabase.from("impulsionamento_gastos").select("impulsionamento_id, dia, valor_acumulado").limit(5000),
    ]);

  const ids = (leads ?? []).map((l) => l.id);
  const temperaturas = new Map<string, Temperatura>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await supabase
      .from("lead_observacoes_ia")
      .select("lead_id, temperatura_label")
      .in("lead_id", ids.slice(i, i + 300));
    for (const o of data ?? []) temperaturas.set(o.lead_id, o.temperatura_label);
  }

  // Quantas mensagens cada cliente mandou. Paginado: o PostgREST entrega no
  // máximo 1000 linhas por vez, e cortar ali faria cliente que conversou
  // parecer que não conversou.
  //
  // O ADM vê as campanhas da equipe, mas desde a 0134 não lê conversa de
  // outro corretor: a contagem dele vem só com id e remetente, pela chave
  // de serviço. `ids` já saiu recortado pela RLS de `leads`.
  const contador = corretor.papel === "gestor" ? await clienteParaNumerosDaEquipe() : supabase;
  const conversaDoLead = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 300) {
    const { data } = await contador
      .from("whatsapp_conversas")
      .select("id, lead_id")
      .in("lead_id", ids.slice(i, i + 300));
    for (const c of data ?? []) conversaDoLead.set(c.id, c.lead_id);
  }
  const falas = new Map<string, number>();
  const conversas = [...conversaDoLead.keys()];
  for (let i = 0; i < conversas.length; i += 200) {
    const lote = conversas.slice(i, i + 200);
    for (let pagina = 0; pagina < 20; pagina += 1) {
      const { data } = await contador
        .from("whatsapp_mensagens")
        .select("conversa_id")
        .in("conversa_id", lote)
        .eq("remetente", "cliente")
        .order("id")
        .range(pagina * 1000, pagina * 1000 + 999);
      for (const m of data ?? []) {
        const lead = conversaDoLead.get(m.conversa_id);
        if (lead) falas.set(lead, (falas.get(lead) ?? 0) + 1);
      }
      if (!data || data.length < 1000) break;
    }
  }

  const doBanco: LinhaImpulsionamento[] = (linhas ?? []).map((l) => ({
    id: l.id,
    corretorId: l.corretor_id,
    chave: l.chave,
    titulo: l.titulo,
    url: l.url,
    empreendimentoId: l.empreendimento_id,
    valorGasto: l.valor_gasto === null ? null : Number(l.valor_gasto),
    primeiroLeadEm: l.primeiro_lead_em,
    ultimoLeadEm: l.ultimo_lead_em,
    criadaPeloCorretor: l.criada_pelo_corretor,
    canal: l.canal,
    inicio: l.inicio,
    fim: l.fim,
    agrupadoEm: l.agrupado_em,
  }));

  const leadsDeAnuncio: LeadDeAnuncio[] = (leads ?? []).map((l) => ({
    id: l.id,
    corretorId: l.corretor_id,
    metaAdId: l.meta_ad_id,
    anuncioOrigem: l.anuncio_origem,
    etapa: l.etapa,
    visitaAgendadaEm: l.visita_agendada_em,
    impulsionamentoId: l.impulsionamento_id,
    temperatura: temperaturas.get(l.id) ?? null,
    criadoEm: l.created_at,
    falasDoCliente: falas.get(l.id) ?? 0,
    capacidadeDita: l.renda_mensal !== null || l.orcamento_min !== null || l.orcamento_max !== null,
    pediuParaSair: l.nao_contatar_em !== null,
  }));

  const nomesDoImovel = Object.fromEntries(
    catalogo.filter((i) => i.id).map((i) => [i.id as string, [i.nome, ...(i.nomesAlternativos ?? [])]]),
  );
  const resumos = resumirImpulsionamentos(doBanco, leadsDeAnuncio, nomesDoImovel);
  const pontos: PontoDeGasto[] = (gastos ?? []).map((g) => ({
    impulsionamentoId: g.impulsionamento_id,
    dia: g.dia,
    valor: Number(g.valor_acumulado),
  }));
  const hoje = hojeEmSaoPaulo();
  const comGasto = resumos.filter((r) => r.gastoTotal !== null);
  const series = [
    ...(comGasto.length > 1
      ? [{ id: "todas", nome: "Todas as campanhas", serie: serieDeCusto(comGasto, pontos, hoje) }]
      : []),
    ...comGasto.map((r) => ({
      id: r.id,
      nome: r.titulo ?? (r.criadaPeloCorretor ? "Campanha sem nome" : "Post impulsionado"),
      serie: serieDeCusto([r], pontos, hoje),
    })),
  ];
  const nomes = Object.fromEntries((corretores ?? []).map((c) => [c.id, c.nome]));

  /*
   * Quantos clientes de cada campanha paga a lista de transmissão alcançou
   * (roadmap das listas, Fase 3): o anúncio traz, a lista reengaja quem
   * esfriou. Uma consulta para todos os cartões.
   */
  const todosDosCartoes = [...new Set(resumos.flatMap((r) => r.leadIds))];
  const listasPorLead = new Map<string, { recebeu: boolean; respondeu: boolean }>();
  if (todosDosCartoes.length > 0) {
    const { data: itensDeLista } = await supabase
      .from("whatsapp_campanhas_fila")
      .select("lead_id, status")
      .in("lead_id", todosDosCartoes)
      .in("status", ["enviado", "respondido"]);
    for (const i of itensDeLista ?? []) {
      if (!i.lead_id) continue;
      const atual = listasPorLead.get(i.lead_id) ?? { recebeu: false, respondeu: false };
      listasPorLead.set(i.lead_id, { recebeu: true, respondeu: atual.respondeu || i.status === "respondido" });
    }
  }
  const listasPorCartao: Record<string, { receberam: number; responderam: number }> = {};
  for (const r of resumos) {
    const daLinha = r.leadIds.map((id) => listasPorLead.get(id)).filter(Boolean);
    listasPorCartao[r.id] = {
      receberam: daLinha.filter((x) => x!.recebeu).length,
      responderam: daLinha.filter((x) => x!.respondeu).length,
    };
  }

  // Os clientes ligados à mão, por campanha, para a lista de cada cartão.
  const ligados: Record<string, ClienteDaLista[]> = {};
  for (const l of leads ?? []) {
    if (!l.impulsionamento_id) continue;
    (ligados[l.impulsionamento_id] ??= []).push({ id: l.id, nome: nomeParaExibir(l) });
  }

  return (
    <div className="space-y-6">
      <CabecalhoDeTela
        titulo="Anúncios pagos"
        descricao="Quanto cada campanha trouxe de clientes, se eles valem a conversa e quanto custou cada um."
      />
      {!error && <PainelDeIndicadores dados={montarDadosDoPainel(resumos, leadsDeAnuncio, pontos, hoje)} />}
      <ListaDeImpulsionamentos
        resumos={resumos}
        totais={totaisDosImpulsionamentos(resumos)}
        meuId={corretor.id}
        verEquipe={corretor.papel === "gestor"}
        nomes={nomes}
        imoveis={catalogo.filter((i) => i.id).map((i) => ({ id: i.id as string, nome: i.nome }))}
        ligados={ligados}
        listasPorCartao={listasPorCartao}
        candidatos={(candidatos ?? []).map((c) => ({ id: c.id, nome: nomeParaExibir(c) }))}
        series={series}
        hoje={hoje}
        indisponivel={Boolean(error)}
      />
      {/* Onde o clique no link do anúncio se perde (0159). */}
      <Suspense fallback={null}>
        <DoCliqueAConversa />
      </Suspense>
      {/* A antiga tela "Anúncios" da Administração (30/09/2026): a conta de
          anúncios da imobiliária, só para o ADM. */}
      {corretor.papel === "gestor" && (
        <Suspense fallback={null}>
          <ContaDaMeta />
        </Suspense>
      )}
    </div>
  );
}
