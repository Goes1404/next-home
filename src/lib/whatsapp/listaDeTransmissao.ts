/**
 * As regras da lista de transmissão que não dependem de banco nem de rede
 * (roadmap das listas, 03/10/2026). Módulo PURO: a tela, o disparador e os
 * testes leem a mesma régua.
 *
 * Quatro assuntos:
 *
 * 1. As VARIÁVEIS da mensagem ({bairro}, {link}, {horarios}...), resolvidas
 *    a partir do cadastro do imóvel e do corretor.
 * 2. A conferência ANTES de cada envio: quem pediu para sair, foi arquivado,
 *    perdido ou transferido depois de a lista ser montada não recebe.
 * 3. O que fazer com cada FALHA de envio, sem duplicar mensagem e sem
 *    bloquear o número por culpa de um cadastro ruim.
 * 4. A PREVISÃO de quando a lista termina, que a tela mostra no lugar de
 *    "uma a cada minuto".
 */
import { INTERVALO_MAXIMO_SEGUNDOS, INTERVALO_MINIMO_SEGUNDOS, momentoEmSaoPaulo } from "./antiBan";
import { precoAPartirDe } from "@/lib/format";
import type { Empreendimento } from "@/lib/types";

// ------------------------------------------------------------------ variáveis

/** As variáveis que a mensagem aceita, na ordem em que a tela as oferece. */
export const VARIAVEIS_DA_MENSAGEM = [
  { chave: "nome", exemplo: "Ana", descricao: "primeiro nome da pessoa" },
  { chave: "imovel", exemplo: "Dom Parque", descricao: "nome do imóvel" },
  { chave: "bairro", exemplo: "Jardim Tupanci", descricao: "bairro do imóvel" },
  { chave: "cidade", exemplo: "Barueri", descricao: "cidade do imóvel" },
  { chave: "a_partir_de", exemplo: "A partir de R$ 480.000", descricao: "preço inicial cadastrado" },
  { chave: "dormitorios", exemplo: "2 e 3 dormitórios", descricao: "dormitórios das plantas" },
  { chave: "link", exemplo: "o link da página do imóvel", descricao: "página do imóvel no site" },
  { chave: "corretor", exemplo: "Bruna", descricao: "seu primeiro nome" },
  { chave: "horarios", exemplo: "sábado às 10h ou segunda às 15h", descricao: "dois horários livres da sua agenda" },
] as const;

export type ChaveDaVariavel = (typeof VARIAVEIS_DA_MENSAGEM)[number]["chave"];

/** As variáveis resolvidas na CRIAÇÃO da lista e guardadas nela. */
export type ContextoTemplate = Partial<Record<Exclude<ChaveDaVariavel, "nome" | "horarios">, string>>;

/** Dormitórios das plantas em palavras: "2 e 3 dormitórios", "3 dormitórios". */
export function dormitoriosEmPalavras(dorms: readonly number[]): string | null {
  const unicos = [...new Set(dorms.filter((d) => d > 0))].sort((a, b) => a - b);
  if (unicos.length === 0) return null;
  const lista =
    unicos.length === 1
      ? String(unicos[0])
      : `${unicos.slice(0, -1).join(", ")} e ${unicos.at(-1)}`;
  return `${lista} dormitório${unicos.length === 1 && unicos[0] === 1 ? "" : "s"}`;
}

/**
 * As variáveis do imóvel e do corretor, a partir do cadastro.
 *
 * O que o cadastro não tem fica de FORA do contexto: é assim que
 * `variaveisSemValor` sabe avisar antes de a lista sair com um buraco no meio
 * da frase.
 */
export function contextoDaLista(params: {
  imovel: Pick<Empreendimento, "nome" | "bairro" | "cidade" | "precoAPartir" | "tipologias"> | null;
  linkDoImovel: string | null;
  corretorNome: string | null;
}): ContextoTemplate {
  const ctx: ContextoTemplate = {};
  const { imovel } = params;
  if (imovel) {
    if (imovel.nome.trim()) ctx.imovel = imovel.nome.trim();
    if (imovel.bairro?.trim()) ctx.bairro = imovel.bairro.trim();
    if (imovel.cidade?.trim()) ctx.cidade = imovel.cidade.trim();
    if (imovel.precoAPartir && imovel.precoAPartir > 0) ctx.a_partir_de = precoAPartirDe(imovel.precoAPartir);
    const dorms = dormitoriosEmPalavras(imovel.tipologias.map((t) => t.dormitorios));
    if (dorms) ctx.dormitorios = dorms;
  }
  if (params.linkDoImovel) ctx.link = params.linkDoImovel;
  const primeiro = params.corretorNome?.trim().split(/\s+/)[0];
  if (primeiro) ctx.corretor = primeiro;
  return ctx;
}

