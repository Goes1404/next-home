import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Candidato, DecisaoCandidato } from "./filaDeCandidatos";

/**
 * Leitura da fila de candidatos.
 *
 * Usa o cliente de SESSÃO, não a service key: a RLS da 0078 deixa todo
 * corretor logado ver a fila (o catálogo é da imobiliária, não de um
 * corretor), e é ela quem deve decidir isso — não um cliente que ignora
 * policy.
 *
 * Sem paginação de propósito. A fila tem 39 linhas e é finita por
 * construção: ela existe para ESVAZIAR. Se um dia passar de algumas
 * centenas, é sinal de que ninguém está decidindo — e aí o conserto é
 * decidir, não paginar.
 */
export async function getCandidatosDoCatalogo(): Promise<Candidato[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("catalogo_candidatos")
    .select("id, ref_externa, nome, bairro, status_obra, dormitorios, area, link, decisao, motivo")
    .order("nome");

  if (error) {
    console.error("[candidatos] falha ao ler a fila:", error.message);
    return [];
  }

  return (data ?? []).map((linha) => ({
    id: linha.id,
    refExterna: linha.ref_externa,
    nome: linha.nome,
    bairro: linha.bairro,
    statusObra: linha.status_obra,
    dormitorios: linha.dormitorios,
    area: linha.area,
    link: linha.link,
    decisao: linha.decisao as DecisaoCandidato,
    motivo: linha.motivo,
  }));
}

/**
 * Só o número, para o cartão da tela de Imóveis.
 *
 * `head: true` — a tela de Imóveis já carrega o catálogo inteiro com mídias
 * e tipologias; trazer 39 linhas a mais para contá-las em JavaScript seria
 * pagar duas vezes pelo mesmo dado. Contar e listar são consultas
 * diferentes, e é a lição que a F5 deixou registrada.
 */
export async function contarCandidatosPendentes(): Promise<number> {
  const supabase = await createClient();

  const { count, error } = await supabase
    .from("catalogo_candidatos")
    .select("id", { count: "exact", head: true })
    .eq("decisao", "pendente");

  if (error) {
    console.error("[candidatos] falha ao contar pendentes:", error.message);
    return 0;
  }

  return count ?? 0;
}

/** Um candidato só, para pré-preencher o formulário de cadastro. */
export async function getCandidato(id: string): Promise<Candidato | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("catalogo_candidatos")
    .select("id, ref_externa, nome, bairro, status_obra, dormitorios, area, link, decisao, motivo")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    refExterna: data.ref_externa,
    nome: data.nome,
    bairro: data.bairro,
    statusObra: data.status_obra,
    dormitorios: data.dormitorios,
    area: data.area,
    link: data.link,
    decisao: data.decisao as DecisaoCandidato,
    motivo: data.motivo,
  };
}
