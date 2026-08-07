import { EMPREENDIMENTOS } from "@/lib/data/empreendimentos";
import type { Empreendimento } from "@/lib/types";

/**
 * Camada de acesso a dados dos empreendimentos.
 *
 * Assíncrona por design mesmo lendo de um array local: quando a Fase 2
 * trocar isto por consultas ao Supabase, as páginas que já chamam `await`
 * aqui não precisam mudar — só o corpo destas funções.
 */

export async function getEmpreendimentos(): Promise<Empreendimento[]> {
  return EMPREENDIMENTOS;
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
