import type { MensagemConversa } from "./acoes";
import {
  decidirSeAIaResponde,
  fraseDaDecisao,
  HORAS_PAUSA_HUMANA,
  silencioDaConversa,
  type ConfigDoNumero,
  type SituacaoDaConversa,
} from "@/lib/whatsapp/quandoAIaResponde";

/**
 * Quanto se lê de uma conversa (30/09/2026). A abertura trazia 100 mensagens
 * e o reconcílio de 15s relia as MESMAS 100, com a avaliação e o contexto de
 * cada resposta da IA, o tempo todo em que a conversa estivesse aberta.
 *
 * - Abertura e "ver anteriores": 60 — mais que uma tela cheia no computador,
 *   e o resto vem por página.
 * - Reconcílio e releitura depois de enviar: só as 20 mais recentes. Ele
 *   existe para trazer o que mudou PERTO do fim (avaliação, vínculo com a
 *   telemetria, a mensagem que o Realtime perdeu); `mesclar` junta por id e
 *   não apaga as páginas antigas.
 */
export const MENSAGENS_POR_PAGINA = 60;
export const JANELA_DO_RECONCILIO = 20;

/**
 * O MODELO da conversa do painel — tipos e utilitários puros — separado do
 * componente `Chat` (F4 do roadmap de performance, 13/09/2026).
 *
 * Existe por um motivo de PESO: a gaveta de Pessoas precisa de `estadoDa`,
 * `mesclar` e dos tipos, mas só precisa do `Chat` (1.600 linhas, o maior
 * client component do painel) quando alguém abre uma conversa. Com tudo no
 * mesmo arquivo, importar um utilitário arrastava o componente inteiro para
 * o JavaScript da lista. Agora a gaveta importa daqui e carrega o `Chat`
 * por `next/dynamic`, no toque.
 *
 * Nada aqui foi alterado ao mover — o commit é só de arquivo, pela mesma
 * régua que separou `Chat.tsx` de `ConversasClient.tsx` em 10/09.
 */

export type ConversaResumo = {
  id: string;
  telefone: string;
  nome: string | null;
  botAtivo: boolean;
  pausadoAte: string | null;
  ultimaMensagem: string | null;
  ultimaInteracaoEm: string;
  temLead: boolean;
  naoLidas: number;
  /**
   * A MEMÓRIA da conversa (0110) — o estado da negociação que a IA carrega.
   *
   * Fica VISÍVEL e editável porque resumo errado que ninguém conserta vira
   * erro repetido em toda mensagem; e porque, sem ver o que ela lembra, o
   * 👍/👎 julga o texto sozinho.
   */
  memoria: string | null;
  memoriaDoCorretor: boolean;
  /**
   * A palavra-chave cadastrou este número e o histórico anterior do chat não
   * pôde ser trazido (0146). A conversa avisa, para o corretor não achar que
   * a IA leu o que não leu.
   */
  historicoIndisponivel?: boolean;
  /** O lead pediu para não ser contatado (0110). */
  naoContatar?: boolean;
  /**
   * O lead desta conversa é de OUTRO corretor (transferido depois que a
   * conversa começou): a RLS esconde a ficha dele, então a conversa tem
   * `lead_id` mas o lead não vem.
   */
  contatoDeOutroCorretor?: boolean;
};

/** A linha crua que o Realtime entrega no INSERT/UPDATE de whatsapp_mensagens. */
export type MensagemRow = {
  id: string;
  conversa_id: string;
  remetente: "cliente" | "bot" | "corretor";
  conteudo: string;
  created_at: string;
  tipo: "texto" | "audio" | "imagem" | "documento";
  midia_url: string | null;
  status_entrega: "enviada" | "entregue" | "lida" | null;
  interacao_id: string | null;
};

/** A linha crua do INSERT de whatsapp_conversas (conversa recém-nascida). */
export type ConversaRow = {
  id: string;
  telefone_cliente: string;
  nome_cliente: string | null;
  bot_ativo: boolean;
  pausado_humano_ate: string | null;
  ultima_mensagem: string | null;
  ultima_interacao_em: string;
  lead_id: string | null;
  nao_lidas: number;
  memoria?: string | null;
  memoria_do_corretor?: boolean;
  historico_anterior?: string | null;
  lead?: { nao_contatar_em: string | null } | { nao_contatar_em: string | null }[] | null;
};

export const hora = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
});
export const diaCurto = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
export const diaLongo = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

