import { algumProvedorConfigurado, chamarLlmJson } from "@/lib/whatsapp/llm";
import { NAO_E_RELATO, normalizarLeituraDoRetorno, type LeituraDoRetorno } from "./leituraDoRetorno";

/*
 * Ninguém espera esta leitura em tela: o corretor mandou o relato no grupo e
 * a confirmação sai quando ficar pronta. 15s dá folga para uma retentativa
 * sem estourar o orçamento do webhook.
 */
const ORCAMENTO_RETORNO_MS = 15_000;
const TAMANHO_MINIMO_DO_RELATO = 3;
const TETO_DO_RELATO = 4000;
const INICIO_DO_RELATO = 1500;
const FIM_DO_RELATO = 2500;

/**
 * Relato maior que o teto perde o MEIO: o começo diz de quem se fala e o fim
 * costuma trazer o desfecho ("marquei sábado 10h"), que um corte seco no
 * começo jogaria fora.
 */
export function encurtarRelato(relato: string): string {
  if (relato.length <= TETO_DO_RELATO) return relato;
  console.warn(`Relato da ligação com ${relato.length} caracteres: cortado o meio para caber na leitura.`);
  return `${relato.slice(0, INICIO_DO_RELATO)} […] ${relato.slice(-FIM_DO_RELATO)}`;
}

/**
 * "segunda-feira, 26/10/2026 14:05" no fuso de São Paulo.
 *
 * O servidor roda em UTC: sem formatar aqui, "sábado" e "amanhã" seriam
 * resolvidos pelo dia de Greenwich, e depois das 21h o dia já virou lá.
 */
export function agoraEmSaoPaulo(agora: Date): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("weekday")}, ${p("day")}/${p("month")}/${p("year")} ${p("hour")}:${p("minute")}`;
}

export const PROMPT_RETORNO_DA_LIGACAO = `Você lê o relato que um CORRETOR DE IMÓVEIS escreveu (ou falou, já transcrito) depois de ligar para um cliente.
Quem fala no relato é o CORRETOR, contando como foi a ligação — não é o cliente falando. Extraia o que o corretor disse que aconteceu e o que o cliente disse a ele.

REGRAS:
- Não invente nada que não esteja no relato. Na dúvida, null.
- Datas relativas ("sábado", "amanhã", "semana que vem") se resolvem a partir de "agora", sempre para a PRÓXIMA ocorrência: nunca hoje se o horário já passou. O fuso é o de São Paulo (-03:00).
- Valores em dinheiro vão como número simples em reais, sem texto ("600 mil" vira 600000, "1,2 milhão" vira 1200000).
- A etapa só muda se o relato deixa claro. Valores possíveis: "primeiro_contato" (falou com o cliente, mas ainda sem conversa de verdade), "em_conversa" (conversou e segue em andamento), "qualificado" (sabe o que quer, quanto pode pagar e tem condição), "visita_agendada" (marcou data e hora de visita), "perdido" (o cliente desistiu, comprou em outro lugar ou não tem perfil; exige motivoPerda). Qualquer outra situação: null. Nunca use fechado, proposta ou documentação.
- "resultado": "atendeu" (falou com o cliente), "nao_atendeu" (ligou e ninguém atendeu), "numero_errado" (número não é do cliente ou não existe), "pediu_retorno" (atendeu, mas pediu para ligar depois).
- O grupo também tem conversa que NÃO conta ligação nenhuma: cumprimento ("bom dia"), "ok", "beleza", emoji, agradecimento, resposta ou recado ao gestor, aviso do que ainda vai fazer ("vou ligar agora", "já já ligo"). Nesses casos responda "resultado": null e todo o resto null ou vazio. Na correção, se o texto depois de "Correção do corretor:" só concorda ou agradece, também é null.
- Se não atendeu ou o número está errado, não há etapa, visita nem fatos.
- "resumo": junte o que já se sabia do cliente (ficha e dossiê abaixo) com o que o relato acrescenta, em poucas frases. Não repita o que não importa mais.

