import type { EtapaFunil } from "@/lib/types";
import type { DossieClienteIA } from "@/lib/whatsapp/types";

/**
 * O que a IA entendeu do relato do corretor sobre uma ligação.
 *
 * `fatos` só carrega o que o relato disse: chave ausente é "não sei", nunca
 * "apague". A regra "null não apaga" do dossiê vale aqui na origem — a
 * ausência é o que impede o chamador de sobrescrever um dado bom com vazio.
 */
export type LeituraDoRetorno = {
  resultado: "atendeu" | "nao_atendeu" | "numero_errado" | "pediu_retorno";
  etapa: EtapaFunil | null;
  /** ISO (UTC). Sempre no futuro e a no máximo 60 dias de `agora`. */
  visitaEm: string | null;
  motivoPerda: string | null;
  resumo: string | null;
  proximoPasso: string | null;
  fatos: Partial<
    Pick<
      DossieClienteIA,
      | "orcamentoMin"
      | "orcamentoMax"
      | "rendaMensal"
      | "regiaoInteresse"
      | "dormitoriosMin"
      | "formaPagamento"
      | "perfilFamiliar"
      | "urgenciaMudanca"
      | "exigenciasEspecificas"
      | "objecoesIdentificadas"
      | "temperaturaLabel"
    >
  >;
};

const RESULTADOS: readonly LeituraDoRetorno["resultado"][] = [
  "atendeu",
  "nao_atendeu",
  "numero_errado",
  "pediu_retorno",
];

/*
 * Um relato de ligação não fecha negócio: proposta, documentação e fechado
 * dependem de documento e de ato do corretor na ficha, e uma frase ("acho que
 * vai fechar") não pode empurrar o lead para lá. `novo` e `visitou` também
 * ficam de fora: não são coisa que se conclui de uma ligação.
 */
const ETAPAS_DO_RELATO: readonly EtapaFunil[] = [
  "primeiro_contato",
  "em_conversa",
  "qualificado",
  "visita_agendada",
  "perdido",
];

const FORMAS_DE_PAGAMENTO = ["a_vista", "financiamento", "permuta", "misto"];
const PERFIS_FAMILIARES = ["casal_com_filhos", "casal_sem_filhos", "solteiro", "investidor"];
const URGENCIAS = ["imediata", "3_meses", "6_meses", "apenas_pesquisando"];
const TEMPERATURAS = ["quente", "morno", "frio"];

const LIMITE_DA_VISITA_DIAS = 60;
const TETO_DO_RESUMO = 1500;
const TETO_DO_PROXIMO_PASSO = 300;
const TETO_DO_MOTIVO = 200;
const TETO_DA_REGIAO = 120;
const TETO_DE_ITENS = 15;
const TETO_DO_ITEM = 60;

function texto(valor: unknown, teto: number): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim().slice(0, teto) : null;
}

/** Só número finito e positivo: dinheiro negativo ou zero é lixo do modelo. */
function positivo(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) && valor > 0 ? valor : null;
}

function dosValores<T extends string>(valor: unknown, validos: readonly string[]): T | null {
  return typeof valor === "string" && validos.includes(valor) ? (valor as T) : null;
}

function listaDeTextos(valor: unknown): string[] {
  if (!Array.isArray(valor)) return [];
  const itens: string[] = [];
  for (const item of valor) {
    const limpo = texto(item, TETO_DO_ITEM);
    if (limpo && !itens.includes(limpo)) itens.push(limpo);
    if (itens.length >= TETO_DE_ITENS) break;
  }
  return itens;
}

/*
 * Data e hora COM fuso. `new Date("2026-11-07T10:00:00")` sem offset é lida no
 * fuso do servidor (UTC na Vercel) e marcaria a visita 3 horas fora; formato
 * solto ("Nov 7 2026 10:00") cada motor lê de um jeito. Na dúvida, null.
 */
const ISO_COM_FUSO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function visitaValida(valor: unknown, agora: Date): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!ISO_COM_FUSO.test(limpo)) return null;
  const data = new Date(limpo);
  const t = data.getTime();
  if (Number.isNaN(t)) return null;
  if (t <= agora.getTime()) return null;
  if (t > agora.getTime() + LIMITE_DA_VISITA_DIAS * 24 * 3600_000) return null;
  return data.toISOString();
}

