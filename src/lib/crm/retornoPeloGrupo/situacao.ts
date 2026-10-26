import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import type { Aguardando, AvisoDoGrupo } from "./identificar";

export type Banco = ReturnType<typeof createServiceClient>;

/** Até onde se olha para trás nas confirmações e perguntas de um corretor. */
const TETO_DE_RETORNOS = 200;

export type EnvioDoLead = {
  id: string;
  leadId: string;
  tentativas: number;
  retornoEm: string | null;
};

/** Tudo de que `escolherLeadDoRetorno` precisa, lido do banco e sempre recortado pelo grupo. */
export type SituacaoDoCorretor = {
  aguardando: Aguardando[];
  avisos: AvisoDoGrupo[];
  confirmacoes: Array<{ retornoId: string; mensagemId: string; leadId: string }>;
  perguntas: Array<{ retornoId: string; mensagemId: string; opcoes: string[] }>;
  nomes: Map<string, string | null>;
  envios: Map<string, EnvioDoLead>;
};

const ENCERRADAS = new Set(["perdido", "fechado"]);

export async function carregarSituacao(
  supabase: Banco,
  grupoId: string,
  corretorId: string,
  citadaId: string | null,
): Promise<SituacaoDoCorretor> {
  const [envios, citado, retornos, retornoCitado] = await Promise.all([
    supabase
      .from("lead_envios_grupo")
      .select("id, lead_id, corretor_id, provider_message_id, retorno_em, tentativas_ligacao, enviado_em")
      .eq("grupo_id", grupoId)
      .eq("corretor_id", corretorId)
      .eq("status", "enviado"),
    /*
     * O aviso citado pode ter saído deste grupo e depois passado para outro
     * corretor (o aviso é um por lead). Sem ele na lista, a citação não seria
     * reconhecida e o relato cairia na regra do "único aguardando", indo
     * parar em OUTRO cliente.
     */
    citadaId
      ? supabase
          .from("lead_envios_grupo")
          .select("id, lead_id, corretor_id, provider_message_id, retorno_em, tentativas_ligacao, enviado_em")
          .eq("grupo_id", grupoId)
          .eq("provider_message_id", citadaId)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("retornos_de_ligacao")
      .select("id, lead_id, status, confirmacao_mensagem_id, opcoes, created_at")
      .eq("grupo_id", grupoId)
      .eq("corretor_id", corretorId)
      .not("confirmacao_mensagem_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(TETO_DE_RETORNOS),
    /*
     * A confirmação ou pergunta citada é procurada direto (índice da 0218):
     * fora da janela dos últimos retornos ela não seria reconhecida, e o relato
     * cairia nas regras sem citação, podendo ir para outro cliente.
     */
    citadaId
      ? supabase
          .from("retornos_de_ligacao")
          .select("id, lead_id, status, confirmacao_mensagem_id, opcoes, created_at")
          .eq("grupo_id", grupoId)
          .eq("corretor_id", corretorId)
          .eq("confirmacao_mensagem_id", citadaId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (envios.error) throw new Error(`avisos do corretor: ${envios.error.message}`);
  if (citado.error) throw new Error(`aviso citado: ${citado.error.message}`);
  if (retornos.error) throw new Error(`retornos do corretor: ${retornos.error.message}`);
  if (retornoCitado.error) throw new Error(`retorno citado: ${retornoCitado.error.message}`);

  const linhasDeEnvio = [...(envios.data ?? [])].sort((a, b) =>
    String(a.enviado_em ?? "").localeCompare(String(b.enviado_em ?? "")),
  );
  const avisoAlheio = (citado.data ?? []).filter((c) => !linhasDeEnvio.some((e) => e.id === c.id));
  const idsDeLead = [...new Set([...linhasDeEnvio, ...avisoAlheio].map((e) => e.lead_id))];

  const leads = new Map<string, { nome: string | null; etapa: string; corretorId: string | null }>();
  if (idsDeLead.length > 0) {
    const { data, error } = await supabase
      .from("leads")
      .select("id, nome, etapa, corretor_id")
      .eq("grupo_id", grupoId)
      .in("id", idsDeLead);
    if (error) throw new Error(`leads avisados: ${error.message}`);
    for (const l of data ?? []) leads.set(l.id, { nome: l.nome || null, etapa: l.etapa, corretorId: l.corretor_id });
  }

  const avisos: AvisoDoGrupo[] = [];
  const aguardando: Aguardando[] = [];
  const nomes = new Map<string, string | null>();
  const mapaDeEnvios = new Map<string, EnvioDoLead>();
  for (const e of linhasDeEnvio) {
    const lead = leads.get(e.lead_id);
    // Lead apagado (ou de outro grupo): o aviso não serve para nada.
    if (!lead) continue;
    nomes.set(e.lead_id, lead.nome);
    mapaDeEnvios.set(e.lead_id, {
      id: e.id,
      leadId: e.lead_id,
      tentativas: e.tentativas_ligacao ?? 0,
      retornoEm: e.retorno_em,
    });
    // Sem dono, o lead não é de ninguém: a citação dele cai em "não é mais seu".
    const corretorAtualId = lead.corretorId ?? "";
    avisos.push({ envioId: e.id, leadId: e.lead_id, avisoMensagemId: e.provider_message_id, corretorAtualId });
    if (e.retorno_em === null && corretorAtualId === corretorId && !ENCERRADAS.has(lead.etapa)) {
      aguardando.push({
        envioId: e.id,
        leadId: e.lead_id,
        nome: lead.nome,
        avisoMensagemId: e.provider_message_id,
        corretorAtualId,
      });
    }
  }
  for (const e of avisoAlheio) {
    const lead = leads.get(e.lead_id);
    if (!lead) continue;
    nomes.set(e.lead_id, lead.nome);
    // Só reconhece a citação: o relato não vale para um aviso que não é dele.
    const corretorAtualId = lead.corretorId === corretorId && e.corretor_id === corretorId ? corretorId : "";
    avisos.push({ envioId: e.id, leadId: e.lead_id, avisoMensagemId: e.provider_message_id, corretorAtualId });
  }

  const confirmacoes: SituacaoDoCorretor["confirmacoes"] = [];
  const perguntas: SituacaoDoCorretor["perguntas"] = [];
  const recentes = retornos.data ?? [];
  const citados = (retornoCitado.data ?? []).filter((c) => !recentes.some((r) => r.id === c.id));
  for (const r of [...recentes, ...citados]) {
    if (!r.confirmacao_mensagem_id) continue;
    // A pergunta "Esse retorno é sobre" também guarda o id da mensagem que o
    // número central mandou; não é confirmação, e citá-la não é correção.
    if (r.status === "aguardando_escolha") {
      perguntas.push({ retornoId: r.id, mensagemId: r.confirmacao_mensagem_id, opcoes: r.opcoes ?? [] });
    } else if (r.lead_id) {
      confirmacoes.push({ retornoId: r.id, mensagemId: r.confirmacao_mensagem_id, leadId: r.lead_id });
    }
  }

  return { aguardando, avisos, confirmacoes, perguntas, nomes, envios: mapaDeEnvios };
}
