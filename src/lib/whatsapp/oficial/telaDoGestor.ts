import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { botoesDoBanco, type BotaoDoModelo } from "./modelos";

type Supa = ReturnType<typeof createServiceClient>;

/**
 * As leituras da tela do número oficial, com tipos de retorno escritos à
 * mão. Não é estilo: a inferência do cliente do Supabase sobre consulta
 * condicional dentro de `Promise.all` e select com relação aninhada levou o
 * `tsc` do projeto inteiro além dos 2 GB de memória (03/11/2026), e o CI roda
 * com o limite padrão do Node. Consultas simples, sequenciais, tipadas aqui.
 */

export type ModeloDaTela = {
  id: string;
  nome: string;
  categoria: "MARKETING" | "UTILITY";
  corpo: string;
  estado: string;
  motivo: string | null;
  qualidade: string | null;
  cabecalho: "nenhum" | "imagem" | "texto";
  rodape: string | null;
  botoes: BotaoDoModelo[];
};

export async function modelosDoNumero(supabase: Supa, grupoId: string, numeroId: string): Promise<ModeloDaTela[]> {
  const { data } = await supabase
    .from("whatsapp_modelos_oficiais")
    .select("id, nome, categoria, corpo, estado, motivo, qualidade, cabecalho, rodape, botoes")
    .eq("grupo_id", grupoId)
    .eq("numero_oficial_id", numeroId)
    .order("created_at", { ascending: false });
  const linhas = (data ?? []) as {
    id: string;
    nome: string;
    categoria: "MARKETING" | "UTILITY";
    corpo: string;
    estado: string;
    motivo: string | null;
    qualidade: string | null;
    cabecalho: "nenhum" | "imagem" | "texto";
    rodape: string | null;
    botoes: unknown;
  }[];
  return linhas.map((m) => ({ ...m, botoes: botoesDoBanco(m.botoes) }));
}

/** Fotos do catálogo do grupo, para o exemplo do cabeçalho do modelo. */
export async function fotosDoCatalogo(supabase: Supa, grupoId: string): Promise<{ url: string; rotulo: string }[]> {
  const { data: midias } = await supabase
    .from("midias")
    .select("url, alt, empreendimento_id")
    .eq("grupo_id", grupoId)
    .eq("tipo", "foto")
    .order("ordem", { ascending: true })
    .limit(40);
  const linhas = (midias ?? []) as { url: string; alt: string | null; empreendimento_id: string }[];
  if (linhas.length === 0) return [];
  const { data: imoveis } = await supabase
    .from("empreendimentos")
    .select("id, nome")
    .eq("grupo_id", grupoId)
    .in("id", [...new Set(linhas.map((m) => m.empreendimento_id))]);
  const nomes = new Map(((imoveis ?? []) as { id: string; nome: string }[]).map((i) => [i.id, i.nome]));
  return linhas.map((m) => ({
    url: m.url,
    rotulo: `${nomes.get(m.empreendimento_id) ?? "Imóvel"}${m.alt ? ` · ${m.alt}` : ""}`,
  }));
}
