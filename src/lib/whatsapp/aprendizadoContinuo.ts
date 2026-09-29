import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import type { Empreendimento } from "@/lib/types";
import {
  escolherExemplos,
  termosDoAssunto,
  type ConversaCandidata,
} from "./recuperacao";
import { escolherCorrecoes, formatarCorrecoes, type Correcao } from "./correcoesDoCorretor";
import {
  escolherAprovadas,
  extrairAprovadas,
  formatarAprovadas,
  type RespostaAprovada,
} from "./respostasAprovadas";

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
  return (await lerAprendizado(params)).exemplos;
}

/**
 * As conversas do corretor lidas UMA vez, e delas saem as duas coisas: os
 * exemplos inteiros (few-shot) e as respostas que ele aprovou com 👍.
 */
async function lerAprendizado(params: {
  corretorId: string;
  mensagemAtual: string;
  historico?: { texto: string }[];
  catalogo: Empreendimento[];
  conversaAtualId?: string;
  limite?: number;
}): Promise<{ exemplos: ExemploConvertido[]; aprovadas: RespostaAprovada[] }> {
  const supabase = createServiceClient();

  /*
   * Um SELECT só, com as mensagens embutidas. A versão anterior fazia
   * N+1 consultas (uma por lead, depois uma por conversa) e ainda assim
   * enxergava menos: filtrava por etapa ANTES de olhar o conteúdo.
   */
  const { data: conversas } = await supabase
    .from("whatsapp_conversas")
    .select("id, ultima_interacao_em, lead:leads(etapa), whatsapp_mensagens(remetente, conteudo, created_at, interacao_id)")
    .eq("corretor_id", params.corretorId)
    .not("lead_id", "is", null)
    /*
     * Conversa de teste NÃO vira exemplo. Isto não é higiene de relatório:
     * estas conversas entram no PROMPT como few-shot, então o corpus de
     * teste da equipe — a mãe do corretor, um amigo, uma conversa sobre
     * aula de escola e dezenas de "Teste" — estava sendo ensinado ao
     * agente como se fosse atendimento que funcionou. Ver migration 0038.
     */
    .eq("e_teste", false)
    .order("ultima_interacao_em", { ascending: false })
    .limit(40);

  if (!conversas || conversas.length === 0) return { exemplos: [], aprovadas: [] };

  /*
   * O que o corretor achou das respostas da IA nessas conversas (👍/👎).
   * Uma consulta só, pelos ids que já vieram no embed.
   */
  const idsDasRespostas = (conversas as unknown as LinhaConversa[]).flatMap((c) =>
    (c.whatsapp_mensagens ?? []).map((m) => m.interacao_id).filter((id): id is string => Boolean(id)),
  );
  const aprovadasIds = new Set<string>();
  const reprovadasIds = new Set<string>();
  if (idsDasRespostas.length > 0) {
    const { data: avaliadas } = await supabase
      .from("ia_interacoes")
      .select("id, avaliacao")
      .in("id", [...new Set(idsDasRespostas)])
      .not("avaliacao", "is", null);
    for (const a of avaliadas ?? []) {
      if (a.avaliacao === "boa") aprovadasIds.add(a.id);
      if (a.avaliacao === "ruim") reprovadasIds.add(a.id);
    }
  }
  const aprovadas: RespostaAprovada[] = [];

  const termos = termosDoAssunto({
    mensagemAtual: params.mensagemAtual,
    historico: params.historico,
    catalogo: params.catalogo,
  });

  const candidatas: (ConversaCandidata & { mensagens: ExemploConvertido["mensagens"] })[] = [];

  for (const conversa of conversas as unknown as LinhaConversa[]) {
    if (conversa.id === params.conversaAtualId) continue;

    const ordenadas = (conversa.whatsapp_mensagens ?? [])
      .filter((m) => m.remetente === "cliente" || m.remetente === "bot")
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const mensagens = ordenadas.map((m) => ({ remetente: m.remetente as "cliente" | "bot", texto: m.conteudo }));
    aprovadas.push(
      ...extrairAprovadas(
        ordenadas.map((m) => ({ remetente: m.remetente, texto: m.conteudo, interacaoId: m.interacao_id })),
        aprovadasIds,
      ),
    );
    const idsDaConversa = ordenadas.map((m) => m.interacao_id).filter((id): id is string => Boolean(id));

    if (mensagens.length < 2) continue;

    candidatas.push({
      conversaId: conversa.id,
      leadEtapa: conversa.lead?.etapa ?? "novo",
      texto: mensagens.map((m) => m.texto).join(" "),
      falasDoCliente: mensagens.filter((m) => m.remetente === "cliente").length,
      atualizadaEm: conversa.ultima_interacao_em,
      respostasAprovadas: new Set(idsDaConversa.filter((id) => aprovadasIds.has(id))).size,
      respostasReprovadas: new Set(idsDaConversa.filter((id) => reprovadasIds.has(id))).size,
      mensagens,
    });
  }

  const escolhidas = escolherExemplos(candidatas, termos, params.limite ?? 3);

  return {
    exemplos: escolhidas.map((escolhida) => {
      const completa = candidatas.find((c) => c.conversaId === escolhida.conversaId)!;
      return { etapa: completa.leadEtapa, mensagens: completa.mensagens };
    }),
    aprovadas,
  };
}

type LinhaConversa = {
  id: string;
  ultima_interacao_em: string;
  lead: { etapa: string } | null;
  whatsapp_mensagens: { remetente: string; conteudo: string; created_at: string; interacao_id: string | null }[];
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
  const [exemplos, correcoes] = await Promise.all([
    lerAprendizado(params)
      .then(({ exemplos, aprovadas }) =>
        [formatarExemplosFewShot(exemplos), formatarAprovadas(escolherAprovadas(aprovadas, params.mensagemAtual))]
          .filter(Boolean)
          .join("\n\n"),
      )
      .catch((err) => {
        console.warn("Aviso: falha ao recuperar conversas para o few-shot:", err);
        return "";
      }),
    buscarCorrecoes(params.corretorId, params.mensagemAtual).catch((err) => {
      console.warn("Aviso: falha ao ler as correções do corretor:", err);
      return "";
    }),
  ]);
  return [exemplos, correcoes].filter(Boolean).join("\n\n");
}

/**
 * As correções que o corretor escreveu no Live Chat (0125). Só as DELE: o
 * jeito de um corretor não é regra para a carteira de outro.
 */
async function buscarCorrecoes(corretorId: string, mensagemAtual: string): Promise<string> {
  const { data } = await createServiceClient()
    .from("ia_correcoes")
    .select("fala_cliente, resposta_ia, resposta_certa")
    .eq("corretor_id", corretorId)
    .eq("ativa", true)
    .order("created_at", { ascending: false })
    .limit(40);
  const lista: Correcao[] = (data ?? []).map((c) => ({
    falaCliente: c.fala_cliente,
    respostaIa: c.resposta_ia,
    respostaCerta: c.resposta_certa,
  }));
  return formatarCorrecoes(escolherCorrecoes(lista, mensagemAtual));
}

/**
 * Quantos exemplos o bloco de aprendizado levou ao prompt (conversas,
 * correções e respostas aprovadas). O "por quê?" do Live Chat mostrava o
 * TAMANHO do texto ("2.345 exemplos"), porque o turno contava caracteres.
 */
export function contarExemplosDoAprendizado(bloco: string | undefined): number {
  return (bloco ?? "").match(/^(Exemplo real|Correção|Aprovada) \d+/gm)?.length ?? 0;
}
