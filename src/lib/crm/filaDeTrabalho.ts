import "server-only";

import { DIAS_ATE_ESQUECER, retornoDasListas } from "@/lib/whatsapp/listaDeTransmissao";
import { createClient } from "@/lib/supabase/server";
import { situacaoDaTarefa, type Tarefa } from "@/lib/crm/timeline";
import { horaDoLembrete, situacaoDoLembrete } from "@/lib/crm/lembretes";
import { nomeParaExibir } from "@/lib/leads/nomeExibido";
import type { Lead } from "@/lib/types";

/**
 * A fila de trabalho do Início — "o que fazer AGORA", em ordem.
 *
 * O painel antigo mostrava números e deixava a decisão com o corretor: 3
 * pendências, 2 visitas, um termômetro. Bonito, mas quem trabalha no celular
 * entre uma visita e outra não quer decidir — quer a próxima ação com um
 * botão do lado (roadmap F3).
 *
 * A ordem é a do custo de perder: visita de hoje some no fim do dia, lead
 * novo esfria em horas, tarefa vencida já está atrasada. Rótulo de IA e lead
 * parado vêm por último — importam, mas esperam.
 */

export type TipoItemFila =
  | "sem_resposta"
  | "visita_hoje"
  | "cliente_recusou"
  | "contato_de_outro_corretor"
  | "lead_novo"
  | "sugestao_de_mensagem"
  | "tarefa_vencida"
  | "tarefa_hoje"
  | "lembrete_vencido"
  | "lembrete_hoje"
  | "sem_revisao"
  | "lista_com_retorno"
  | "lead_parado";

export type ItemFila = {
  /** Único na lista — `${tipo}:${id da origem}`. */
  chave: string;
  tipo: TipoItemFila;
  /** O que fazer, em uma linha. */
  titulo: string;
  /** Por que está aqui (hora da visita, dias parado, prazo da tarefa). */
  detalhe: string;
  /** Para onde o toque leva. */
  href: string;
  /** Ação de contato direto, quando o item tem telefone. */
  whatsapp?: string;
  /** Tarefa de origem — o que permite concluí-la sem sair do Início. */
  tarefaId?: string;
  /** Anotação de origem — permite concluir o lembrete sem sair do Início. */
  anotacaoId?: string;
  /** Conversa de origem — permite pedir a resposta da IA sem sair do Início. */
  conversaId?: string;
  /** Sugestão de mensagem (0147) — permite enviar ou dispensar sem sair do Início. */
  followupId?: string;
  /** Peso na ordenação; menor primeiro. */
  peso: number;
};

/** Quantos itens a fila mostra. Mais que isso vira lista, não fila. */
export const TETO_DA_FILA = 6;

/**
 * Quantos itens individuais do MESMO tipo a fila mostra antes de agrupar.
 *
 * Sem isto, uma importação de dez leads enche as seis vagas com dez linhas
 * iguais — flagrado em produção: seis "Falar com Contato sem nome · Chegou
 * hoje", indistinguíveis entre si, escondendo tudo o que viesse depois. Fila
 * que mostra dez vezes a mesma coisa não é fila, é lista — e o teto de 6
 * existe justamente contra isso.
 *
 * Dois é o número porque um não deixa claro que há mais de um caso, e três
 * já ocupa metade da fila com um assunto só.
 */
export const INDIVIDUAIS_POR_TIPO = 2;

/** Dias sem mexer no lead até ele contar como parado. */
const DIAS_PARA_ESFRIAR = 7;

/**
 * A ordem é a do CUSTO DE PERDER, e `sem_resposta` entra na frente de tudo.
 *
 * Cliente que respondeu e ficou sem resposta é a única situação em que a
 * pessoa já levantou a mão e nós ignoramos — não há sinal mais caro de
 * desperdiçar. Medido em 01/09, quando a trava de campanha estava quebrada:
 * **6 responderam ao disparo e nenhum recebeu resposta**, um deles esperando
 * desde 27/08.
 *
 * Fica acima até da visita de hoje: a visita já está marcada, e quem espera
 * resposta pode desistir a qualquer momento.
 */
