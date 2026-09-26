import "server-only";
import { site } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/service";
import { nomeParaExibir } from "@/lib/leads/nomeExibido";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";
import { medirEspera, tempoDeEspera } from "@/lib/crm/quemEstaEsperando";
import {
  diaEmSP,
  horaDeMandarResumo,
  horarioEmSP,
  montarResumoDoDia,
  segundaEmSP,
  type ItemDoResumo,
} from "@/lib/crm/resumoDoDia";
import { compatibilidade, perfilDoLead } from "@/lib/crm/compatibilidade";
import { getParametrosCredito } from "@/lib/credito/parametros";

type Supa = ReturnType<typeof createServiceClient>;

/** Início e fim do dia de São Paulo em UTC. SP é UTC-3 fixo (sem horário de verão). */
function limitesDoDiaSP(dia: string): { inicio: string; fim: string } {
  const inicio = new Date(`${dia}T00:00:00-03:00`);
  return { inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 86_400_000).toISOString() };
}

/**
 * Roda a cada tique dos follow-ups (5 min). Só age entre a hora escolhida
 * pelo corretor (padrão 8h) e meio-dia de SP, e no fim de semana só para
 * quem pediu, para cada corretor ativo cujo número está conectado — a mensagem sai
 * da instância DELE para o WhatsApp DELE, como os lembretes das anotações.
 *
 * O claim é atômico: o UPDATE de `resumo_diario_em` acontece ANTES do envio
 * e só vale se o campo ainda não é hoje. Dois tiques concorrentes não
 * mandam o resumo duas vezes. Falha de envio NÃO devolve o claim — resumo
 * perdido é um dia sem resumo; resumo repetido a cada 5 min é spam.
 */
export async function enviarResumosDoDia(supabase: Supa, agora = new Date()): Promise<number> {
  const hoje = diaEmSP(agora);
  const { data: instancias } = await supabase
    .from("corretor_whatsapp_instancias")
    .select("corretor_id, instance_name, status_conexao")
    .eq("status_conexao", "conectado");
  if (!instancias || instancias.length === 0) return 0;

  let enviados = 0;
  for (const inst of instancias) {
    const { data: corretor } = await supabase
      .from("corretores")
      .select("id, nome, whatsapp, ativo, resumo_diario_em, resumo_hora, resumo_fim_de_semana")
      .eq("id", inst.corretor_id)
      .maybeSingle();
    if (!corretor?.ativo || !corretor.whatsapp) continue;
    if (
      !horaDeMandarResumo(agora, corretor.resumo_diario_em, {
        hora: corretor.resumo_hora,
        fimDeSemana: corretor.resumo_fim_de_semana,
      })
    ) {
      continue;
    }

    const { data: claim } = await supabase
      .from("corretores")
      .update({ resumo_diario_em: hoje })
      .eq("id", corretor.id)
      .or(`resumo_diario_em.is.null,resumo_diario_em.lt.${hoje}`)
      .select("id");
    if (!claim || claim.length === 0) continue;

    const texto = montarResumoDoDia(
      { ...(await coletar(supabase, corretor.id, hoje, agora)), nomeCorretor: corretor.nome },
      site.url,
    );
    if (!texto) continue;

    const envio = await enviarMensagemWhatsapp({
      instanceName: inst.instance_name,
      telefone: corretor.whatsapp,
      texto,
    });
    if (envio.enviado) enviados++;
    else console.warn("[resumo do dia] falhou:", corretor.id, envio.motivo);
  }
  return enviados;
}

