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
  type ItemDoResumo,
} from "@/lib/crm/resumoDoDia";

type Supa = ReturnType<typeof createServiceClient>;

/** Início e fim do dia de São Paulo em UTC. SP é UTC-3 fixo (sem horário de verão). */
function limitesDoDiaSP(dia: string): { inicio: string; fim: string } {
  const inicio = new Date(`${dia}T00:00:00-03:00`);
  return { inicio: inicio.toISOString(), fim: new Date(inicio.getTime() + 86_400_000).toISOString() };
}

/**
 * Roda a cada tique dos follow-ups (5 min). Só age entre 8h e meio-dia de
 * SP, para cada corretor ativo cujo número está conectado — a mensagem sai
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
      .select("id, nome, whatsapp, ativo, resumo_diario_em")
      .eq("id", inst.corretor_id)
      .maybeSingle();
    if (!corretor?.ativo || !corretor.whatsapp) continue;
    if (!horaDeMandarResumo(agora, corretor.resumo_diario_em)) continue;

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
    lembretes: (lembretes.data ?? []).map((n) => ({
      titulo: `${horarioEmSP(n.lembrete_em!)} ${n.texto.length > 60 ? `${n.texto.slice(0, 57)}…` : n.texto}`,
      link: `${painel}/anotacoes`,
    })),
  };
}