const PESO: Record<TipoItemFila, number> = {
  sem_resposta: 0,
  visita_hoje: 1,
  /*
   * A recusa (0110) entra em terceiro, e é a única linha da fila em que o
   * SISTEMA agiu sozinho: calou o bot, cancelou os follow-ups, marcou o lead
   * como perdido e o tirou das campanhas — quatro consequências que ninguém
   * conferiu. Decisão automática sem revisão humana é o que mais merece um
   * olho, e o detector é um regex sobre a fala do cliente: quando ele erra,
   * quem paga é um lead de verdade.
   *
   * Acima da tarefa vencida porque a tarefa JÁ está atrasada e uma hora a
   * mais não muda nada, enquanto a recusa só se reverte enquanto está
   * fresca — uma ligação hoje recupera quem uma ligação na semana que vem
   * não recupera mais.
   */
  cliente_recusou: 2,
  /*
   * Palavra-chave num número que já é lead de OUTRO corretor (0146, regra
   * N6): o sistema recusou sozinho e a IA não vai responder ali. Pesa como a
   * recusa pelo mesmo motivo — decisão automática que o corretor precisa
   * saber enquanto o cliente ainda está na conversa com ele.
   */
  contato_de_outro_corretor: 2,
  // Lembrete de anotação (0100) pesa como TAREFA: os dois são compromissos
  // que o próprio corretor marcou — vencido dói igual, "para hoje" espera
  // igual. Peso repetido é deliberado: dentro do mesmo peso vale a ordem de
  // chegada (mais urgente primeiro).
  tarefa_vencida: 3,
  lembrete_vencido: 3,
  lead_novo: 4,
  /*
   * Mensagem que a IA sugeriu (pós-visita e indicação, 0147). Pesa como lead
   * novo: o cliente acabou de visitar ou de fechar, e o momento esfria em
   * horas, mas nada está atrasado ainda.
   */
  sugestao_de_mensagem: 4,
  tarefa_hoje: 5,
  lembrete_hoje: 5,
  sem_revisao: 6,
  /*
   * O retorno de uma lista de transmissão (roadmap das listas, Fase 3):
   * quem respondeu e quem pede segunda tentativa. Pesa como a revisão da IA:
   * nada está atrasado, mas o ciclo da lista só fecha se alguém olhar.
   */
  lista_com_retorno: 6,
  lead_parado: 7,
};

/**
 * Por quanto tempo uma recusa fica na fila.
 *
 * Não existe marca de "já vi" nesta tela, então a JANELA é o mecanismo de
 * saída — e ela precisa existir: item que não sai vira paisagem, a mesma
 * régua do contador que vive em zero e do alerta sempre aceso. Dois dias é o
 * prazo em que uma ligação ainda reverte; depois disso a linha só ocuparia
 * uma das seis vagas para contar uma notícia velha.
 */
const HORAS_DE_AVISO_DA_RECUSA = 48;

/**
 * O que o cliente disse, em uma linha — a família da recusa em português.
 *
 * Três frases porque as três pedem coisas diferentes do corretor: quem
 * "já resolveu" comprou em outro lugar e não volta; quem "não tem interesse"
 * pode ter recusado a OFERTA, não a imobiliária; e quem pediu para parar não
 * deve ser procurado de novo.
 */
const FRASE_DA_RECUSA: Record<string, string> = {
  parada: "pediu para não receber mais mensagens",
  ja_resolvido: "disse que já resolveu em outro lugar",
  desinteresse: "disse que não tem interesse",
};

const horaCurta = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "America/Sao_Paulo",
});

/** Link de WhatsApp do lead, sem texto pronto — quem escreve é o corretor. */
function whatsappDoLead(lead: Pick<Lead, "telefone">): string | undefined {
  const digitos = (lead.telefone ?? "").replace(/\D/g, "");
  if (digitos.length < 10) return undefined;
  const comPais = digitos.startsWith("55") ? digitos : `55${digitos}`;
  return `https://wa.me/${comPais}`;
}

