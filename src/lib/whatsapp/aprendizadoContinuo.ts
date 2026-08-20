import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * Aprendizado contínuo do agente.
 *
 * Um LLM não aprende em tempo real nem entre chamadas — isso é fato, não
 * limitação de implementação. O que dá para construir sobre essa realidade
 * é isto: a cada mensagem nova, o agente relê trechos reais de conversas que
 * DE FATO avançaram no funil (visita, proposta, negociação, fechamento) e
 * imita o padrão de tom e argumento que funcionou com aquele corretor,
 * naquele empreendimento.
 *
 * É recalculado a cada resposta em vez de depender de um job semanal —
 * então nunca fica desatualizado esperando o próximo lote, e não exige
 * nenhuma infraestrutura de agendamento que este projeto ainda não tem.
 */

export type ExemploConvertido = {
  etapa: string;
  mensagens: { remetente: "cliente" | "bot"; texto: string }[];
};

/** Etapas do funil (ver `0007_crm_funil.sql`) que provam que a conversa funcionou. */
const ETAPAS_CONVERTIDAS = ["visita_agendada", "proposta_enviada", "negociacao", "fechado"] as const;

/**
 * Busca conversas de leads que avançaram no funil, com as trocas reais
 * entre cliente e bot.
 *
 * Nem todo lead convertido tem uma conversa de WhatsApp associada (pode ter
 * vindo por telefone ou e-mail) — por isso busca o dobro do necessário e
 * descarta os que não têm.
 */
export async function buscarConversasConvertidas(
  corretorId: string,
  limiteConversas = 3,
): Promise<ExemploConvertido[]> {
  const supabase = createServiceClient();

  const { data: leads } = await supabase
    .from("leads")
    .select("id, etapa")
    .eq("corretor_id", corretorId)
    .in("etapa", ETAPAS_CONVERTIDAS)
    .order("etapa_alterada_em", { ascending: false })
    .limit(limiteConversas * 2);

  if (!leads || leads.length === 0) return [];

  const exemplos: ExemploConvertido[] = [];

  for (const lead of leads) {
    if (exemplos.length >= limiteConversas) break;

    const { data: conversa } = await supabase
      .from("whatsapp_conversas")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("corretor_id", corretorId)
      .maybeSingle();

    if (!conversa) continue;

    const { data: mensagens } = await supabase
      .from("whatsapp_mensagens")
      .select("remetente, conteudo")
      .eq("conversa_id", conversa.id)
      .in("remetente", ["cliente", "bot"])
      .order("created_at", { ascending: true })
      .limit(16);

    // Conversa vazia ou de um só lado não ensina padrão nenhum de venda.
    if (!mensagens || mensagens.length < 2) continue;

    exemplos.push({
      etapa: lead.etapa,
      mensagens: mensagens.map((m) => ({
        remetente: m.remetente as "cliente" | "bot",
        texto: m.conteudo,
      })),
    });
  }

  return exemplos;
}

/**
 * Formata os exemplos como texto pronto para entrar no prompt do sistema.
 *
 * Função pura — sem rede nem banco — para poder ser testada com dados
 * fabricados em vez de depender de um Supabase real rodando.
 */
export function formatarExemplosFewShot(exemplos: ExemploConvertido[]): string {
  if (exemplos.length === 0) return "";

  const blocos = exemplos.map((exemplo, indice) => {
    // Só a cauda da conversa: é onde mora o argumento que emplacou, e
    // manter o prompt curto importa mais do que reproduzir a saudação.
    const linhas = exemplo.mensagens
      .slice(-10)
      .map((m) => `${m.remetente === "cliente" ? "Cliente" : "Você"}: ${m.texto}`)
      .join("\n");

    return `Exemplo real ${indice + 1} (este lead avançou até a etapa "${exemplo.etapa}"):\n${linhas}`;
  });

  return blocos.join("\n\n");
}

/**
 * Busca e formata em um único passo — é isto que o webhook chama.
 *
 * Falha aqui (Supabase fora do ar, corretor sem histórico) nunca pode
 * derrubar a resposta ao cliente: volta string vazia e o prompt segue sem a
 * seção de exemplos, exatamente como um corretor novo sem histórico ainda.
 */
export async function buscarExemplosFewShot(corretorId: string): Promise<string> {
  try {
    const conversas = await buscarConversasConvertidas(corretorId);
    return formatarExemplosFewShot(conversas);
  } catch (err) {
    console.warn("Aviso: falha ao buscar exemplos few-shot de conversas convertidas:", err);
    return "";
  }
}
