// Os limites de artes, vídeos e mensagens de lista por grupo e por mês
// (limites do plano, 0214, spec §10).
//
// Módulo PURO, irmão de `cotaDaIa.ts`: o ponto de geração, a faixa do painel,
// as telas de criar e a área da plataforma fazem a MESMA conta. O mês é o de
// São Paulo (`mesEmSaoPaulo`, reaproveitado de lá) e o aviso é aos 80%.
//
// NÚMEROS PROVISÓRIOS, da tabela do §10: valem até medir o custo real. O
// FORMATO é o definitivo — teto do plano, ajuste da plataforma por cima.
//
// Quem CONTA é o banco (gatilhos da 0214 sobre `imagens_geradas`,
// `video_jobs` e `whatsapp_campanhas_fila`, somando em `uso_da_ia`). Aqui só
// se decide o teto e o que ele significa.
//
// ARMAZENAMENTO (5/20/10 GB) NÃO entra aqui: fica pendente (ver o handoff).

import type { Plano } from "@/lib/plataforma/rotulosDoGrupo";
import { inicioDoProximoMesEmSaoPaulo, LIMIAR_DE_AVISO } from "./cotaDaIa";

export type Recurso = "arte" | "video" | "lista";

export const RECURSOS: readonly Recurso[] = ["arte", "video", "lista"];

/**
 * Por mês e por plano. `null` = sem teto: o plano a preço de custo (o da
 * Next Home, grupo 1) paga o que usar.
 */
export const LIMITES_POR_MES: Record<Plano, Record<Recurso, number | null>> = {
  essencial: { arte: 30, video: 3, lista: 1000 },
  profissional: { arte: 100, video: 10, lista: 2500 },
  imobiliaria: { arte: 50, video: 5, lista: 2500 },
  custo: { arte: null, video: null, lista: null },
};

/**
 * No plano Imobiliária, artes e vídeos são POR ASSENTO (somam na equipe); a
 * lista é UM número por imobiliária, não importa quantos corretores.
 */
const POR_ASSENTO: Record<Recurso, boolean> = { arte: true, video: true, lista: false };

/** Nomes para frase. */
const NOMES: Record<Recurso, { singular: string; plural: string; acabaram: string }> = {
  arte: { singular: "arte", plural: "artes", acabaram: "elas acabaram" },
  video: { singular: "vídeo", plural: "vídeos", acabaram: "eles acabaram" },
  lista: { singular: "mensagem de lista", plural: "mensagens de lista", acabaram: "elas acabaram" },
};

/** A coluna de `grupos` que guarda o ajuste da plataforma. */
export const COLUNA_DO_TETO: Record<Recurso, "teto_artes" | "teto_videos" | "teto_mensagens_lista"> = {
  arte: "teto_artes",
  video: "teto_videos",
  lista: "teto_mensagens_lista",
};

/** A coluna de `uso_da_ia` que guarda o contador do mês. */
export const COLUNA_DO_USO: Record<Recurso, "artes" | "videos" | "mensagens_lista"> = {
  arte: "artes",
  video: "videos",
  lista: "mensagens_lista",
};

/** Como a tela chama o recurso. */
export const ROTULO_DO_RECURSO: Record<Recurso, string> = {
  arte: "Artes de IA",
  video: "Vídeos",
  lista: "Mensagens de lista",
};

/**
 * O teto do mês. O ajuste da plataforma vence o plano; sem ajuste, o plano
 * decide. Assento: mesma regra provisória de `tetoDeRespostasDaIa` (número de
 * WhatsApp cadastrado no grupo, no mínimo 1).
 */
export function tetoDoRecurso(p: {
  recurso: Recurso;
  plano: Plano;
  tetoAjustado: number | null | undefined;
  assentos: number;
}): number | null {
  if (p.tetoAjustado !== null && p.tetoAjustado !== undefined) return Math.max(0, Math.floor(p.tetoAjustado));
  const base = LIMITES_POR_MES[p.plano][p.recurso];
  if (base === null) return null;
  return p.plano === "imobiliaria" && POR_ASSENTO[p.recurso] ? base * Math.max(1, p.assentos) : base;
}

export type NivelDoRecurso = "sem_teto" | "livre" | "aviso" | "esgotada";

export type SituacaoDoRecurso = {
  recurso: Recurso;
  usados: number;
  teto: number | null;
  /** 0–100 (pode passar de 100 por corrida); `null` sem teto. */
  percentual: number | null;
  /** Quantos ainda cabem no mês; `null` sem teto. */
  restantes: number | null;
  nivel: NivelDoRecurso;
};

