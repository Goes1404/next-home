import "server-only";

import { statusDaIndicacao, type StatusDaIndicacao } from "@/lib/indicacoes/indicacao";
import { VERSAO_DO_TERMO_DE_ADESAO } from "@/lib/termos/termoDeAdesao";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * O negócio da Astro na área da plataforma (0247, 29/10/2026): as
 * indicações de todas as contas (`/plataforma/indicacoes`) e, na tela de UMA
 * conta, o código dela, quem a indicou, os créditos a aplicar e o aceite do
 * termo de adesão.
 *
 * Pela chave de serviço, depois da guarda: cada função pede a PROVA de
 * `exigirAdminDaPlataforma*` (`_prova`), como `grupos.ts`. Nada de conversa,
 * ficha nem lead: só nomes de contas, datas e os créditos.
 */

const LIMITE = 500;

export type CreditoNaPlataforma = {
  id: string;
  criadoEm: string;
  descricao: string;
  valorEstimado: number | null;
  aplicadoEm: string | null;
  /** A conta indicada que pagou e gerou o crédito. */
  indicada: { id: string; nome: string } | null;
};

export type IndicacaoNaPlataforma = {
  id: string;
  criadoEm: string;
  codigo: string;
  indicadora: { id: string; nome: string };
  indicada: { id: string; nome: string };
  status: StatusDaIndicacao;
  credito: CreditoNaPlataforma | null;
};

type LinhaDeCredito = {
  id: string;
  criado_em: string;
  indicacao_id: string;
  descricao: string;
  valor_estimado: number | null;
  aplicado_em: string | null;
};

function paraCredito(c: LinhaDeCredito, indicada: { id: string; nome: string } | null): CreditoNaPlataforma {
  return {
    id: c.id,
    criadoEm: c.criado_em,
    descricao: c.descricao,
    valorEstimado: c.valor_estimado === null ? null : Number(c.valor_estimado),
    aplicadoEm: c.aplicado_em,
    indicada,
  };
}

/** Todas as indicações, mais novas primeiro. Erro de leitura lança (a página mostra o erro). */
export async function listarIndicacoes(_prova: { userId: string }): Promise<IndicacaoNaPlataforma[]> {
  const servico = createServiceClient();
  const [indicacoes, creditos] = await Promise.all([
    servico
      .from("indicacoes")
      .select("id, criado_em, codigo, grupo_indicador_id, grupo_indicado_id")
      .order("criado_em", { ascending: false })
      .limit(LIMITE),
    servico
      .from("creditos_de_indicacao")
      .select("id, criado_em, indicacao_id, descricao, valor_estimado, aplicado_em")
      .limit(LIMITE),
  ]);
  if (indicacoes.error) throw new Error(`indicações não lidas: ${indicacoes.error.message}`);
  if (creditos.error) throw new Error(`créditos não lidos: ${creditos.error.message}`);

  const ids = [
    ...new Set((indicacoes.data ?? []).flatMap((i) => [i.grupo_indicador_id, i.grupo_indicado_id])),
  ];
  const { data: grupos, error } =
    ids.length > 0
      ? await servico.from("grupos").select("id, nome, situacao").in("id", ids)
      : { data: [] as { id: string; nome: string; situacao: string }[], error: null };
  if (error) throw new Error(`contas das indicações não lidas: ${error.message}`);

  const porId = new Map((grupos ?? []).map((g) => [g.id, g]));
  const creditoPorIndicacao = new Map((creditos.data ?? []).map((c) => [c.indicacao_id, c]));
  return (indicacoes.data ?? []).map((i) => {
    const indicadora = porId.get(i.grupo_indicador_id);
    const indicada = porId.get(i.grupo_indicado_id);
    const linha = creditoPorIndicacao.get(i.id) ?? null;
    const daIndicada = { id: i.grupo_indicado_id, nome: indicada?.nome ?? "Conta apagada" };
    return {
      id: i.id,
      criadoEm: i.criado_em,
      codigo: i.codigo,
      indicadora: { id: i.grupo_indicador_id, nome: indicadora?.nome ?? "Conta apagada" },
      indicada: daIndicada,
      status: statusDaIndicacao({
        credito: linha ? { aplicadoEm: linha.aplicado_em } : null,
        indicadaEncerrada: indicada?.situacao === "encerrado",
      }),
      credito: linha ? paraCredito(linha, daIndicada) : null,
    };
  });
}