/** "5511991234567" → "(11) 99123-4567", que é como o corretor reconhece o cliente. */
export function telefoneLegivel(e164: string): string {
  const d = e164.replace(/\D/g, "").replace(/^55/, "");
  if (d.length < 10) return e164;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  const meio = resto.length === 9 ? resto.slice(0, 5) : resto.slice(0, 4);
  return `(${ddd}) ${meio}-${resto.slice(meio.length)}`;
}

/** Hora se foi hoje, dd/mm caso contrário — a régua do WhatsApp para a lista. */
export function quandoNaLista(iso: string): string {
  const data = new Date(iso);
  const agora = new Date();
  return data.toDateString() === agora.toDateString()
    ? hora.format(data)
    : diaCurto.format(data);
}

/** "Hoje", "Ontem" ou a data por extenso — o separador entre blocos de dias. */
export function rotuloDoDia(iso: string): string {
  const data = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(hoje.getTime() - 86_400_000);
  if (data.toDateString() === hoje.toDateString()) return "Hoje";
  if (data.toDateString() === ontem.toDateString()) return "Ontem";
  return diaLongo.format(data);
}

export function iniciais(conversa: ConversaResumo): string {
  if (conversa.nome) {
    const partes = conversa.nome.trim().split(/\s+/);
    return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "?";
  }
  return conversa.telefone.replace(/\D/g, "").slice(-2);
}

export function deRow(row: ConversaRow): ConversaResumo {
  return {
    id: row.id,
    telefone: row.telefone_cliente,
    nome: row.nome_cliente,
    botAtivo: row.bot_ativo,
    pausadoAte: row.pausado_humano_ate,
    ultimaMensagem: row.ultima_mensagem,
    ultimaInteracaoEm: row.ultima_interacao_em,
    temLead: Boolean(row.lead_id),
    naoLidas: row.nao_lidas ?? 0,
    memoria: row.memoria ?? null,
    memoriaDoCorretor: row.memoria_do_corretor ?? false,
    historicoIndisponivel: row.historico_anterior === "indisponivel",
    ...sinaisDoLead(row),
  };
}

export function deMensagemRow(row: MensagemRow): MensagemConversa {
  return {
    id: row.id,
    remetente: row.remetente,
    conteudo: row.conteudo,
    criadoEm: row.created_at,
    tipo: row.tipo,
    midiaUrl: row.midia_url,
    statusEntrega: row.status_entrega,
    interacaoId: row.interacao_id,
    // Só para mensagem que CHEGA por realtime — nova, portanto sem avaliação.
    // Na carga da conversa quem traz a avaliação é `lerMensagens`, com uma
    // segunda consulta em ia_interacoes. (O comentário antigo falava de um
    // "reconcílio periódico" que não existe; enganou uma investigação.)
    avaliacao: null,
    motivoAvaliacao: null,
    // Pelo mesmo motivo, sem contexto: a linha de telemetria é escrita DEPOIS
    // do envio, e é o reconcílio de 15s que a traz.
    contexto: null,
  };
}

/**
 * Funde duas listas de mensagens sem duplicar e em ordem cronológica.
 * É a ÚNICA forma de escrever no cache: o histórico chega por quatro
 * caminhos (carga, Realtime, reconcílio, página antiga) e qualquer um que
 * substituísse em vez de fundir jogaria fora o que os outros trouxeram.
 */
export function mesclar(
  atual: MensagemConversa[] | undefined,
  novas: MensagemConversa[],
): MensagemConversa[] {
  const porId = new Map<string, MensagemConversa>();
  for (const m of atual ?? []) porId.set(m.id, m);
  for (const m of novas) porId.set(m.id, m);
  return [...porId.values()].sort((a, b) =>
    a.criadoEm === b.criadoEm
      ? a.id < b.id
        ? -1
        : 1
      : a.criadoEm < b.criadoEm
        ? -1
        : 1,
  );
}

export type Estado = "ativa" | "pausada_humano" | "desligada";

/**
 * O que a conversa tem de seu para a decisão de responder — o formato que
 * `quandoAIaResponde.ts` lê. A tela e o webhook passam pela MESMA função; foi
 * um selo que refazia as condições por conta própria (e olhava duas de três)
 * que mostrou "IA atendendo" por semanas com a IA muda.
 */
export function situacaoDoResumo(conversa: ConversaResumo): SituacaoDaConversa {
  return {
    botAtivo: conversa.botAtivo,
    pausadoAte: conversa.pausadoAte,
    naoContatar: conversa.naoContatar,
    leadDeOutroCorretor: conversa.contatoDeOutroCorretor,
  };
}

/**
 * O selo da lista: só a camada da CONVERSA. A do número (modo, expediente)
 * é igual para todas as conversas e aparece na frase do cabeçalho.
 */
