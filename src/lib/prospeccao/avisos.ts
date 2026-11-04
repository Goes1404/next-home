// Os avisos da prospecção no celular de quem vende (04/11/2026). Módulo PURO:
// decide se e o que avisar; quem manda é a rota (push só para a equipe).

import { followupDevido, semResposta, temperatura, type LinhaDoFunil } from "./funil";

export type AvisoDaProspeccao = { titulo: string; corpo: string; url: string; tag: string };

const HORA = 3_600_000;
const ETAPAS_QUE_AVISAM = new Set(["enviado", "respondeu", "reuniao", "proposta"]);

/**
 * A loja abriu a amostra: avisa na hora, porque é o melhor momento de
 * chamar. Só loja já abordada (antes do envio quem abre somos nós) e uma
 * vez a cada 12 h, senão quem relê a página vira uma enxurrada de avisos.
 * `anteriores` são as aberturas antes desta (ISO).
 */
export function avisoDeAbertura(
  loja: { id: string; nome: string; etapa: string; nao_contatar: boolean },
  anteriores: string[],
  agora: Date = new Date(),
): AvisoDaProspeccao | null {
  if (loja.nao_contatar || !ETAPAS_QUE_AVISAM.has(loja.etapa)) return null;
  if (anteriores.some((v) => agora.getTime() - new Date(v).getTime() < 12 * HORA)) return null;
  const primeira = anteriores.length === 0;
  return {
    titulo: primeira ? `${loja.nome} abriu a amostra` : `${loja.nome} voltou à amostra`,
    corpo:
      loja.etapa === "enviado"
        ? "Está olhando agora. Bom momento para chamar no WhatsApp."
        : "Está olhando a amostra de novo. Vale puxar a conversa.",
    url: `/plataforma/prospeccao/${loja.id}`,
    tag: `prospeccao-abertura-${loja.id}`,
  };
}

export type LinhaDoResumo = LinhaDoFunil & { nome: string };

/**
 * O resumo da manhã: o que fazer hoje no funil, em uma notificação. Nulo
 * quando não há nada a fazer (não acorda ninguém à toa).
 */
export function resumoDoDia(linhas: LinhaDoResumo[], agora: Date = new Date()): AvisoDaProspeccao | null {
  const novas = linhas.filter((l) => l.etapa === "novo" && !l.nao_contatar);
  const followups = linhas.filter((l) => followupDevido(l, agora));
  const quentes = linhas.filter((l) => l.etapa === "enviado" && temperatura(l, agora) === "quente");
  const respondeu = linhas.filter((l) => l.etapa === "respondeu" && !l.nao_contatar);

  const partes: string[] = [];
  if (respondeu.length) partes.push(`${respondeu.length} ${respondeu.length === 1 ? "respondeu e espera" : "responderam e esperam"} você`);
  if (quentes.length) partes.push(`${quentes.length} ${quentes.length === 1 ? "abriu" : "abriram"} a amostra (${nomes(quentes)})`);
  if (followups.length) partes.push(`${followups.length} follow-up${followups.length === 1 ? "" : "s"} para mandar`);
  if (novas.length) partes.push(`${novas.length} loja${novas.length === 1 ? " nova" : "s novas"} para abordar`);
  if (!partes.length) return null;

  return {
    titulo: "Prospecção: o plano de hoje",
    corpo: `${partes.join(" · ")}.`,
    url: "/plataforma/prospeccao",
    tag: "prospeccao-resumo",
  };
}

/** As lojas que a rotina diária encerra como perdidas por falta de resposta. */
export function paraEncerrar<T extends LinhaDoFunil>(linhas: T[], agora: Date = new Date()): T[] {
  return linhas.filter((l) => semResposta(l, agora));
}

function nomes(linhas: { nome: string }[]): string {
  const primeiros = linhas.slice(0, 2).map((l) => l.nome);
  return linhas.length > 2 ? `${primeiros.join(", ")} e mais ${linhas.length - 2}` : primeiros.join(" e ");
}