function normalizarFatos(bruto: unknown): LeituraDoRetorno["fatos"] {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return {};
  const f = bruto as Record<string, unknown>;
  const fatos: LeituraDoRetorno["fatos"] = {};

  const orcamentoMin = positivo(f.orcamentoMin);
  if (orcamentoMin !== null) fatos.orcamentoMin = orcamentoMin;
  const orcamentoMax = positivo(f.orcamentoMax);
  if (orcamentoMax !== null) fatos.orcamentoMax = orcamentoMax;
  const rendaMensal = positivo(f.rendaMensal);
  if (rendaMensal !== null) fatos.rendaMensal = rendaMensal;

  const regiao = texto(f.regiaoInteresse, TETO_DA_REGIAO);
  if (regiao) fatos.regiaoInteresse = regiao;

  if (typeof f.dormitoriosMin === "number" && f.dormitoriosMin >= 1 && f.dormitoriosMin <= 10) {
    fatos.dormitoriosMin = Math.round(f.dormitoriosMin);
  }

  const forma = dosValores<string>(f.formaPagamento, FORMAS_DE_PAGAMENTO);
  if (forma) fatos.formaPagamento = forma;
  const perfil = dosValores<string>(f.perfilFamiliar, PERFIS_FAMILIARES);
  if (perfil) fatos.perfilFamiliar = perfil;
  const urgencia = dosValores<string>(f.urgenciaMudanca, URGENCIAS);
  if (urgencia) fatos.urgenciaMudanca = urgencia;
  const temperatura = dosValores<NonNullable<DossieClienteIA["temperaturaLabel"]>>(
    f.temperaturaLabel,
    TEMPERATURAS,
  );
  if (temperatura) fatos.temperaturaLabel = temperatura;

  // Lista vazia fica ausente: "não ouvi nada" não pode apagar o que já se sabia.
  const exigencias = listaDeTextos(f.exigenciasEspecificas);
  if (exigencias.length) fatos.exigenciasEspecificas = exigencias;
  const objecoes = listaDeTextos(f.objecoesIdentificadas);
  if (objecoes.length) fatos.objecoesIdentificadas = objecoes;

  return fatos;
}

/**
 * A mensagem não conta ligação nenhuma ("bom dia", "ok", recado ao gestor,
 * "vou ligar agora"). Não é falha da leitura: é a resposta certa, e quem
 * chama não grava nada no lead.
 */
export const NAO_E_RELATO = "nao_e_relato";

/**
 * Transforma o JSON cru do modelo na leitura tipada.
 *
 * É a peneira entre o modelo e a ficha do cliente: etapa que o relato não
 * pode definir, visita fora de prazo e número sem sentido morrem aqui, e a
 * etapa que dependia deles (visita sem data, perdido sem motivo) cai junto —
 * melhor não mover o lead do que movê-lo com base num dado que não existe.
 * `resultado: null` explícito é o modelo dizendo que não é relato de ligação
 * (`"nao_e_relato"`). Devolve null quando nem o resultado dá para confiar.
 */
export function normalizarLeituraDoRetorno(
  json: unknown,
  agora: Date,
): LeituraDoRetorno | typeof NAO_E_RELATO | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const bruto = json as Record<string, unknown>;
  // Só o null escrito: chave ausente é resposta incompleta, não "não é relato".
  if ("resultado" in bruto && bruto.resultado === null) return NAO_E_RELATO;

  const resultado = dosValores<LeituraDoRetorno["resultado"]>(bruto.resultado, RESULTADOS);
  if (!resultado) return null;

  // Sem conversa não há o que aprender: o que vier junto é invenção do modelo.
  const semResposta = resultado === "nao_atendeu" || resultado === "numero_errado";

  const visitaEm = semResposta ? null : visitaValida(bruto.visitaEm, agora);
  let etapa = semResposta ? null : dosValores<EtapaFunil>(bruto.etapa, ETAPAS_DO_RELATO);

  let motivoPerda = texto(bruto.motivoPerda, TETO_DO_MOTIVO);
  if (etapa === "perdido" && !motivoPerda) etapa = null;
  if (etapa !== "perdido") motivoPerda = null;

  if (etapa === "visita_agendada" && !visitaEm) etapa = null;

  return {
    resultado,
    etapa,
    visitaEm,
    motivoPerda,
    resumo: texto(bruto.resumo, TETO_DO_RESUMO),
    proximoPasso: texto(bruto.proximoPasso, TETO_DO_PROXIMO_PASSO),
    fatos: semResposta ? {} : normalizarFatos(bruto.fatos),
  };
}