const MARCADOR = /\{([a-z_]+)\}/gi;

/** As variáveis que o texto usa, sem repetir, em minúsculas. */
export function variaveisUsadas(texto: string): string[] {
  return [...new Set([...texto.matchAll(MARCADOR)].map((m) => m[1].toLowerCase()))];
}

/**
 * As variáveis do texto que vão sair VAZIAS.
 *
 * `{nome}` nunca entra: quem não tem nome útil recebe a frase sem o nome
 * (`trocarNome`). Variável desconhecida também conta como sem valor: mandar
 * "{bairo}" para o cliente é o mesmo defeito.
 */
export function variaveisSemValor(
  texto: string,
  contexto: ContextoTemplate,
  opcoes: { temAgenda: boolean },
): string[] {
  return variaveisUsadas(texto).filter((chave) => {
    if (chave === "nome") return false;
    if (chave === "horarios") return !opcoes.temAgenda;
    return !contexto[chave as keyof ContextoTemplate];
  });
}

/** Troca as variáveis do imóvel e do corretor. `{nome}` e `{horarios}` ficam para depois. */
export function aplicarContexto(texto: string, contexto: ContextoTemplate): string {
  return texto.replace(MARCADOR, (inteiro, chave: string) => {
    const k = chave.toLowerCase();
    if (k === "nome" || k === "horarios") return inteiro;
    return contexto[k as keyof ContextoTemplate] ?? inteiro;
  });
}

/**
 * Troca `{nome}` pelo primeiro nome, ou tira o marcador sem deixar buraco.
 *
 * Quem não tinha nome útil recebia "Tudo bem?" no lugar do nome, e o
 * resultado dependia de onde o corretor tinha posto o marcador: "Oi {nome},
 * tudo bem?" saía "Oi Tudo bem?, tudo bem?". Agora o marcador some com a
 * pontuação que só existia por causa dele: "Olá, {nome}!" vira "Olá!",
 * "Oi {nome}, tudo bem?" vira "Oi, tudo bem?", e "{nome}, saiu..." vira
 * "Saiu...". Quebra de linha é preservada: parágrafo é decisão do corretor.
 */
export function trocarNome(texto: string, primeiroNome: string | null): string {
  if (!/\{nome\}/i.test(texto)) return texto;
  if (primeiroNome) return texto.replace(/\{nome\}/gi, primeiroNome);
  const semMarcador = texto
    .replace(/^\s*\{nome\}[ \t]*[,!.:;]?[ \t]*/i, "")
    .replace(/[ \t]*,[ \t]*\{nome\}(?=[ \t]*[,.!?;:]|[ \t]*$)/gim, "")
    .replace(/[ \t]+\{nome\}(?=[ \t]*[,.!?;:])/gi, "")
    .replace(/[ \t]*\{nome\}/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.!?;:])/g, "$1")
    .replace(/^[\s,.;:!]+/, "");
  return semMarcador.charAt(0).toUpperCase() + semMarcador.slice(1);
}

/**
 * Troca `{horarios}` por dois horários livres da agenda, NO ENVIO.
 *
 * Resolver na criação ofereceria horário que alguém já marcou até a mensagem
 * sair (a fila anda devagar de propósito). Sem horário livre, a frase vira
 * um convite aberto em vez de um buraco.
 */
export function resolverHorarios(texto: string, rotulos: readonly string[]): string {
  if (!/\{horarios\}/i.test(texto)) return texto;
  const escolhidos = rotulos.slice(0, 2).map((r) => r.replace(/^(\p{L})/u, (l) => l.toLowerCase()));
  const valor = escolhidos.length > 0 ? escolhidos.join(" ou ") : "um horário que fique bom para você";
  return texto.replace(/\{horarios\}/gi, valor);
}

