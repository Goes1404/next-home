import "server-only";

import { chamarLlmJson } from "@/lib/whatsapp/llm";
import { soarHumano } from "@/lib/whatsapp/vozHumana";
import type { Empreendimento } from "@/lib/types";
import type { ParametrosCredito } from "@/lib/credito/tipos";
import { blocoDeCredito, blocoDeObjecoes, blocoDoCatalogo, cartaoDoImovel } from "./conhecimento";
import { cortarCreditoInventado, numerosPermitidos, slugsValidos } from "./guardrails";
import { montarPromptDoConsultor } from "./prompt";
import { simularFinanciamento, type EntradaSimulacao } from "./financiamento";
import type { DadosDoConsultor, MensagemDoConsultor } from "./contrato";

/**
 * O turno do consultor: o corretor perguntou; o que a IA responde?
 *
 * UMA chamada de LLM. Tudo o que é conta, link ou escolha de imóvel acontece
 * DEPOIS dela, em código: a IA devolve slug e um pedido de simulação, e este
 * arquivo resolve os dois. É o que impede a resposta de citar imóvel que não
 * existe e de mandar número calculado de cabeça.
 */

const ORCAMENTO_MS = 20_000;
/** 20 mensagens: 12 cobria só umas seis trocas e o assunto saía da janela. */
const JANELA_DO_HISTORICO = 20;

export type RespostaDoConsultor = {
  texto: string;
  dados: DadosDoConsultor | null;
  /** A versão de WhatsApp, quando a IA escreveu uma. */
  textoCliente: string | null;
  /** `true` = o motor caiu ou devolveu fora do contrato. */
  falhou: boolean;
};

const CONTINGENCIA =
  "Não consegui consultar agora — o motor de IA não respondeu. Tenta de novo em alguns segundos; se persistir, a ficha do imóvel no painel tem a informação completa.";

type RespostaBruta = {
  resposta: string;
  imoveis: string[];
  simular: EntradaSimulacao | null;
  textoCliente: string | null;
};

const numero = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;

/** Lê o JSON da IA; `null` quando não tem a forma mínima (uma resposta). */
export function lerRespostaDaIa(json: unknown): RespostaBruta | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const resposta = typeof j.resposta === "string" ? j.resposta.trim() : "";
  if (!resposta) return null;

  const s = j.simular as Record<string, unknown> | undefined;
  /*
   * Simulação sem renda ou sem valor do imóvel não é simulação: a conta
   * sairia de dois zeros e diria "fecha" para qualquer um. Faltando qualquer
   * um dos dois, o pedido é descartado e a IA segue só com o texto.
   */
  const simular =
    s && numero(s.rendaMensal) !== null && numero(s.valorImovel) !== null
      ? {
          rendaMensal: numero(s.rendaMensal) as number,
          entrada: numero(s.entrada) ?? 0,
          fgts: numero(s.fgts) ?? 0,
          valorImovel: numero(s.valorImovel) as number,
          cidade: typeof s.cidade === "string" ? s.cidade : undefined,
        }
      : null;

  return {
    resposta,
    imoveis: Array.isArray(j.imoveis)
      ? j.imoveis.filter((x): x is string => typeof x === "string")
      : [],
    simular,
    textoCliente:
      typeof j.textoCliente === "string" && j.textoCliente.trim() ? j.textoCliente.trim() : null,
  };
}

export async function turnoDoConsultor(params: {
  pedido: string;
  historico: MensagemDoConsultor[];
  catalogo: Empreendimento[];
  credito: ParametrosCredito;
  /** Few-shot do corpus real; vazio é caso normal. */
  exemplos: string;
  agora?: Date;
}): Promise<RespostaDoConsultor> {
  const agora = params.agora ?? new Date();

  const prompt = montarPromptDoConsultor({
    blocoCatalogo: blocoDoCatalogo(params.catalogo),
    blocoCredito: blocoDeCredito(params.credito, agora),
    blocoObjecoes: blocoDeObjecoes(params.exemplos),
    historico: params.historico
      .slice(-JANELA_DO_HISTORICO)
      .map((m) => `${m.papel === "corretor" ? "Corretor" : "Você"}: ${m.conteudo}`),
    pedido: params.pedido,
  });

  const r = await chamarLlmJson(prompt, { temperature: 0, orcamentoMs: ORCAMENTO_MS });
  if (!r.ok) {
    console.warn(`[consultor] motor falhou: ${r.erro}`);
    return { texto: CONTINGENCIA, dados: null, textoCliente: null, falhou: true };
  }

  const bruta = lerRespostaDaIa(r.json);
  if (!bruta) {
    console.warn("[consultor] resposta fora do contrato");
    return { texto: CONTINGENCIA, dados: null, textoCliente: null, falhou: true };
  }

  // A conta acontece ANTES do corte: os números dela entram nos permitidos,
  // senão a rede de segurança apagaria a simulação que o código fez.
  const simulacao = bruta.simular ? simularFinanciamento(bruta.simular, params.credito) : null;
  const permitidos = numerosPermitidos(params.credito, simulacao);
  const texto = cortarCreditoInventado(soarHumano(bruta.resposta), permitidos);

  /*
   * UM `dados` por mensagem, e a simulação ganha da indicação: quem perguntou
   * "isso fecha?" está esperando o número, não uma vitrine. O imóvel citado
   * continua no texto, pelo nome.
   */
  let dados: DadosDoConsultor | null = null;
  if (simulacao && bruta.simular) {
    dados = { tipo: "simulacao", entrada: bruta.simular, resultado: simulacao };
  } else {
    const slugs = slugsValidos(bruta.imoveis, params.catalogo);
    if (slugs.length > 0) {
      const porSlug = new Map(params.catalogo.map((e) => [e.slug, e]));
      dados = {
        tipo: "cartoes",
        itens: slugs.map((s) => cartaoDoImovel(porSlug.get(s) as Empreendimento)),
      };
    }
  }

  return {
    texto,
    dados,
    textoCliente: bruta.textoCliente ? soarHumano(bruta.textoCliente) : null,
    falhou: false,
  };
}