export type AceiteNaPlataforma = {
  versao: string;
  aceitoEm: string;
  nome: string;
  email: string | null;
  /** É a versão vigente do termo? */
  vigente: boolean;
};

export type NegocioDoGrupo = {
  codigo: string | null;
  indicadaPor: { id: string; nome: string } | null;
  indicacoesFeitas: number;
  creditos: CreditoNaPlataforma[];
  aceites: AceiteNaPlataforma[];
};

/**
 * O negócio de UMA conta, para a tela dela na plataforma. Falha de leitura
 * devolve `null` (a seção diz "não deu para ler" e o resto da tela abre).
 */
export async function lerNegocioDoGrupo(_prova: { userId: string }, grupoId: string): Promise<NegocioDoGrupo | null> {
  const servico = createServiceClient();
  try {
    const [grupo, indicadaPor, feitas, creditos, aceites] = await Promise.all([
      servico.from("grupos").select("codigo_de_indicacao").eq("id", grupoId).maybeSingle(),
      servico.from("indicacoes").select("grupo_indicador_id").eq("grupo_indicado_id", grupoId).maybeSingle(),
      servico
        .from("indicacoes")
        .select("id, grupo_indicado_id")
        .eq("grupo_indicador_id", grupoId)
        .limit(LIMITE),
      servico
        .from("creditos_de_indicacao")
        .select("id, criado_em, indicacao_id, descricao, valor_estimado, aplicado_em")
        .eq("grupo_beneficiado_id", grupoId)
        .order("criado_em", { ascending: false }),
      servico
        .from("aceites_do_termo_de_adesao")
        .select("versao, aceito_em, nome_no_aceite, email_no_aceite")
        .eq("grupo_id", grupoId)
        .order("aceito_em", { ascending: false }),
    ]);
    const erro = grupo.error ?? indicadaPor.error ?? feitas.error ?? creditos.error ?? aceites.error;
    if (erro) throw new Error(erro.message);

    const indicadaPorId = indicadaPor.data?.grupo_indicador_id ?? null;
    const indicadasIds = (feitas.data ?? []).map((f) => f.grupo_indicado_id);
    const ids = [...new Set([...(indicadaPorId ? [indicadaPorId] : []), ...indicadasIds])];
    const { data: nomes, error: erroDosNomes } =
      ids.length > 0
        ? await servico.from("grupos").select("id, nome").in("id", ids)
        : { data: [] as { id: string; nome: string }[], error: null };
    if (erroDosNomes) throw new Error(erroDosNomes.message);
    const nomePorId = new Map((nomes ?? []).map((g) => [g.id, g.nome]));
    const indicadaDaIndicacao = new Map((feitas.data ?? []).map((f) => [f.id, f.grupo_indicado_id]));

    return {
      codigo: grupo.data?.codigo_de_indicacao ?? null,
      indicadaPor: indicadaPorId ? { id: indicadaPorId, nome: nomePorId.get(indicadaPorId) ?? "Conta apagada" } : null,
      indicacoesFeitas: indicadasIds.length,
      creditos: (creditos.data ?? []).map((c) => {
        const indicadaId = indicadaDaIndicacao.get(c.indicacao_id) ?? null;
        return paraCredito(c, indicadaId ? { id: indicadaId, nome: nomePorId.get(indicadaId) ?? "Conta apagada" } : null);
      }),
      aceites: (aceites.data ?? []).map((a) => ({
        versao: a.versao,
        aceitoEm: a.aceito_em,
        nome: a.nome_no_aceite,
        email: a.email_no_aceite,
        vigente: a.versao === VERSAO_DO_TERMO_DE_ADESAO,
      })),
    };
  } catch (e) {
    console.error(`[plataforma] negócio do grupo ${grupoId} não lido: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}