function diasDesde(iso: string, agora: Date): number {
  return Math.floor((agora.getTime() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * Monta a fila a partir do que já está carregado (tarefas) mais três
 * consultas recortadas — nenhuma delas baixa a carteira: cada uma pede no
 * máximo `TETO_DA_FILA` linhas, porque a fila só mostra isso.
 */
export async function getFilaDeTrabalho(
  tarefas: Tarefa[],
  agora: Date = new Date(),
  /**
   * Id do corretor logado — recorta os lembretes por DESTINATÁRIO. A RLS
   * devolveria também as notas que ele mandou para colegas, e lembrete de
   * colega na fila do autor é ruído: quem age é quem recebe.
   */
  corretorId?: string | null,
): Promise<ItemFila[]> {
  const supabase = await createClient();

  const dia = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);

  const limiteEsfriar = new Date(agora.getTime() - DIAS_PARA_ESFRIAR * 86_400_000).toISOString();

  /*
   * Lembretes das anotações (0100): abertos, com hora marcada, cujo dia em
   * SP já chegou. A situação exata (vencido × hoje) é decidida em memória
   * por `situacaoDoLembrete` — a mesma régua de fuso do resto do painel.
   */
  let consultaLembretes = supabase
    .from("anotacoes")
    .select("id, texto, lembrete_em, lead_id")
    .is("concluida_em", null)
    .not("lembrete_em", "is", null)
    .lte("lembrete_em", `${dia}T23:59:59-03:00`)
    .order("lembrete_em", { ascending: true })
    .limit(TETO_DA_FILA);
  if (corretorId) consultaLembretes = consultaLembretes.eq("destinatario_id", corretorId);

  const limiteRecusa = new Date(
    agora.getTime() - HORAS_DE_AVISO_DA_RECUSA * 3_600_000,
  ).toISOString();

  /*
   * Palavra-chave em lead de outro corretor (0146). Recorta pelo corretor
   * LOGADO mesmo quando ele é ADM: a RLS mostra ao ADM as tentativas de
   * todos, e o aviso é só de quem digitou.
   */
  const consultaAlheios = corretorId
    ? supabase
        .from("ativacoes_em_lead_alheio")
        .select("id, telefone, created_at")
        .eq("corretor_id", corretorId)
        .gte("created_at", limiteRecusa)
        .order("created_at", { ascending: false })
        .limit(INDIVIDUAIS_POR_TIPO)
    : Promise.resolve({ data: [] as { id: string; telefone: string; created_at: string }[] });

  const consultaSugestoes = supabase
    .from("whatsapp_followups")
    .select("id, tipo, texto_sugerido, conversa_id, sugerido_em")
    .eq("status", "sugerido")
    .order("sugerido_em", { ascending: false })
    .limit(INDIVIDUAIS_POR_TIPO);

  /*
   * As listas que voltaram algo (Fase 3): itens enviados nos últimos 14
   * dias deste corretor. Magro: cinco colunas e teto de 500 linhas.
   */
  const consultaListas = corretorId
    ? supabase
        .from("whatsapp_campanhas_fila")
        .select("campanha_id, lead_id, status, enviado_em, resposta_em, campanha:whatsapp_campanhas!inner(titulo, corretor_id)")
        .eq("campanha.corretor_id", corretorId)
        .in("status", ["enviado", "respondido"])
        .gte("enviado_em", new Date(agora.getTime() - DIAS_ATE_ESQUECER * 86_400_000).toISOString())
        .limit(500)
    : Promise.resolve({ data: [] as never[] });

  const [esperando, visitas, recusas, novos, parados, revisao, lembretes, alheios, sugestoes, listas] = await Promise.all([
    /*
     * Quem falou com a gente e está esperando (0087). Primeiro item da fila
     * porque é a única situação em que a pessoa já levantou a mão e nós
     * ignoramos — não há sinal mais caro de desperdiçar.
     *
     * A view já recorta por ATENDIMENTO: sem isso a fila encheria de
     * conversa pessoal, porque a instância roda no WhatsApp do corretor.
     */
    supabase
      .from("whatsapp_esperando_resposta")
      .select("conversa_id, lead_id, telefone_cliente, nome_cliente, esperando_desde", {
        count: "exact",
      })
      .order("esperando_desde", { ascending: true })
      .limit(TETO_DA_FILA),
    supabase
      .from("leads")
      .select("id, nome, telefone, visita_agendada_em")
      .is("arquivado_em", null)
      .eq("etapa", "visita_agendada")
      .gte("visita_agendada_em", `${dia}T00:00:00-03:00`)
      .lte("visita_agendada_em", `${dia}T23:59:59-03:00`)
      .order("visita_agendada_em", { ascending: true })
      .limit(TETO_DA_FILA),
    /*
     * Quem recusou nas últimas 48h (0110). A fonte é `nao_contatar_em`, o
     * FATO — não a etapa, que anda e volta: bastaria alguém arrastar o
     * cartão de volta para "Novo" e o aviso sumiria sem nada ter mudado do
     * lado do cliente.
     */
    supabase
      .from("leads")
      .select("id, nome, telefone, nao_contatar_em, nao_contatar_motivo", { count: "exact" })
      .is("arquivado_em", null)
      .gte("nao_contatar_em", limiteRecusa)
      .order("nao_contatar_em", { ascending: false })
      .limit(TETO_DA_FILA),
    supabase
      .from("leads")
      .select("id, nome, telefone, created_at", { count: "exact" })
      .is("arquivado_em", null)
      .eq("etapa", "novo")
      .order("created_at", { ascending: true })
      .limit(TETO_DA_FILA),
    supabase
      .from("leads")
      .select("id, nome, telefone, etapa_alterada_em", { count: "exact" })
      .is("arquivado_em", null)
      .in("etapa", ["primeiro_contato", "visita_agendada", "documentacao"])
      .lt("etapa_alterada_em", limiteEsfriar)
      .order("etapa_alterada_em", { ascending: true })
      .limit(TETO_DA_FILA),
    // Só a contagem: a fila leva o corretor para a tela de Conversas, que é
    // onde a revisão acontece balão a balão.
    supabase
      .from("ia_interacoes")
      .select("id", { count: "exact", head: true })
      .in("origem", ["webhook", "followup"])
      .eq("e_teste", false)
      .in("acao", ["respondida", "visita_confirmada"])
      .is("avaliacao", null)
      .not("conversa_id", "is", null),
    consultaLembretes,
    consultaAlheios,
    consultaSugestoes,
    consultaListas,
  ]);

  /*
   * Quem está esperando numa conversa com a IA DESLIGADA (o corretor assumiu,
   * 03/10/2026): a IA não vai responder, então a fila diz isso em vez de só
   * "sem resposta". Uma consulta só, sobre as conversas que já vieram.
   */
  const idsEsperando = (esperando.data ?? []).map((c) => c.conversa_id as string).filter(Boolean);
  const iaDesligadaEm = new Set<string>();
  const nomePorConversa = new Map<string, string>();
  const idsSugestao = (sugestoes.data ?? []).map((f) => f.conversa_id);
  if (idsEsperando.length > 0 || idsSugestao.length > 0) {
    const { data: conversasDaFila } = await supabase
      .from("whatsapp_conversas")
      .select("id, bot_ativo, nome_cliente, telefone_cliente")
      .in("id", [...idsEsperando, ...idsSugestao]);
    for (const c of conversasDaFila ?? []) {
      if (!c.bot_ativo) iaDesligadaEm.add(c.id);
      nomePorConversa.set(c.id, c.nome_cliente || c.telefone_cliente);
    }
  }

  const itens: ItemFila[] = [];

  for (const conversa of esperando.data ?? []) {
    const desde = new Date(conversa.esperando_desde as string);
    const horas = Math.floor((agora.getTime() - desde.getTime()) / 3_600_000);

    itens.push({
      chave: `sem_resposta:${conversa.conversa_id}`,
      tipo: "sem_resposta",
      conversaId: conversa.conversa_id as string,
      titulo: `Responder ${conversa.nome_cliente || conversa.telefone_cliente || "cliente"}`,
      /*
       * A espera em horas, e em DIAS quando passa de um: "há 5 dias" dói
       * como tem de doer, e "há 47 horas" ninguém converte de cabeça.
       */
      detalhe: iaDesligadaEm.has(conversa.conversa_id as string)
        ? `Escreveu há ${horas >= 24 ? `${Math.floor(horas / 24)}d` : horas >= 1 ? `${horas}h` : "menos de 1h"} · a IA está desligada nesta conversa, é com você`
        : horas >= 24
          ? `Escreveu há ${Math.floor(horas / 24)} dia${horas >= 48 ? "s" : ""} e está sem resposta`
          : horas >= 1
            ? `Escreveu há ${horas}h e está sem resposta`
            : "Acabou de escrever",
      href: `/corretor/conversas?c=${conversa.conversa_id}`,
      whatsapp: conversa.telefone_cliente
        ? `https://wa.me/${String(conversa.telefone_cliente).replace(/\D/g, "")}`
        : undefined,
      peso: PESO.sem_resposta,
    });
  }

  for (const lead of visitas.data ?? []) {
    itens.push({
      chave: `visita_hoje:${lead.id}`,
      tipo: "visita_hoje",
      titulo: `Visita com ${nomeParaExibir(lead)}`,
      detalhe: lead.visita_agendada_em
        ? `Hoje às ${horaCurta.format(new Date(lead.visita_agendada_em))}`
        : "Hoje, sem horário definido",
      href: `/corretor/leads/${lead.id}`,
      whatsapp: whatsappDoLead(lead),
      peso: PESO.visita_hoje,
    });
  }

  for (const lead of (recusas.data ?? []).slice(0, INDIVIDUAIS_POR_TIPO)) {
    const motivo = String(lead.nao_contatar_motivo ?? "desinteresse");
    const horas = Math.floor(
      (agora.getTime() - new Date(lead.nao_contatar_em as string).getTime()) / 3_600_000,
    );
    itens.push({
      chave: `cliente_recusou:${lead.id}`,
      tipo: "cliente_recusou",
      titulo: `${nomeParaExibir(lead)} ${FRASE_DA_RECUSA[motivo] ?? FRASE_DA_RECUSA.desinteresse}`,
      detalhe:
        horas >= 1
          ? `Há ${horas}h · saiu das listas de transmissão`
          : "Agora há pouco · saiu das listas de transmissão",
      href: `/corretor/leads/${lead.id}`,
      /*
       * Só quem NÃO pediu para parar leva o botão de WhatsApp. Para os
       * outros dois o toque é o caminho de resgate — a recusa pode ter sido
       * da OFERTA, não da imobiliária, e o corretor nunca foi barrado pelo
       * `nao_contatar_em` (decisão da spec: ele é uma pessoa decidindo).
       * Para quem pediu para sair, um botão de conversa a um toque do nome é
       * o caminho curto para a denúncia, que é o sinal mais forte que existe
       * contra o número.
       */
      whatsapp: motivo === "parada" ? undefined : whatsappDoLead(lead),
      peso: PESO.cliente_recusou,
    });
  }

  for (const sugestao of sugestoes.data ?? []) {
    if (!sugestao.texto_sugerido) continue;
    const quem = nomePorConversa.get(sugestao.conversa_id) ?? "cliente";
    itens.push({
      chave: `sugestao_de_mensagem:${sugestao.id}`,
      tipo: "sugestao_de_mensagem",
      followupId: sugestao.id,
      conversaId: sugestao.conversa_id,
      titulo:
        sugestao.tipo === "indicacao"
          ? `Pedir indicação a ${quem}`
          : `Perguntar a ${quem} o que achou da visita`,
      detalhe: `“${sugestao.texto_sugerido}”`,
      href: `/corretor/conversas?c=${sugestao.conversa_id}`,
      peso: PESO.sugestao_de_mensagem,
    });
  }

  for (const tentativa of alheios.data ?? []) {
    const digitos = tentativa.telefone.replace(/\D/g, "");
    itens.push({
      chave: `contato_de_outro_corretor:${tentativa.id}`,
      tipo: "contato_de_outro_corretor",
      // Sem o nome do dono, de propósito (regra N6).
      titulo: `O contato ${digitos} já é atendido por outro corretor`,
      detalhe: "A IA não vai responder aqui. Fale com a gestão se precisar da transferência.",
      href: `https://wa.me/${digitos}`,
      peso: PESO.contato_de_outro_corretor,
    });
  }

  const recusasAlem = (recusas.count ?? 0) - INDIVIDUAIS_POR_TIPO;
  if (recusasAlem > 0) {
    itens.push({
      chave: "cliente_recusou:resto",
      tipo: "cliente_recusou",
      titulo: `Mais ${recusasAlem} cliente${recusasAlem === 1 ? "" : "s"} recusou o contato`,
      detalhe: "Abrir a lista dos perdidos para conferir",
      href: "/corretor/leads?etapa=perdido",
      // Sem WhatsApp, como no agrupado de leads novos: o item aponta para
      // várias pessoas, e abriria a conversa de quem?
      peso: PESO.cliente_recusou,
    });
  }

  for (const lead of (novos.data ?? []).slice(0, INDIVIDUAIS_POR_TIPO)) {
    const dias = diasDesde(lead.created_at, agora);
    itens.push({
      chave: `lead_novo:${lead.id}`,
      tipo: "lead_novo",
      titulo: `Falar com ${nomeParaExibir(lead)}`,
      detalhe:
        dias === 0 ? "Chegou hoje, sem atendimento" : `Esperando há ${dias} ${dias === 1 ? "dia" : "dias"}`,
      href: `/corretor/leads/${lead.id}`,
      whatsapp: whatsappDoLead(lead),
      peso: PESO.lead_novo,
    });
  }

  const novosAlem = (novos.count ?? 0) - INDIVIDUAIS_POR_TIPO;
  if (novosAlem > 0) {
    itens.push({
      chave: "lead_novo:resto",
      tipo: "lead_novo",
      titulo: `Mais ${novosAlem} lead${novosAlem === 1 ? "" : "s"} novo${novosAlem === 1 ? "" : "s"} esperando`,
      detalhe: "Abrir a lista para atender de uma vez",
      href: "/corretor/leads?etapa=novo",
      // Sem WhatsApp: o item aponta para VÁRIAS pessoas, e um botão de
      // conversa aqui abriria a de quem? Ação em lote acontece na lista.
      peso: PESO.lead_novo,
    });
  }

  for (const tarefa of tarefas) {
    const situacao = situacaoDaTarefa(tarefa, agora);
    if (situacao !== "atrasada" && situacao !== "hoje") continue;
    itens.push({
      chave: `tarefa:${tarefa.id}`,
      tipo: situacao === "atrasada" ? "tarefa_vencida" : "tarefa_hoje",
      titulo: tarefa.titulo,
      detalhe:
        situacao === "atrasada"
          ? `Atrasada desde ${new Date(tarefa.prazo).toLocaleDateString("pt-BR")}`
          : `Para hoje, ${horaCurta.format(new Date(tarefa.prazo))}`,
      href: tarefa.lead ? `/corretor/leads/${tarefa.lead.id}` : "/corretor/leads",
      tarefaId: tarefa.id,
      peso: situacao === "atrasada" ? PESO.tarefa_vencida : PESO.tarefa_hoje,
    });
  }

  for (const nota of lembretes.data ?? []) {
    const situacao = situacaoDoLembrete(nota.lembrete_em as string, agora);
    if (situacao === "futuro") continue;
    const resumo = String(nota.texto).replace(/\s+/g, " ").trim();
    itens.push({
      chave: `lembrete:${nota.id}`,
      tipo: situacao === "vencido" ? "lembrete_vencido" : "lembrete_hoje",
      titulo: resumo.length > 64 ? `${resumo.slice(0, 63).trimEnd()}…` : resumo,
      detalhe:
        situacao === "vencido"
          ? `Lembrete das ${horaDoLembrete(nota.lembrete_em as string)}`
          : `Lembrete para hoje, ${horaDoLembrete(nota.lembrete_em as string)}`,
      href: nota.lead_id ? `/corretor/leads/${nota.lead_id}` : "/corretor/anotacoes",
      anotacaoId: nota.id,
      peso: situacao === "vencido" ? PESO.lembrete_vencido : PESO.lembrete_hoje,
    });
  }

  const semRevisao = revisao.count ?? 0;
  if (semRevisao > 0) {
    itens.push({
      chave: "sem_revisao",
      tipo: "sem_revisao",
      titulo: `Revisar ${semRevisao} resposta${semRevisao === 1 ? "" : "s"} da IA`,
      detalhe: "Um 👍 ou 👎 ensina o atendimento",
      href: "/corretor/conversas",
      peso: PESO.sem_revisao,
    });
  }

  for (const lead of (parados.data ?? []).slice(0, INDIVIDUAIS_POR_TIPO)) {
    const dias = diasDesde(lead.etapa_alterada_em, agora);
    itens.push({
      chave: `lead_parado:${lead.id}`,
      tipo: "lead_parado",
      titulo: `Retomar ${nomeParaExibir(lead)}`,
      detalhe: `Parado há ${dias} dias`,
      href: `/corretor/leads/${lead.id}`,
      whatsapp: whatsappDoLead(lead),
      peso: PESO.lead_parado,
    });
  }

  const paradosAlem = (parados.count ?? 0) - INDIVIDUAIS_POR_TIPO;
  if (paradosAlem > 0) {
    itens.push({
      chave: "lead_parado:resto",
      tipo: "lead_parado",
      titulo: `Mais ${paradosAlem} lead${paradosAlem === 1 ? "" : "s"} parado${paradosAlem === 1 ? "" : "s"}`,
      detalhe: `Sem movimento há mais de ${DIAS_PARA_ESFRIAR} dias`,
      // `?parado=N` é o parâmetro que a lista de fato lê (o mesmo dos KPIs
      // da administração). Conferido: `?filtro=` não existe e seria ignorado
      // em silêncio, levando o corretor para a lista inteira.
      href: `/corretor/leads?parado=${DIAS_PARA_ESFRIAR}`,
      peso: PESO.lead_parado,
    });
  }

  const retornos = retornoDasListas(
    (listas.data ?? []).map((i: { campanha_id: string; lead_id: string | null; status: string; enviado_em: string | null; resposta_em: string | null; campanha: unknown }) => {
      const c = (Array.isArray(i.campanha) ? i.campanha[0] : i.campanha) as { titulo: string } | null;
      return {
        campanhaId: i.campanha_id,
        titulo: c?.titulo ?? "sem título",
        leadId: i.lead_id,
        status: i.status,
        enviadoEm: i.enviado_em,
        respostaEm: i.resposta_em,
      };
    }),
    agora,
  );
  for (const r of retornos.slice(0, INDIVIDUAIS_POR_TIPO)) {
    if (r.responderam > 0) {
      itens.push({
        chave: `lista_com_retorno:${r.campanhaId}:respostas`,
        tipo: "lista_com_retorno",
        titulo: `${r.responderam} responde${r.responderam === 1 ? "u" : "ram"} à lista “${r.titulo}”`,
        detalhe: "A IA está atendendo — veja as conversas",
        href: `/corretor/conversas?lista=${r.campanhaId}`,
        peso: PESO.lista_com_retorno,
      });
    } else if (r.semResposta.length > 0) {
      itens.push({
        chave: `lista_com_retorno:${r.campanhaId}:segunda`,
        tipo: "lista_com_retorno",
        titulo: `${r.semResposta.length} da lista “${r.titulo}” não ${r.semResposta.length === 1 ? "respondeu" : "responderam"}`,
        detalhe: "Uma semana depois: montar uma segunda tentativa?",
        href: `/corretor/campanhas?leads=${r.semResposta.slice(0, 300).join(",")}`,
        peso: PESO.lista_com_retorno,
      });
    }
  }

  return ordenarFila(itens).slice(0, TETO_DA_FILA);
}

/**
 * Ordena por peso e, dentro do mesmo peso, mantém a ordem em que os itens
 * chegaram (as consultas já vêm ordenadas por urgência: visita mais cedo,
 * lead mais antigo). Exportada para o teste — a regra de prioridade é a
 * decisão de produto desta tela, e ela merece prova.
 */
export function ordenarFila(itens: ItemFila[]): ItemFila[] {
  return [...itens].sort((a, b) => a.peso - b.peso);
}