async function coletar(supabase: Supa, corretorId: string, hoje: string, agora: Date) {
  const { inicio, fim } = limitesDoDiaSP(hoje);
  const painel = `${site.url}/corretor`;

  const [visitas, esperando, novos, lembretes] = await Promise.all([
    supabase
      .from("leads")
      .select("id, nome, telefone, visita_agendada_em, empreendimento:empreendimentos!leads_empreendimento_id_fkey(nome)")
      .eq("corretor_id", corretorId)
      .gte("visita_agendada_em", inicio)
      .lt("visita_agendada_em", fim)
      .order("visita_agendada_em", { ascending: true }),
    supabase
      .from("whatsapp_esperando_resposta")
      .select("conversa_id, nome_cliente, telefone_cliente, esperando_desde")
      .eq("corretor_id", corretorId),
    supabase
      .from("leads")
      .select("id, nome, telefone, origem")
      .eq("corretor_id", corretorId)
      .is("arquivado_em", null)
      .gte("created_at", new Date(agora.getTime() - 86_400_000).toISOString())
      .order("created_at", { ascending: false }),
    supabase
      .from("anotacoes")
      .select("id, texto, lembrete_em")
      .eq("destinatario_id", corretorId)
      .is("concluida_em", null)
      .gte("lembrete_em", inicio)
      .lt("lembrete_em", fim)
      .order("lembrete_em", { ascending: true }),
  ]);

  const [semRetorno, ontem, imoveisNovos, valeRetomar] = await Promise.all([
    visitasSemRetorno(supabase, corretorId, agora, painel),
    placarDeOntem(supabase, corretorId, hoje),
    imoveisNovosQueCombinam(supabase, corretorId, agora, painel),
    segundaEmSP(agora) ? leadsQueValemRetomar(supabase, corretorId, agora, painel) : Promise.resolve([]),
  ]);

  const itensVisita: ItemDoResumo[] = (visitas.data ?? []).map((l) => {
    const imovel = Array.isArray(l.empreendimento) ? l.empreendimento[0] : l.empreendimento;
    return {
      titulo: `${horarioEmSP(l.visita_agendada_em!)} ${nomeParaExibir(l)}`,
      detalhe: imovel?.nome ?? undefined,
      link: `${painel}/leads/${l.id}`,
    };
  });

  const esperas = medirEspera(
    (esperando.data ?? [])
      .filter((e) => e.conversa_id && e.esperando_desde)
      .map((e) => ({
        nome: nomeParaExibir({ nome: e.nome_cliente, telefone: e.telefone_cliente }),
        esperandoDesde: e.esperando_desde!,
        conversaId: e.conversa_id!,
      })),
    agora,
  );

  return {
    visitas: itensVisita,
    esperando: esperas.map((e) => ({
      titulo: e.nome,
      detalhe: tempoDeEspera(e.horas),
      link: `${painel}/conversas?c=${e.conversaId}`,
    })),
    novos: (novos.data ?? []).map((l) => ({
      titulo: nomeParaExibir(l),
      detalhe: l.origem ?? undefined,
      link: `${painel}/leads/${l.id}`,
    })),
    semRetorno,
    ontem,
    imoveisNovos,
    valeRetomar,
    lembretes: (lembretes.data ?? []).map((n) => ({
      titulo: `${horarioEmSP(n.lembrete_em!)} ${n.texto.length > 60 ? `${n.texto.slice(0, 57)}…` : n.texto}`,
      link: `${painel}/anotacoes`,
    })),
  };
}

/** Dia anterior a `dia` (AAAA-MM-DD), em SP. */
function diaAnterior(dia: string): string {
  return diaEmSP(new Date(new Date(`${dia}T12:00:00-03:00`).getTime() - 86_400_000));
}

/**
 * Pós-visita enviado há mais de 24h (e menos de 7 dias) sem nenhuma fala do
 * cliente depois dele. Sem isto, a visita que não teve retorno some do
 * radar: ninguém registra o desfecho e o lead fica parado em "visita".
 */
async function visitasSemRetorno(
  supabase: Supa,
  corretorId: string,
  agora: Date,
  painel: string,
): Promise<ItemDoResumo[]> {
  const { data: enviados } = await supabase
    .from("whatsapp_followups")
    .select("enviado_em, conversa_id, conversa:whatsapp_conversas!inner(corretor_id, lead_id, nome_cliente, telefone_cliente)")
    .eq("tipo", "pos_visita")
    .eq("status", "enviado")
    .eq("conversa.corretor_id", corretorId)
    .gte("enviado_em", new Date(agora.getTime() - 7 * 86_400_000).toISOString())
    .lte("enviado_em", new Date(agora.getTime() - 86_400_000).toISOString())
    .limit(20);

  const itens: ItemDoResumo[] = [];
  for (const f of enviados ?? []) {
    const c = Array.isArray(f.conversa) ? f.conversa[0] : f.conversa;
    if (!c || !f.enviado_em) continue;
    const { count } = await supabase
      .from("whatsapp_mensagens")
      .select("id", { count: "exact", head: true })
      .eq("conversa_id", f.conversa_id)
      .eq("remetente", "cliente")
      .gt("created_at", f.enviado_em);
    if ((count ?? 0) > 0) continue;
    itens.push({
      titulo: nomeParaExibir({ nome: c.nome_cliente, telefone: c.telefone_cliente }),
      detalhe: "registre como foi a visita",
      link: `${painel}/leads/${c.lead_id}`,
    });
  }
  return itens;
}

/**
 * Ontem em números: quantos clientes escreveram (conversas distintas, não
 * mensagens — quem mandou dez balões conta uma vez) e quantas visitas foram
 * marcadas (`visita_marcada_em`, 0122).
 */
