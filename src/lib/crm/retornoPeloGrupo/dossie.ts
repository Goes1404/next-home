// O dossiê do cliente depois do relato da ligação (spec 6.2, passo 5).
//
// Puro. A regra é a do resto do projeto: o relato só ACRESCENTA. Chave
// ausente em `fatos` não toca no que já se sabia, e as listas (exigências,
// objeções) somam com as que já existiam, porque o relato de uma ligação conta
// o que apareceu nela, não tudo o que o cliente já disse.

import type { DossieClienteIA } from "@/lib/whatsapp/types";
import type { LeituraDoRetorno } from "./leituraDoRetorno";

const SCORE_DA_TEMPERATURA = { quente: 80, morno: 55, frio: 25 } as const;

function somar(atuais: readonly string[], novas: readonly string[] | undefined): string[] {
  return [...new Set([...atuais, ...(novas ?? [])])];
}

function dossieVazio(leadId: string): DossieClienteIA {
  const agora = new Date().toISOString();
  return {
    id: "",
    leadId,
    orcamentoMin: null,
    orcamentoMax: null,
    rendaMensal: null,
    regiaoInteresse: null,
    dormitoriosMin: null,
    nomeCliente: null,
    email: null,
    memoria: null,
    formaPagamento: null,
    profissao: null,
    compraEmConjunto: null,
    perfilFamiliar: null,
    urgenciaMudanca: null,
    exigenciasEspecificas: [],
    objecoesIdentificadas: [],
    temperaturaScore: SCORE_DA_TEMPERATURA.morno,
    temperaturaLabel: "morno",
    resumoExecutivo: "",
    proximoPassoSugerido: null,
    createdAt: agora,
    updatedAt: agora,
  };
}

/** O dossiê atual com o relato por cima; null quando o relato não trouxe nada para o dossiê. */
export function dossieComORelato(
  leadId: string,
  atual: DossieClienteIA | null,
  leitura: LeituraDoRetorno,
): DossieClienteIA | null {
  const temNovidade = Object.keys(leitura.fatos).length > 0 || leitura.resumo || leitura.proximoPasso;
  if (!temNovidade) return null;
  const base = atual ?? dossieVazio(leadId);
  const novo: DossieClienteIA = {
    ...base,
    ...leitura.fatos,
    exigenciasEspecificas: somar(base.exigenciasEspecificas ?? [], leitura.fatos.exigenciasEspecificas),
    objecoesIdentificadas: somar(base.objecoesIdentificadas ?? [], leitura.fatos.objecoesIdentificadas),
  };
  if (leitura.fatos.temperaturaLabel && leitura.fatos.temperaturaLabel !== base.temperaturaLabel) {
    novo.temperaturaScore = SCORE_DA_TEMPERATURA[leitura.fatos.temperaturaLabel];
  }
  if (leitura.resumo) novo.resumoExecutivo = leitura.resumo;
  if (leitura.proximoPasso) novo.proximoPassoSugerido = leitura.proximoPasso;
  return novo;
}

/**
 * O dossiê como a IA o lê. Não só o resumo: sem as listas e os números ela
 * não tem como juntar "o que já se sabia" com o relato no resumo novo.
 */
export function textoDoDossie(d: DossieClienteIA | null): string | null {
  if (!d) return null;
  const linhas: string[] = [];
  if (d.resumoExecutivo?.trim()) linhas.push(`Resumo: ${d.resumoExecutivo.trim()}`);
  if (d.orcamentoMin != null || d.orcamentoMax != null) {
    linhas.push(`Orçamento: ${d.orcamentoMin ?? "?"} a ${d.orcamentoMax ?? "?"}`);
  }
  if (d.rendaMensal != null) linhas.push(`Renda mensal: ${d.rendaMensal}`);
  if (d.regiaoInteresse) linhas.push(`Região: ${d.regiaoInteresse}`);
  if (d.dormitoriosMin != null) linhas.push(`Dormitórios: ${d.dormitoriosMin}`);
  if (d.formaPagamento) linhas.push(`Forma de pagamento: ${d.formaPagamento}`);
  if (d.perfilFamiliar) linhas.push(`Perfil familiar: ${d.perfilFamiliar}`);
  if (d.urgenciaMudanca) linhas.push(`Urgência: ${d.urgenciaMudanca}`);
  if (d.exigenciasEspecificas?.length) linhas.push(`Exigências: ${d.exigenciasEspecificas.join(", ")}`);
  if (d.objecoesIdentificadas?.length) linhas.push(`Objeções: ${d.objecoesIdentificadas.join(", ")}`);
  if (d.temperaturaLabel) linhas.push(`Temperatura: ${d.temperaturaLabel}`);
  if (d.proximoPassoSugerido) linhas.push(`Próximo passo: ${d.proximoPassoSugerido}`);
  return linhas.length ? linhas.join("\n") : null;
}