export function estadoDa(conversa: ConversaResumo, agora: Date = new Date()): Estado {
  const silencio = silencioDaConversa(situacaoDoResumo(conversa), agora);
  if (!silencio) return "ativa";
  return silencio.motivo === "pausada_pelo_corretor" ? "pausada_humano" : "desligada";
}

/** O que vem do lead embutido na conversa (`lead:leads(nao_contatar_em)`). */
export function sinaisDoLead(row: {
  lead_id: string | null;
  lead?: { nao_contatar_em: string | null } | { nao_contatar_em: string | null }[] | null;
}): { naoContatar: boolean; contatoDeOutroCorretor: boolean } {
  const lead = Array.isArray(row.lead) ? row.lead[0] : row.lead;
  return {
    naoContatar: Boolean(lead?.nao_contatar_em),
    // `undefined` = a consulta não pediu o lead; só `null` com lead_id é
    // lead que a RLS escondeu.
    contatoDeOutroCorretor: row.lead === null && Boolean(row.lead_id),
  };
}

/** O que o cabeçalho precisa saber do número para explicar o silêncio da IA. */
export type ContextoDaIA = ConfigDoNumero | null;

/**
 * POR QUE a IA está ou não respondendo, em uma frase (plano de ativação,
 * 5.1). Sai de `decidirSeAIaResponde` — a mesma função que o webhook aplica.
 *
 * `estado` é o da TELA, que muda antes do banco (botão de ligar/desligar,
 * mensagem enviada): ele ajusta a situação da conversa antes de decidir,
 * para a frase não contradizer o selo nos segundos em que o servidor ainda
 * não respondeu. A pausa otimista usa a mesma duração que o banco grava.
 */
export function fraseDoEstado(
  conversa: ConversaResumo,
  estado: Estado,
  ia: ContextoDaIA,
  agora: Date = new Date(),
): string {
  const situacao = situacaoDoResumo(conversa);
  const pausaGravada = conversa.pausadoAte && new Date(conversa.pausadoAte).getTime() > agora.getTime();
  const ajustada = {
    ...situacao,
    botAtivo: estado !== "desligada",
    pausadoAte:
      estado === "pausada_humano"
        ? pausaGravada
          ? conversa.pausadoAte
          : new Date(agora.getTime() + HORAS_PAUSA_HUMANA * 3_600_000)
        : null,
  };
  return fraseDaDecisao(decidirSeAIaResponde({ conversa: ajustada, numero: ia, agora }), ia);
}

/*
 * Azul-céu para "atendendo" desde 03/10/2026 (plano de ativação, 5.3): o
 * verde passou a ser só da etapa Fechado, que aparece ao lado na mesma tela,
 * e as cores do funil não repetem as do estado da IA.
 */
export const SELO: Record<Estado, { texto: string; classe: string; ponto: string }> = {
  ativa: { texto: "IA atendendo", classe: "text-info", ponto: "bg-info" },
  pausada_humano: { texto: "IA em pausa", classe: "text-alerta", ponto: "bg-alerta" },
  desligada: { texto: "IA desligada", classe: "text-apoio", ponto: "bg-linha-forte" },
};

/**
 * A MEMÓRIA da conversa, no alto do chat — visível e editável (0110).
 *
 * ## Por que ela aparece
 *
 * A memória é o que a IA carrega para a próxima mensagem: o estado da
 * negociação em prosa, que sobrevive à janela de 40 falas. Deixá-la
 * escondida no banco tem dois custos medidos nesta base. Resumo errado que
 * ninguém conserta vira erro repetido em TODA mensagem seguinte — e o 👍/👎
 * por balão julga o texto sozinho, sem saber o que ela tinha na mão (a
 * mesma lacuna que `ia_interacoes.contexto` veio fechar na 0105).
 *
 * ## Por que recolhida por padrão
 *
 * O que a corretora abre esta tela para fazer é CONVERSAR. Um parágrafo de
 * até 1.200 caracteres aberto empurraria os balões para fora da tela do
 * celular a cada abertura — e bloco que sempre está lá vira paisagem, a
 * mesma régua do aviso de evolução e da faixa de queda do número.
 *
 * ## O que o corretor ganha ao corrigir
 *
 * Gravar por aqui carimba `memoria_do_corretor`, e a partir daí a extração
 * PRESERVA o texto dele e só acrescenta o que for novo. Sem esse carimbo, a
 * correção seria desfeita na mensagem seguinte — e é assim que alguém para
 * de corrigir. A linha embaixo do botão diz isso em português, porque a
 * diferença entre "a IA escreveu" e "você escreveu" muda o que acontece
 * depois e não se lê em lugar nenhum.
 */
