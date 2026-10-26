// O que um retorno lido muda no lead e no aviso (spec 6.2 passo 5 e 6.5).
//
// Puro: recebe o estado atual e devolve as mudanças; quem grava é aplicar.ts.
// Guardar aqui "o que este retorno mudou" (`Aplicado`) é o que deixa a
// correção desfazer exatamente isso, e nada além.

import { ETAPAS_FUNIL, type EtapaFunil } from "@/lib/types";
import type { LeituraDoRetorno } from "./leituraDoRetorno";

/** O que um retorno gravou, para uma correção poder desfazer. Vai em `retornos_de_ligacao.leitura.aplicado`. */
export type Aplicado = {
  etapaDe: EtapaFunil | null;
  etapaPara: EtapaFunil | null;
  visitaAntes: string | null;
  visitaDepois: string | null;
  tentativaContada: boolean;
  retornoMarcado: boolean;
};

export type Efeitos = {
  etapa: { de: EtapaFunil; para: EtapaFunil } | null;
  /** `para: null` desmarca (a correção tirou a visita que o retorno anterior pôs). */
  visita: { de: string | null; para: string | null } | null;
  /** Novo valor de `tentativas_ligacao`, ou null se não muda. */
  tentativas: number | null;
  /** `undefined`: não mexe; string: marca; null: desmarca (correção). */
  retornoEm: string | null | undefined;
  /** Número desta tentativa sem resposta, para a confirmação (0 = sem aviso para contar). */
  tentativa: number;
  aplicado: Aplicado;
};

function mesmoInstante(a: string | null, b: string | null): boolean {
  if (!a || !b) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

const posicao = (etapa: EtapaFunil) => ETAPAS_FUNIL.indexOf(etapa);

/*
 * Um relato de ligação não leva o lead para trás no funil (quem está em
 * proposta e "quer pensar" não volta para "em conversa") nem tira ninguém de
 * fechado. Perder é a exceção: desistência dita na ligação vale em qualquer
 * etapa antes de fechado.
 */
function podeMover(de: EtapaFunil, para: EtapaFunil): boolean {
  if (de === para || de === "fechado") return false;
  if (para === "perdido" || de === "perdido") return true;
  return posicao(para) > posicao(de);
}

export function planejarEfeitos(p: {
  leitura: LeituraDoRetorno;
  lead: { etapa: EtapaFunil; visitaAgendadaEm: string | null };
  envio: { tentativas: number; retornoEm: string | null } | null;
  /** O que o retorno corrigido gravou (só na correção). */
  corrigido: Aplicado | null;
  agora: Date;
}): Efeitos {
  const { leitura, lead, envio, corrigido } = p;

  // Etapa. Na correção de um retorno que moveu o lead (e ele continua onde
  // aquele retorno o pôs), a regra julga a partir da etapa de ANTES dele: é
  // como se o relato corrigido tivesse chegado no lugar do primeiro.
  const corrigindoAEtapa =
    corrigido?.etapaDe && corrigido.etapaPara && lead.etapa === corrigido.etapaPara ? corrigido.etapaDe : null;
  const base = corrigindoAEtapa ?? lead.etapa;
  let alvo: EtapaFunil | null = null;
  if (leitura.etapa && (leitura.etapa === base || podeMover(base, leitura.etapa))) alvo = leitura.etapa;
  // A correção não confirma a etapa que o retorno anterior pôs: volta.
  else if (!leitura.etapa && corrigindoAEtapa) alvo = corrigindoAEtapa;
  const etapa: Efeitos["etapa"] = alvo && alvo !== lead.etapa ? { de: lead.etapa, para: alvo } : null;
  const paraFinal = alvo ?? lead.etapa;
  const etapaDe = paraFinal !== base ? base : null;
  const etapaPara = paraFinal !== base ? paraFinal : null;

  // Visita
  let visita: Efeitos["visita"] = null;
  let visitaAntes: string | null = null;
  let visitaDepois: string | null = null;
  if (leitura.visitaEm) {
    if (!mesmoInstante(leitura.visitaEm, lead.visitaAgendadaEm)) {
      visita = { de: lead.visitaAgendadaEm, para: leitura.visitaEm };
    }
    const herdou = corrigido?.visitaDepois && mesmoInstante(corrigido.visitaDepois, lead.visitaAgendadaEm);
    visitaAntes = herdou ? corrigido!.visitaAntes : lead.visitaAgendadaEm;
    visitaDepois = leitura.visitaEm;
  } else if (corrigido?.visitaDepois && mesmoInstante(corrigido.visitaDepois, lead.visitaAgendadaEm)) {
    visita = { de: lead.visitaAgendadaEm, para: corrigido.visitaAntes };
  }

  // Tentativas e retorno no aviso
  let tentativas: number | null = null;
  let retornoEm: string | null | undefined = undefined;
  let tentativaContada = false;
  let retornoMarcado = false;
  let tentativa = 0;
  if (envio) {
    const conta = leitura.resultado === "nao_atendeu";
    const jaContada = corrigido?.tentativaContada ?? false;
    if (conta && !jaContada) tentativas = envio.tentativas + 1;
    if (!conta && jaContada) tentativas = Math.max(0, envio.tentativas - 1);
    tentativaContada = conta;
    if (conta) tentativa = tentativas ?? envio.tentativas;

    const encerra = leitura.resultado === "atendeu" || leitura.resultado === "numero_errado";
    const jaMarcado = corrigido?.retornoMarcado ?? false;
    if (encerra && envio.retornoEm === null) {
      retornoEm = p.agora.toISOString();
      retornoMarcado = true;
    } else if (encerra) {
      retornoMarcado = jaMarcado;
    } else if (jaMarcado) {
      retornoEm = null;
    }
  }

  return {
    etapa,
    visita,
    tentativas,
    retornoEm,
    tentativa,
    aplicado: { etapaDe, etapaPara, visitaAntes, visitaDepois, tentativaContada, retornoMarcado },
  };
}

/** Lê o `aplicado` guardado no jsonb `leitura` de um retorno; null se não houver. */
export function aplicadoGuardado(leitura: unknown): Aplicado | null {
  if (!leitura || typeof leitura !== "object") return null;
  const a = (leitura as Record<string, unknown>).aplicado;
  if (!a || typeof a !== "object") return null;
  const o = a as Record<string, unknown>;
  const etapa = (v: unknown) => (typeof v === "string" && ETAPAS_FUNIL.includes(v as EtapaFunil) ? (v as EtapaFunil) : null);
  const texto = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    etapaDe: etapa(o.etapaDe),
    etapaPara: etapa(o.etapaPara),
    visitaAntes: texto(o.visitaAntes),
    visitaDepois: texto(o.visitaDepois),
    tentativaContada: o.tentativaContada === true,
    retornoMarcado: o.retornoMarcado === true,
  };
}
