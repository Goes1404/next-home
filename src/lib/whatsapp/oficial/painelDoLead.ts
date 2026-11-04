import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { consentimentoDoLead } from "./consentimento";
import { numeroDoGrupo } from "./numeros";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * O que a ficha do lead mostra do número oficial da imobiliária (F3).
 *
 * Só o corretor DONO do lead vê (quem chama confere): o gestor nunca lê
 * conversa (0134), e as tabelas do número oficial são só do servidor (0258),
 * por isso a leitura é pela chave de serviço, sempre recortada pelo grupo.
 *
 * Tipos de retorno escritos à mão, como em `telaDoGestor.ts`: o `tsc` do
 * projeto roda perto do limite padrão de memória do Node.
 */

export type MensagemDoPainel = {
  id: string;
  remetente: "cliente" | "bot" | "corretor" | "sistema";
  tipo: string;
  conteudo: string;
  status: string | null;
  em: string;
};

export type ConversaDoPainel = {
  id: string;
  telefone: string;
  janelaAte: string | null;
  iaAtiva: boolean;
  assumidaEm: string | null;
  mensagens: MensagemDoPainel[];
};

export type PainelOficialDoLead = {
  numero: { numero: string | null; nomeExibicao: string | null; ativo: boolean; resposta: "ia" | "mensagem_fixa" | "nenhuma" };
  conversa: ConversaDoPainel | null;
  consentimento: { estado: "concedido" | "revogado" | "sem_registro"; desde: string | null; origem: string | null };
};

const MENSAGENS_NO_PAINEL = 30;

export async function painelOficialDoLead(supabase: Supa, grupoId: string, leadId: string): Promise<PainelOficialDoLead | null> {
  const numero = await numeroDoGrupo(supabase, grupoId);
  if (!numero) return null;

  const { data: conversas } = await supabase
    .from("whatsapp_oficial_conversas")
    .select("id, telefone, janela_ate, ia_ativa, assumida_em")
    .eq("grupo_id", grupoId)
    .eq("numero_oficial_id", numero.id)
    .eq("lead_id", leadId)
    .order("ultima_interacao_em", { ascending: false, nullsFirst: false })
    .limit(1);
  const linha = ((conversas ?? []) as {
    id: string;
    telefone: string;
    janela_ate: string | null;
    ia_ativa: boolean;
    assumida_em: string | null;
  }[])[0];

  let conversa: ConversaDoPainel | null = null;
  if (linha) {
    const { data: mensagens } = await supabase
      .from("whatsapp_oficial_mensagens")
      .select("id, remetente, tipo, conteudo, status_entrega, created_at")
      .eq("grupo_id", grupoId)
      .eq("conversa_id", linha.id)
      .order("created_at", { ascending: false })
      .limit(MENSAGENS_NO_PAINEL);
    const lidas = (mensagens ?? []) as {
      id: string;
      remetente: MensagemDoPainel["remetente"];
      tipo: string;
      conteudo: string;
      status_entrega: string | null;
      created_at: string;
    }[];
    conversa = {
      id: linha.id,
      telefone: linha.telefone,
      janelaAte: linha.janela_ate,
      iaAtiva: linha.ia_ativa,
      assumidaEm: linha.assumida_em,
      mensagens: lidas
        .map((m) => ({ id: m.id, remetente: m.remetente, tipo: m.tipo, conteudo: m.conteudo, status: m.status_entrega, em: m.created_at }))
        .reverse(),
    };
  }

  return {
    numero: {
      numero: numero.numero,
      nomeExibicao: numero.nome_exibicao,
      ativo: numero.estado === "ativo",
      resposta: numero.resposta,
    },
    conversa,
    consentimento: await consentimentoDoLead(supabase, leadId),
  };
}

/** A janela de 24 h que a resposta do cliente abre ainda vale? */
export function janelaAberta(janelaAte: string | null, agora: Date = new Date()): boolean {
  return Boolean(janelaAte && new Date(janelaAte).getTime() > agora.getTime());
}
