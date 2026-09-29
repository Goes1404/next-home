import "server-only";
import { site } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/service";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp/provider";
import { diaEmSP } from "@/lib/crm/resumoDoDia";
import {
  horaDoRelatorioDasAvaliacoes,
  montarRelatorioDasAvaliacoes,
  type EntradaDoRelatorio,
} from "@/lib/whatsapp/relatorioDasAvaliacoes";
import { ehMotivoDaAvaliacao, type MotivoDaAvaliacao } from "@/lib/whatsapp/motivosDaAvaliacao";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * Roda a cada tique dos follow-ups (5 min) e só age na segunda de manhã.
 * Mesmo desenho do resumo do dia: sai da instância do corretor para o
 * WhatsApp dele, e o claim (`relatorio_avaliacoes_em`, 0131) é carimbado
 * ANTES do envio, para dois tiques nunca mandarem o relatório duas vezes.
 * Falha de envio não devolve o claim: relatório perdido é uma semana sem
 * relatório; relatório repetido a cada 5 minutos é spam.
 */
export async function enviarRelatoriosDasAvaliacoes(supabase: Supa, agora = new Date()): Promise<number> {
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
      .select("id, nome, whatsapp, ativo, relatorio_avaliacoes_em")
      .eq("id", inst.corretor_id)
      .maybeSingle();
    if (!corretor?.ativo || !corretor.whatsapp) continue;
    if (!horaDoRelatorioDasAvaliacoes(agora, corretor.relatorio_avaliacoes_em)) continue;

    const { data: claim } = await supabase
      .from("corretores")
      .update({ relatorio_avaliacoes_em: hoje })
      .eq("id", corretor.id)
      .or(`relatorio_avaliacoes_em.is.null,relatorio_avaliacoes_em.lt.${hoje}`)
      .select("id");
    if (!claim || claim.length === 0) continue;

    const texto = montarRelatorioDasAvaliacoes({
      ...(await coletar(supabase, corretor.id, agora)),
      nomeCorretor: corretor.nome,
      urlPainel: site.url,
    });
    if (!texto) continue;

    const envio = await enviarMensagemWhatsapp({
      instanceName: inst.instance_name,
      telefone: corretor.whatsapp,
      texto,
    });
    if (envio.enviado) enviados++;
    else console.warn("[relatório das avaliações] falhou:", corretor.id, envio.motivo);
  }
  return enviados;
}

async function coletar(
  supabase: Supa,
  corretorId: string,
  agora: Date,
): Promise<Omit<EntradaDoRelatorio, "nomeCorretor" | "urlPainel">> {
  const desde = new Date(agora.getTime() - 7 * 86_400_000).toISOString();

  const { data: interacoes } = await supabase
    .from("ia_interacoes")
    .select("id, avaliacao, motivo_avaliacao")
    .eq("corretor_id", corretorId)
    .eq("acao", "respondida")
    .eq("e_teste", false)
    .gte("created_at", desde);

  const lista = interacoes ?? [];
  const ruins = lista.filter((i) => i.avaliacao === "ruim");
  const porMotivo: Partial<Record<MotivoDaAvaliacao, number>> = {};
  for (const r of ruins) {
    if (ehMotivoDaAvaliacao(r.motivo_avaliacao)) porMotivo[r.motivo_avaliacao] = (porMotivo[r.motivo_avaliacao] ?? 0) + 1;
  }

  // Um exemplo por motivo: o primeiro balão da resposta reprovada.
  const umPorMotivo = new Map<string, { id: string; motivo: MotivoDaAvaliacao | null }>();
  for (const r of ruins) {
    const chave = r.motivo_avaliacao ?? "sem";
    if (!umPorMotivo.has(chave)) umPorMotivo.set(chave, { id: r.id, motivo: r.motivo_avaliacao });
  }
  const exemplos: EntradaDoRelatorio["exemplos"] = [];
  const escolhidos = [...umPorMotivo.values()].slice(0, 3);
  if (escolhidos.length > 0) {
    const { data: baloes } = await supabase
      .from("whatsapp_mensagens")
      .select("interacao_id, conteudo, created_at")
      .in(
        "interacao_id",
        escolhidos.map((e) => e.id),
      )
      .order("created_at", { ascending: true });
    for (const e of escolhidos) {
      const balao = (baloes ?? []).find((b) => b.interacao_id === e.id);
      if (balao?.conteudo) exemplos.push({ motivo: e.motivo, trecho: balao.conteudo });
    }
  }

  const { count: correcoes } = await supabase
    .from("ia_correcoes")
    .select("id", { count: "exact", head: true })
    .eq("corretor_id", corretorId)
    .gte("created_at", desde);

  return {
    respostas: lista.length,
    boas: lista.filter((i) => i.avaliacao === "boa").length,
    ruins: ruins.length,
    porMotivo,
    ruinsSemMotivo: ruins.filter((r) => !r.motivo_avaliacao).length,
    semAvaliacao: lista.filter((i) => !i.avaliacao).length,
    correcoes: correcoes ?? 0,
    exemplos,
  };
}
