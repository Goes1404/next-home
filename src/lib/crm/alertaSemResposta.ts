import "server-only";
import { site } from "@/lib/site";
import type { createServiceClient } from "@/lib/supabase/service";
import { nomeParaExibir } from "@/lib/leads/nomeExibido";
import { avisarCorretor } from "@/lib/crm/avisoAoCorretor";
import {
  HORAS_LIMITE_DO_AVISO,
  MINUTOS_SEM_RESPOSTA,
  dentroDoHorarioDeAviso,
  precisaAvisar,
  textoDoAvisoSemResposta,
  type EsperaParaAviso,
} from "@/lib/crm/clienteSemResposta";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * Avisa no WhatsApp do corretor quem está sem resposta há 30 minutos (0161).
 * Roda no tique dos follow-ups. As réguas estão em `clienteSemResposta.ts`.
 *
 * A fonte é a MESMA view da fila do Início e da varredura de respostas
 * atrasadas (`whatsapp_esperando_resposta`): duas contas de "quem espera"
 * divergiriam, e o aviso diria que alguém espera enquanto a tela não.
 *
 * O carimbo (`aviso_sem_resposta_em`) é o claim, gravado ANTES do envio,
 * como no lead sem contato: dois tiques ao mesmo tempo não avisam duas
 * vezes. Se o envio falhar, a pessoa continua na fila do Início.
 */
export async function alertarClientesSemResposta(supabase: Supa, agora = new Date()): Promise<number> {
  if (!dentroDoHorarioDeAviso(agora)) return 0;

  const ate = new Date(agora.getTime() - MINUTOS_SEM_RESPOSTA * 60_000).toISOString();
  const desde = new Date(agora.getTime() - HORAS_LIMITE_DO_AVISO * 3_600_000).toISOString();
  const { data: esperando } = await supabase
    .from("whatsapp_esperando_resposta")
    .select("conversa_id, corretor_id, lead_id, nome_cliente, telefone_cliente, esperando_desde")
    .gte("esperando_desde", desde)
    .lte("esperando_desde", ate)
    .order("esperando_desde", { ascending: true })
    .limit(30);

  const linhas = (esperando ?? []).filter((l) => l.conversa_id && l.corretor_id && l.lead_id);
  if (linhas.length === 0) return 0;

  const [{ data: conversas }, { data: leads }] = await Promise.all([
    supabase
      .from("whatsapp_conversas")
      .select("id, bot_ativo, e_teste, aviso_sem_resposta_em")
      .in("id", linhas.map((l) => l.conversa_id!)),
    supabase
      .from("leads")
      .select("id, nome, telefone, arquivado_em, nao_contatar_em")
      .in("id", linhas.map((l) => l.lead_id!)),
  ]);
  const conversaPorId = new Map((conversas ?? []).map((c) => [c.id, c]));
  const leadPorId = new Map((leads ?? []).map((l) => [l.id, l]));

  const porCorretor = new Map<string, EsperaParaAviso[]>();

  for (const linha of linhas) {
    const conversa = conversaPorId.get(linha.conversa_id!);
    const lead = leadPorId.get(linha.lead_id!);
    if (!conversa || !lead || conversa.e_teste || lead.arquivado_em || lead.nao_contatar_em) continue;

    // Última resposta nossa e a primeira fala do cliente depois dela.
    const { data: resposta } = await supabase
      .from("whatsapp_mensagens")
      .select("created_at")
      .eq("conversa_id", conversa.id)
      .in("remetente", ["bot", "corretor"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const ultimaRespostaNossa = resposta?.created_at ?? null;

    let primeira = supabase
      .from("whatsapp_mensagens")
      .select("created_at")
      .eq("conversa_id", conversa.id)
      .eq("remetente", "cliente")
      .order("created_at", { ascending: true })
      .limit(1);
    if (ultimaRespostaNossa) primeira = primeira.gt("created_at", ultimaRespostaNossa);
    const { data: inicio } = await primeira.maybeSingle();
    if (!inicio?.created_at) continue;

    const decisao = precisaAvisar({
      inicioDaEspera: inicio.created_at,
      ultimaRespostaNossa,
      avisadoEm: conversa.aviso_sem_resposta_em,
      agora,
    });
    if (!decisao.avisar) continue;

    let claim = supabase
      .from("whatsapp_conversas")
      .update({ aviso_sem_resposta_em: agora.toISOString() })
      .eq("id", conversa.id);
    claim = ultimaRespostaNossa
      ? claim.or(`aviso_sem_resposta_em.is.null,aviso_sem_resposta_em.lt.${ultimaRespostaNossa}`)
      : claim.is("aviso_sem_resposta_em", null);
    const { data: pegou } = await claim.select("id");
    if (!pegou || pegou.length === 0) continue;

    const lista = porCorretor.get(linha.corretor_id!) ?? [];
    lista.push({
      nome: nomeParaExibir({ nome: lead.nome ?? linha.nome_cliente, telefone: lead.telefone ?? linha.telefone_cliente }),
      minutos: decisao.minutos,
      iaDesligada: !conversa.bot_ativo,
      link: `${site.url}/corretor/conversas?c=${conversa.id}`,
    });
    porCorretor.set(linha.corretor_id!, lista);
  }

  let avisados = 0;
  for (const [corretorId, esperas] of porCorretor) {
    if (await avisarCorretor(supabase, corretorId, textoDoAvisoSemResposta(esperas, site.url))) {
      avisados += esperas.length;
    }
  }
  return avisados;
}