// --------------------------------------------------- conferência antes do envio

export type LeadNoEnvio = {
  nao_contatar_em: string | null;
  arquivado_em: string | null;
  etapa: string;
  corretor_id: string | null;
} | null;

/**
 * Por que este item NÃO pode sair agora, ou null quando pode.
 *
 * A lista é montada num instante e sai ao longo de horas. Nesse meio tempo
 * o cliente pode pedir para sair, o corretor pode arquivar, marcar como
 * perdido ou passar o lead para um colega. Antes desta conferência, a
 * mensagem saía mesmo assim — inclusive para quem tinha dito "não quero
 * mais", e a linha do tempo dele dizia "saiu das campanhas".
 */
export function motivoParaNaoEnviar(
  lead: LeadNoEnvio,
  campanha: { corretor_id: string; criterio: { filtro?: string } | null },
): string | null {
  if (!lead) return "O lead foi excluído.";
  if (lead.nao_contatar_em) return "Pediu para não receber mais mensagens.";
  if (lead.arquivado_em) return "Lead arquivado depois de a lista ser montada.";
  if (lead.corretor_id !== campanha.corretor_id) return "Lead passou para outro corretor.";
  if (lead.etapa === "perdido") return "Lead marcado como perdido.";
  if (lead.etapa === "fechado" && campanha.criterio?.filtro !== "compradores") {
    return "Lead já comprou.";
  }
  return null;
}

// --------------------------------------------------------- falhas de envio

/**
 * O que uma falha de envio significa para a fila e para o número.
 *
 * - `inexistente`: o telefone não tem WhatsApp. Dado do lead, não do número:
 *   erro definitivo, cota devolvida, disjuntor intocado.
 * - `dados`: o telefone do cadastro não vira número válido. Mesmo tratamento.
 * - `incerto`: o provedor demorou demais ou respondeu sem comprovante. A
 *   mensagem PODE ter saído: tentar de novo arrisca mandar duas vezes, que é
 *   pior que não mandar. Erro definitivo, com aviso para conferir a conversa.
 *   Conta para o disjuntor: provedor que não responde está doente.
 * - `provedor`: recusa clara (HTTP de erro). Nada saiu: vale tentar de novo.
 */
export type ClasseDaFalha = "inexistente" | "dados" | "incerto" | "provedor";

export function classificarFalhaDeEnvio(envio: { motivo?: string; detalhe?: string }): ClasseDaFalha {
  const detalhe = envio.detalhe ?? "";
  if (/"exists"\s*:\s*false/.test(detalhe)) return "inexistente";
  if (envio.motivo === "dados_invalidos") return "dados";
  if (envio.motivo === "sem_confirmacao") return "incerto";
  if (/abort|timed? ?out|tempo esgotado/i.test(detalhe)) return "incerto";
  return "provedor";
}

/** A falha conta para o disjuntor do número? Só o que diz algo sobre o provedor. */
export function falhaContaParaDisjuntor(classe: ClasseDaFalha): boolean {
  return classe === "incerto" || classe === "provedor";
}

export const MOTIVO_ENVIO_INCERTO =
  "O WhatsApp não confirmou o envio. Pode ter saído: confira a conversa antes de mandar de novo.";
export const MOTIVO_TELEFONE_INVALIDO = "Telefone do cadastro não é um número válido.";

// ----------------------------------------------------------------- previsão

/** Intervalo médio entre duas mensagens, no meio do sorteio (`antiBan.ts`). */
export const SEGUNDOS_MEDIOS_ENTRE_ENVIOS = (INTERVALO_MINIMO_SEGUNDOS + INTERVALO_MAXIMO_SEGUNDOS) / 2;

/**
 * Quando a fila deve terminar, contando a janela do dia e a cota.
 *
 * Estimativa, não promessa: o intervalo é sorteado e a cota cresce com a
 * idade do número. Mas é muito mais honesta que "uma a cada minuto", que era
 * o que a tela dizia.
 *
 * `terminaHoje` = cabe no saldo e no que sobra do expediente de hoje.
 */