export function situacaoDoRecurso(p: { recurso: Recurso; usados: number; teto: number | null }): SituacaoDoRecurso {
  const usados = Math.max(0, p.usados);
  if (p.teto === null) {
    return { recurso: p.recurso, usados, teto: null, percentual: null, restantes: null, nivel: "sem_teto" };
  }
  const teto = p.teto;
  const restantes = Math.max(0, teto - usados);
  const percentual = teto === 0 ? 100 : Math.floor((usados / teto) * 100);
  const nivel: NivelDoRecurso = usados >= teto ? "esgotada" : usados >= teto * LIMIAR_DE_AVISO ? "aviso" : "livre";
  return { recurso: p.recurso, usados, teto, percentual, restantes, nivel };
}

/** Lido sem saber: não bloqueia (falha de leitura segue como `livre`, sem teto). */
export function situacaoLivre(recurso: Recurso, usados = 0): SituacaoDoRecurso {
  return situacaoDoRecurso({ recurso, usados, teto: null });
}

const NUMERO = new Intl.NumberFormat("pt-BR");

const COMO_PEDIR_MAIS = "Para pedir mais, fale com o gestor da sua equipe ou com o suporte da Astro Soluções.";

/**
 * Pedir `pedido` unidades cabe no que resta? Sem teto, sempre. Com teto, o
 * pedido INTEIRO precisa caber: nada de começar o que ultrapassa.
 */
export function cabeNoLimite(s: SituacaoDoRecurso, pedido = 1): boolean {
  if (s.restantes === null) return true;
  return pedido <= s.restantes;
}

/**
 * A recusa, em português, para quando o pedido não cabe. `null` = cabe.
 * Unidade (arte/vídeo): "Seu plano tem 30 artes por mês e elas acabaram.
 * Voltam no dia 1º." Lista maior que o resto: a conta clara, e a lista inteira
 * é recusada (decisão deste passo: não se envia "até o limite").
 */
export function mensagemDeRecusa(s: SituacaoDoRecurso, pedido = 1): string | null {
  if (cabeNoLimite(s, pedido) || s.teto === null || s.restantes === null) return null;
  const nome = NOMES[s.recurso];
  if (s.restantes === 0) {
    return `Seu plano tem ${NUMERO.format(s.teto)} ${nome.plural} por mês e ${nome.acabaram}. Voltam no dia 1º. ${COMO_PEDIR_MAIS}`;
  }
  return `Esta lista tem ${NUMERO.format(pedido)} ${nome.plural} e ${
    s.restantes === 1 ? "resta" : "restam"
  } ${NUMERO.format(s.restantes)} neste mês (${NUMERO.format(s.usados)} de ${NUMERO.format(s.teto)} usadas). Reduza a lista ou espere o dia 1º. ${COMO_PEDIR_MAIS}`;
}

/** "restam 12 este mês", para as telas de criar. `null` sem teto. */
export function fraseDoQueResta(s: SituacaoDoRecurso): string | null {
  if (s.restantes === null) return null;
  const nome = NOMES[s.recurso];
  if (s.restantes === 0) return `Suas ${nome.plural} deste mês acabaram. Voltam no dia 1º.`;
  const um = s.restantes === 1;
  return `${um ? "Resta" : "Restam"} ${NUMERO.format(s.restantes)} ${um ? nome.singular : nome.plural} este mês.`;
}

/** Quando volta (o dia 1º), para a tela que quiser mostrar a data. */
export const quandoVolta = inicioDoProximoMesEmSaoPaulo;

/** O teto que a plataforma digitou. Em branco = o do plano. Mesmas regras de `lerTetoDigitado`. */
export function lerLimiteDigitado(
  texto: string,
  recurso: Recurso,
): { ok: true; teto: number | null } | { ok: false; erro: string } {
  const limpo = texto.trim();
  if (limpo === "") return { ok: true, teto: null };
  if (!/^\d{1,3}(\.\d{3})*$|^\d+$/.test(limpo)) {
    return { ok: false, erro: `Digite só o número de ${NOMES[recurso].plural} por mês (por exemplo, 100), ou deixe em branco.` };
  }
  const teto = Number(limpo.replace(/\./g, ""));
  if (teto > 1_000_000) return { ok: false, erro: "O número passa de 1.000.000. Confira os dígitos." };
  return { ok: true, teto };
}
