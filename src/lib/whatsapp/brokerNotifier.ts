/**
 * Alertas ao corretor durante o atendimento (reescrito em 20/10/2026).
 *
 * O formato antigo usava o MESMO corpo para oito motivos diferentes: até
 * "visita desmarcada" chegava com "a sua assistente acabou de qualificar um
 * cliente de alto padrão" e "entre em contato para garantir a melhor taxa
 * de conversão". Escrevia "Imóveis em Alphaville" quando não havia imóvel,
 * usava o apelido do perfil do WhatsApp como nome e colava um parágrafo do
 * dossiê que não dizia o que o corretor precisa saber. Aviso que fala a
 * mesma coisa em toda situação deixa de ser lido.
 *
 * Régua: a primeira linha diz O QUE FAZER; a segunda, o que aconteceu; a
 * ficha vem numa linha, só com o que existe; o que falta saber vem dito.
 * Nada é inventado e não há frase de marketing. Só texto: o envio é de
 * `avisarCorretor`, que também manda a notificação no celular.
 */

export type MotivoAlerta =
  | "visita_confirmada"
  /** O cliente trocou a data pela conversa; o CRM já está com a nova (A2). */
  | "visita_remarcada"
  /** O cliente disse que não vai; a visita já saiu do CRM (A2). */
  | "visita_desmarcada"
  /** O cliente pediu para ser ligado. Quem liga é o corretor — ver `pedidoDeLigacao.ts`. */
  | "ligacao_solicitada"
  | "transferencia_humana"
  /** A assistente disse ao cliente que o corretor traz uma resposta. Ver `promessaDeRetorno.ts`. */
  | "duvida_pendente"
  | "lead_quente";

/** O que a ficha sabe do cliente. Campo nulo é dito como "falta saber". */
export interface FichaDoAlerta {
  rendaMensal: number | null;
  regiaoInteresse: string | null;
  dormitoriosMin: number | null;
  orcamentoMax: number | null;
}

export interface DadosDoAlerta {
  motivo: MotivoAlerta;
  /** Já resolvido: nome da ficha, senão o telefone. Nunca o apelido cru do perfil. */
  nomeCliente: string;
  telefoneCliente: string;
  imovel?: string | null;
  ficha: FichaDoAlerta;
  /** Uma linha com o fato: data da visita, o que mudou. */
  fato?: string | null;
  /** O que o cliente escreveu agora (os balões da vez). */
  falaDoCliente?: string | null;
  /** Endereço completo da ficha no painel. */
  linkFicha?: string | null;
}

const fmtReais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** O que fazer, em uma linha. É ela que vira o título da notificação. */
export function acaoDoAlerta(motivo: MotivoAlerta, nome: string): string {
  switch (motivo) {
    case "visita_confirmada":
      return `✅ Visita marcada com ${nome}`;
    case "visita_remarcada":
      return `🔁 ${nome} remarcou a visita`;
    case "visita_desmarcada":
      return `❌ ${nome} desmarcou a visita`;
    case "ligacao_solicitada":
      return `📞 Ligue para ${nome}`;
    case "transferencia_humana":
      return `🙋 ${nome} quer falar com você`;
    case "duvida_pendente":
      return `❓ ${nome} espera uma resposta sua`;
    case "lead_quente":
      return `🔥 ${nome} está pronto para conversar`;
  }
}

/** A ficha numa linha, só com o que existe. */
export function linhaDaFicha(imovel: string | null | undefined, f: FichaDoAlerta): string | null {
  const partes = [
    imovel?.trim() || null,
    f.dormitoriosMin ? `${f.dormitoriosMin} dorm` : null,
    f.rendaMensal ? `renda ${fmtReais(f.rendaMensal)}` : null,
    f.orcamentoMax ? `até ${fmtReais(f.orcamentoMax)}` : null,
    f.regiaoInteresse?.trim() || null,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" · ") : null;
}

/** O que a ficha ainda não sabe, entre o que decide a indicação. */
export function faltaSaber(f: FichaDoAlerta): string | null {
  const falta = [
    f.rendaMensal ? null : "renda",
    f.regiaoInteresse ? null : "região",
    f.dormitoriosMin ? null : "quartos",
  ].filter(Boolean);
  return falta.length > 0 ? `Falta saber: ${falta.join(", ")}` : null;
}

function cortar(texto: string, max = 160): string {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** Motivos em que a fala do cliente é a notícia. */
const MOSTRA_A_FALA: ReadonlySet<MotivoAlerta> = new Set([
  "visita_desmarcada",
  "ligacao_solicitada",
  "transferencia_humana",
  "duvida_pendente",
  // O que o deixou quente é o que ele escreveu, não um parágrafo da IA sobre ele.
  "lead_quente",
]);

export function formatarAlertaCorretor(d: DadosDoAlerta): string {
  const linhas = [`*${acaoDoAlerta(d.motivo, d.nomeCliente)}*`];
  if (d.fato) linhas.push(d.fato);
  if (d.falaDoCliente && MOSTRA_A_FALA.has(d.motivo)) linhas.push(`Disse: "${cortar(d.falaDoCliente)}"`);
  const ficha = linhaDaFicha(d.imovel, d.ficha);
  if (ficha) linhas.push(ficha);
  // Desmarcou: o que falta saber não é a notícia.
  const falta = d.motivo === "visita_desmarcada" ? null : faltaSaber(d.ficha);
  if (falta) linhas.push(falta);
  linhas.push("");
  linhas.push(`WhatsApp: https://wa.me/${d.telefoneCliente.replace(/\D/g, "")}`);
  if (d.linkFicha) linhas.push(`Ficha: ${d.linkFicha}`);
  return linhas.join("\n");
}

export interface DadosDaEvolucao {
  nomeCliente: string;
  /** Já formatado por `detectarEvolucao` (evolucaoConversa.ts) — uma ou mais linhas com emoji. */
  resumoMudancas: string;
  linkFicha?: string | null;
}

/**
 * Nota curta de acompanhamento — não é alerta (não pede ação imediata);
 * é "a conversa andou, aqui está o que mudou".
 */
export function formatarAtualizacaoDossie(d: DadosDaEvolucao): string {
  return [`*📊 ${d.nomeCliente} avançou na conversa*`, d.resumoMudancas, ...(d.linkFicha ? ["", `Ficha: ${d.linkFicha}`] : [])].join(
    "\n",
  );
}

/** Quanto tempo o mesmo alerta da mesma conversa espera para se repetir. Visita é fato novo a cada vez. */
export const CARENCIA_DO_ALERTA_H: Record<MotivoAlerta, number> = {
  visita_confirmada: 0,
  visita_remarcada: 0,
  visita_desmarcada: 0,
  ligacao_solicitada: 3,
  transferencia_humana: 3,
  duvida_pendente: 3,
  lead_quente: 72,
};

/** Pura: pode mandar este alerta agora, dado quando cada motivo saiu pela última vez? */
export function alertaLiberado(
  motivo: MotivoAlerta,
  enviados: Record<string, string | undefined> | null | undefined,
  agora: Date,
): boolean {
  const horas = CARENCIA_DO_ALERTA_H[motivo];
  if (horas === 0) return true;
  const ultimo = enviados?.[motivo];
  if (!ultimo) return true;
  return agora.getTime() - new Date(ultimo).getTime() >= horas * 3600_000;
}