export function previsaoDeTermino(params: {
  pendentes: number;
  saldoHoje: number | null;
  agora: Date;
  /** Hora de início (inclusiva) e de fim (exclusiva) do envio hoje, em São Paulo. */
  expediente: { inicioHora: number; fimHora: number };
}): { terminaEm: Date | null; terminaHoje: boolean; continuaAmanha: number } {
  const { pendentes, agora, expediente } = params;
  if (pendentes <= 0) return { terminaEm: null, terminaHoje: true, continuaAmanha: 0 };

  const saldo = params.saldoHoje ?? pendentes;
  const hojeCabem = Math.min(pendentes, Math.max(0, saldo));
  const { hora } = momentoEmSaoPaulo(agora);
  const minutos = agora.getUTCMinutes();
  const minutoDoDia = hora * 60 + minutos;
  const inicio = expediente.inicioHora * 60;
  const fim = expediente.fimHora * 60;

  const comecaEm = Math.max(minutoDoDia, inicio);
  const sobraMin = Math.max(0, fim - comecaEm);
  const cabemNoTempo = Math.floor((sobraMin * 60) / SEGUNDOS_MEDIOS_ENTRE_ENVIOS);
  const saemHoje = minutoDoDia >= fim ? 0 : Math.min(hojeCabem, cabemNoTempo);
  const continuaAmanha = pendentes - saemHoje;

  if (saemHoje === 0) return { terminaEm: null, terminaHoje: false, continuaAmanha };

  const atrasoMin = comecaEm - minutoDoDia;
  const terminaEm = new Date(
    agora.getTime() + atrasoMin * 60_000 + saemHoje * SEGUNDOS_MEDIOS_ENTRE_ENVIOS * 1000,
  );
  return { terminaEm, terminaHoje: continuaAmanha === 0, continuaAmanha };
}

// ------------------------------------------------- o retorno de cada lista

/** Quantos dias a lista "respondeu" fica no Início. */
export const DIAS_DE_RESPOSTA_NO_INICIO = 7;
/**
 * A segunda tentativa só é sugerida depois de 7 dias: antes disso a proteção
 * da lista nova recusaria a mesma pessoa, e o botão levaria a uma lista vazia.
 */
export const DIAS_PARA_SEGUNDA_TENTATIVA = 7;
/** Depois disso a sugestão sai do Início: o momento passou. */
export const DIAS_ATE_ESQUECER = 14;

export type RetornoDaLista = {
  campanhaId: string;
  titulo: string;
  /** Responderam nos últimos 7 dias. */
  responderam: number;
  /** Receberam há 7 a 14 dias e não responderam: candidatos à segunda tentativa. */
  semResposta: string[];
};

/**
 * O que cada lista devolveu, para o Início fechar o ciclo (roadmap das
 * listas, Fase 3): "3 responderam — ver conversas" e "5 não responderam —
 * montar segunda tentativa?". Lembrete ao CORRETOR; nada aqui manda mensagem
 * ao cliente (a IA só responde, decisão de 03/10).
 */
export function retornoDasListas(
  itens: ReadonlyArray<{
    campanhaId: string;
    titulo: string;
    leadId: string | null;
    status: string;
    enviadoEm: string | null;
    respostaEm: string | null;
  }>,
  agora: Date,
): RetornoDaLista[] {
  const dia = 86_400_000;
  const porLista = new Map<string, RetornoDaLista>();
  for (const i of itens) {
    const r = porLista.get(i.campanhaId) ?? {
      campanhaId: i.campanhaId,
      titulo: i.titulo,
      responderam: 0,
      semResposta: [],
    };
    if (i.status === "respondido" && i.respostaEm) {
      if (agora.getTime() - new Date(i.respostaEm).getTime() <= DIAS_DE_RESPOSTA_NO_INICIO * dia) r.responderam++;
    } else if (i.status === "enviado" && i.enviadoEm && i.leadId) {
      const idade = agora.getTime() - new Date(i.enviadoEm).getTime();
      if (idade >= DIAS_PARA_SEGUNDA_TENTATIVA * dia && idade <= DIAS_ATE_ESQUECER * dia) r.semResposta.push(i.leadId);
    }
    porLista.set(i.campanhaId, r);
  }
  return [...porLista.values()].filter((r) => r.responderam > 0 || r.semResposta.length > 0);
}