Responda EXCLUSIVAMENTE um objeto JSON válido, sem texto antes ou depois, neste formato:
{
  "resultado": "atendeu" | "nao_atendeu" | "numero_errado" | "pediu_retorno" | null (null = não é relato de ligação),
  "etapa": "primeiro_contato" | "em_conversa" | "qualificado" | "visita_agendada" | "perdido" | null,
  "visitaEm": string ou null (data e hora da visita marcada em ISO 8601 com offset -03:00, ex. de formato: "2026-11-07T10:00:00-03:00"; só se o relato trouxer dia E hora),
  "motivoPerda": string ou null (só se etapa for "perdido"),
  "resumo": string ou null,
  "proximoPasso": string ou null (o que o corretor combinou ou deve fazer a seguir),
  "fatos": {
    "orcamentoMin": number ou null,
    "orcamentoMax": number ou null,
    "rendaMensal": number ou null (renda MENSAL da família, não o valor do imóvel),
    "regiaoInteresse": string ou null (onde o cliente quer morar, nas palavras dele),
    "dormitoriosMin": number ou null,
    "formaPagamento": "a_vista" | "financiamento" | "permuta" | "misto" | null,
    "perfilFamiliar": "casal_com_filhos" | "casal_sem_filhos" | "solteiro" | "investidor" | null,
    "urgenciaMudanca": "imediata" | "3_meses" | "6_meses" | "apenas_pesquisando" | null,
    "exigenciasEspecificas": ["o que o cliente pediu, em snake_case (ex. de formato: usa_fgts, pet_friendly); nada dito = lista vazia"],
    "objecoesIdentificadas": ["resistência que o cliente levantou, em snake_case (ex. de formato: preco, localizacao); nada dito = lista vazia"],
    "temperaturaLabel": "quente" | "morno" | "frio" | null
  }
}`;

export type CustoDaLeitura = {
  tokensEntrada: number | null;
  tokensSaida: number | null;
  /** Quem de fato respondeu e em quanto tempo: vão para `ia_interacoes`. */
  modelo: string;
  latenciaMs: number;
};

export type ResultadoDaLeitura =
  | ({ ok: true; leitura: LeituraDoRetorno } & CustoDaLeitura)
  /** Conversa, não relato. `custo` é null quando nem se chamou o modelo ("ok"). */
  | { ok: true; leitura: typeof NAO_E_RELATO; custo: CustoDaLeitura | null }
  | { ok: false };

/**
 * Lê o relato da ligação e devolve a leitura já peneirada.
 *
 * Nunca lança: relato vazio, nenhum provedor de IA, chamada que falhou ou
 * resposta sem resultado entendível viram `{ ok: false }`, e o chamador
 * decide o que dizer no grupo. Duas letras ou um emoji ("ok", "👍") não são
 * relato: nem chegam ao modelo.
 */
export async function lerRetornoDaLigacao(p: {
  relato: string;
  fichaAtual: string;
  dossieAtual: string | null;
  agora: Date;
}): Promise<ResultadoDaLeitura> {
  try {
    const relato = p.relato.trim();
    if (!relato) return { ok: false };
    if (relato.length < TAMANHO_MINIMO_DO_RELATO) return { ok: true, leitura: NAO_E_RELATO, custo: null };
    if (!algumProvedorConfigurado()) return { ok: false };

    const prompt = [
      PROMPT_RETORNO_DA_LIGACAO,
      "",
      `--- AGORA (fuso de São Paulo) ---\n${agoraEmSaoPaulo(p.agora)}`,
      "",
      `--- FICHA ATUAL DO CLIENTE ---\n${p.fichaAtual.trim() || "(vazia)"}`,
      "",
      `--- DOSSIÊ ATUAL DO CLIENTE ---\n${p.dossieAtual?.trim() || "(vazio)"}`,
      "",
      `--- RELATO DO CORRETOR SOBRE A LIGAÇÃO ---\n${encurtarRelato(relato)}`,
    ].join("\n");

    const resultado = await chamarLlmJson(prompt, {
      temperature: 0.1,
      orcamentoMs: ORCAMENTO_RETORNO_MS,
      fatia: 1,
    });
    if (!resultado.ok) {
      console.error("Erro ao ler o retorno da ligação:", resultado.erro);
      return { ok: false };
    }

    const leitura = normalizarLeituraDoRetorno(resultado.json, p.agora);
    if (!leitura) return { ok: false };
    const custo: CustoDaLeitura = {
      tokensEntrada: resultado.tokensEntrada,
      tokensSaida: resultado.tokensSaida,
      modelo: resultado.modelo,
      latenciaMs: resultado.latenciaMs,
    };
    if (leitura === NAO_E_RELATO) return { ok: true, leitura, custo };
    return { ok: true, leitura, ...custo };
  } catch (erro) {
    console.error("Erro inesperado ao ler o retorno da ligação:", erro);
    return { ok: false };
  }
}
