import { EMPREENDIMENTOS } from "@/lib/data/empreendimentos";
import type { Empreendimento, FiltrosEmpreendimento } from "@/lib/types";

/**
 * Camada de acesso a dados dos empreendimentos.
 *
 * Assíncrona por design mesmo lendo de um array local: quando a Fase 2
 * trocar isto por consultas ao Supabase, as páginas que já chamam `await`
 * aqui não precisam mudar — só o corpo destas funções.
 */

function bate(e: Empreendimento, f: FiltrosEmpreendimento): boolean {
  if (f.tipo && e.tipo !== f.tipo) return false;
  if (f.cidade && e.cidade !== f.cidade) return false;
  if (f.bairro && e.bairro !== f.bairro) return false;
  if (f.precoMax != null && e.precoAPartir != null && e.precoAPartir > f.precoMax) {
    return false;
  }
  if (f.dormitoriosMin != null) {
    const maiorOuIgual = e.tipologias.some((t) => t.dormitorios >= f.dormitoriosMin!);
    if (!maiorOuIgual) return false;
  }
  return true;
}

export async function getEmpreendimentos(
  filtros?: FiltrosEmpreendimento,
): Promise<Empreendimento[]> {
  if (!filtros) return EMPREENDIMENTOS;
  return EMPREENDIMENTOS.filter((e) => bate(e, filtros));
}

export async function getEmpreendimentosDestaque(): Promise<Empreendimento[]> {
  return EMPREENDIMENTOS.filter((e) => e.destaque);
}

export async function getEmpreendimentoBySlug(
  slug: string,
): Promise<Empreendimento | null> {
  return EMPREENDIMENTOS.find((e) => e.slug === slug) ?? null;
}

export async function getSlugsEmpreendimentos(): Promise<string[]> {
  return EMPREENDIMENTOS.map((e) => e.slug);
}

/** Cidades e bairros distintos, para popular os selects de filtro. */
export async function getRegioesDisponiveis(): Promise<{
  cidades: string[];
  bairros: string[];
}> {
  const cidades = [...new Set(EMPREENDIMENTOS.map((e) => e.cidade))].sort();
  const bairros = [...new Set(EMPREENDIMENTOS.map((e) => e.bairro))].sort();
  return { cidades, bairros };
}
