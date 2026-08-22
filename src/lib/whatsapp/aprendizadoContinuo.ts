import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type { Empreendimento } from "@/lib/types";
import {
  escolherExemplos,
  termosDoAssunto,
  type ConversaCandidata,
} from "./recuperacao";

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
 *
 * A RECUPERAÇÃO mudou em agosto/2026. Antes: as 3 conversas mais RECENTES
 * de leads que converteram. Isso falhava por dois lados — exigir conversão
 * significa não aprender nada até a primeira venda fechar (o corpus tinha
 * UMA conversa elegível entre 36), e recência traz o que estava por perto,
 * não o que ajuda. Hoje a escolha é por relevância ao assunto de agora,
 * com conversão e engajamento como sinais fortes (ver `recuperacao.ts`).
 */

export type ExemploConvertido = {
  etapa: string;
  mensagens: { remetente: "cliente" | "bot"; texto: string }[];
};

/**
 * Busca conversas de leads que avançaram no funil, com as trocas reais
 * entre cliente e bot.
 *
 * Nem todo lead convertido tem uma conversa de WhatsApp associada (pode ter
 * vindo por telefone ou e-mail) — por isso busca o dobro do necessário e
 * descarta os que não têm.
 */
export async function buscarConversasRelevantes(params: {
  corretorId: string;
  mensagemAtual: string;
  historico?: { texto: string }[];
  catalogo: Empreendimento[];
  /** Não use a própria conversa como exemplo dela mesma. */
  conversaAtualId?: string;
  limite?: number;
}): Promise<ExemploConvertido[]> {
  const supabase = createServiceClient();

  /*
   * Um SELECT só, com as mensagens embutidas. A versão anterior fazia
   * N+1 consultas (uma por lead, depois uma por conversa) e ainda assim
   * enxergava menos: filtrava por etapa ANTES de olhar o conteúdo.
   */
  const { data: conversas } = await supabase
    .from("whatsapp_conversas")
    .select("id, ultima_interacao_em, lead:leads(etapa), whatsapp_mensagens(remetente, conteudo, created_at)")
    .eq("corretor_id", params.corretorId)
    .not("lead_id", "is", null)
    .order("ultima_interacao_em", { ascending: false })
    .limit(40);

  if (!conversas || conversas.length === 0) return [];

  const termos = termosDoAssunto({
    mensagemAtual: params.mensagemAtual,
    historico: params.historico,
    catalogo: params.catalogo,
  });

  const candidatas: (ConversaCandidata & { mensagens: ExemploConvertido["mensagens"] })[] = [];

  for (const conversa of conversas as unknown as LinhaConversa[]) {
    if (conversa.id === params.conversaAtualId) continue;

    const mensagens = (conversa.whatsapp_mensagens ?? [])
      .filter((m) => m.remetente === "cliente" || m.remetente === "bot")
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((m) => ({ remetente: m.remetente as "cliente" | "bot", texto: m.conteudo }));

    if (mensagens.length < 2) continue;

    candidatas.push({
      conversaId: conversa.id,
      leadEtapa: conversa.lead?.etapa ?? "novo",
      texto: mensagens.map((m) => m.texto).join(" "),
      falasDoCliente: mensagens.filter((m) => m.remetente === "cliente").length,
      atualizadaEm: conversa.ultima_interacao_em,
      mensagens,
    });
  }

  const escolhidas = escolherExemplos(candidatas, termos, params.limite ?? 3);

  return escolhidas.map((escolhida) => {
    const completa = candidatas.find((c) => c.conversaId === escolhida.conversaId)!;
    return { etapa: completa.leadEtapa, mensagens: completa.mensagens };
  });
}

type LinhaConversa = {
  id: string;
  ultima_interacao_em: string;
  lead: { etapa: string } | null;
  whatsapp_mensagens: { remetente: string; conteudo: string; created_at: string }[];
};

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

    // Nem todo exemplo vem de lead convertido agora — e dizer que veio
    // seria mentir para o modelo sobre a força do sinal.
    const selo =
      exemplo.etapa === "novo"
        ? "conversa real da casa"
        : `este lead avançou até a etapa "${exemplo.etapa}"`;

    return `Exemplo real ${indice + 1} (${selo}):\n${linhas}`;
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
export async function buscarExemplosFewShot(params: {
  corretorId: string;
  mensagemAtual: string;
  historico?: { texto: string }[];
  catalogo: Empreendimento[];
  conversaAtualId?: string;
}): Promise<string> {
  try {
    const conversas = await buscarConversasRelevantes(params);
    return formatarExemplosFewShot(conversas);
  } catch (err) {
    console.warn("Aviso: falha ao recuperar conversas para o few-shot:", err);
    return "";
  }
}