async function placarDeOntem(
  supabase: Supa,
  corretorId: string,
  hoje: string,
): Promise<{ clientesQueEscreveram: number; visitasMarcadas: number }> {
  const { inicio, fim } = limitesDoDiaSP(diaAnterior(hoje));
  const [{ data: falas }, { count: visitas }] = await Promise.all([
    supabase
      .from("whatsapp_mensagens")
      .select("conversa_id, conversa:whatsapp_conversas!inner(corretor_id)")
      .eq("conversa.corretor_id", corretorId)
      .eq("remetente", "cliente")
      .gte("created_at", inicio)
      .lt("created_at", fim)
      .limit(5000),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("corretor_id", corretorId)
      .gte("visita_marcada_em", inicio)
      .lt("visita_marcada_em", fim),
  ]);
  return {
    clientesQueEscreveram: new Set((falas ?? []).map((f) => f.conversa_id)).size,
    visitasMarcadas: visitas ?? 0,
  };
}

/** Lead que ainda está no caminho e pode receber mensagem nossa. */
const ETAPAS_ABERTAS = "(novo,primeiro_contato,visita_agendada,documentacao)";

/**
 * Imóvel publicado nas últimas 24h e quantos leads da carteira combinam com
 * ele (a mesma régua da tela do imóvel, `perfilDoLead` + `compatibilidade`).
 * O link leva à tela do imóvel, onde "Mandar este imóvel para eles" monta a
 * campanha. Imóvel sem ninguém que combine não entra: não é notícia para
 * este corretor.
 *
 * Limite conhecido: a janela é pela criação do cadastro. Imóvel criado como
 * rascunho e publicado dias depois não aparece aqui.
 */
async function imoveisNovosQueCombinam(
  supabase: Supa,
  corretorId: string,
  agora: Date,
  painel: string,
): Promise<ItemDoResumo[]> {
  const { data: novos } = await supabase
    .from("empreendimentos")
    .select("nome, slug, cidade, bairro, preco_a_partir, tipologias(dormitorios)")
    .eq("publicado", true)
    .gte("created_at", new Date(agora.getTime() - 86_400_000).toISOString())
    .limit(10);
  if (!novos || novos.length === 0) return [];

  const [{ data: leads }, { data: dossies }, credito] = await Promise.all([
    supabase
      .from("leads")
      .select("id, regiao_interesse, dormitorios_min, orcamento_max, renda_mensal")
      .eq("corretor_id", corretorId)
      .is("arquivado_em", null)
      .is("nao_contatar_em", null)
      .filter("etapa", "in", ETAPAS_ABERTAS)
      .limit(1000),
    supabase.from("lead_observacoes_ia").select("lead_id, orcamento_max").not("orcamento_max", "is", null).limit(2000),
    getParametrosCredito(),
  ]);
  const dossie = new Map((dossies ?? []).map((d) => [d.lead_id, d]));

  const itens: ItemDoResumo[] = [];
  for (const e of novos) {
    const alvo = {
      cidade: e.cidade,
      bairro: e.bairro,
      precoAPartir: e.preco_a_partir != null ? Number(e.preco_a_partir) : null,
      dormitorios: (e.tipologias ?? []).map((t) => t.dormitorios),
    };
    const n = (leads ?? []).filter((l) => compatibilidade(perfilDoLead(l, dossie.get(l.id), credito), alvo).combina).length;
    if (n === 0) continue;
    itens.push({
      titulo: e.nome,
      detalhe: n === 1 ? "1 lead seu combina" : `${n} leads seus combinam`,
      link: `${painel}/imoveis/${e.slug}`,
    });
  }
  return itens;
}

/**
 * Às segundas: até cinco leads parados há 30+ dias que ainda valem uma
 * mensagem — disseram o que procuram, não pediram para sair e não passaram
 * do teto de insistência. Os mais recentemente parados primeiro: são os
 * que ainda lembram de você.
 */
async function leadsQueValemRetomar(
  supabase: Supa,
  corretorId: string,
  agora: Date,
  painel: string,
): Promise<ItemDoResumo[]> {
  const { data } = await supabase
    .from("leads")
    .select("id, nome, telefone, regiao_interesse, etapa_alterada_em")
    .eq("corretor_id", corretorId)
    .is("arquivado_em", null)
    .is("nao_contatar_em", null)
    .filter("etapa", "in", ETAPAS_ABERTAS)
    .lt("tentativas_sem_resposta", 3)
    .lte("etapa_alterada_em", new Date(agora.getTime() - 30 * 86_400_000).toISOString())
    .or("regiao_interesse.not.is.null,dormitorios_min.not.is.null,orcamento_max.not.is.null,renda_mensal.not.is.null")
    .order("etapa_alterada_em", { ascending: false })
    .limit(5);
  return (data ?? []).map((l) => ({
    titulo: nomeParaExibir(l),
    detalhe: l.regiao_interesse ? `procurava em ${l.regiao_interesse}` : undefined,
    link: `${painel}/leads/${l.id}`,
  }));
}
