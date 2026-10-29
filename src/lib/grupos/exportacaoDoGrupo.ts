import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { COLUNAS_DA_FICHA } from "@/lib/corretores/fichasDoCorretor";
import { gerarXlsx } from "@/lib/imoveis/xlsxEscrita";
import type { Database } from "@/lib/supabase/types";
import {
  COLUNAS_DA_VENDA,
  COLUNAS_DO_CORRETOR,
  COLUNAS_DO_IMOVEL,
  planilhasDoGrupo,
  type CorretorDaExportacao,
  type DadosDoGrupo,
  type ImovelDaExportacao,
  type LeadDaExportacao,
  type VendaDaExportacao,
} from "./planilhasDoGrupo";

/**
 * A leitura dos dados de um grupo para a planilha (`planilhasDoGrupo.ts`).
 *
 * Recebe o cliente de quem chama: a sessão do gestor (a RLS recorta o grupo
 * e o filtro repete, por escrito) ou a chave de serviço (a área da
 * plataforma e a rotina dos 90 dias, que validaram o grupo antes). Por isso
 * TODA consulta filtra `grupo_id` no mesmo encadeamento, e só estas quatro
 * tabelas são lidas — nada de conversa, mensagem, dossiê ou anotação
 * (`exportacaoDoGrupo.test.ts` lê o código e cobra as duas coisas).
 *
 * O PostgREST devolve no máximo 1000 linhas por resposta: a leitura pagina,
 * com desempate por `id` (a importação em lote dá o mesmo `created_at` a
 * centenas de leads, e sem desempate a página seguinte repete ou pula).
 */

type Cliente = SupabaseClient<Database>;

const PAGINA = 1000;

export class FalhaNaExportacao extends Error {}

async function paginar<T>(
  tabela: string,
  ler: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<T[]> {
  const saida: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await ler(de, de + PAGINA - 1);
    if (error) throw new FalhaNaExportacao(`${tabela}: ${error.message}`);
    const linhas = (data ?? []) as T[];
    saida.push(...linhas);
    if (linhas.length < PAGINA) break;
  }
  return saida;
}

/** Lê os quatro conjuntos do grupo. Lança `FalhaNaExportacao`: planilha pela metade não sai. */
export async function lerDadosDoGrupo(cliente: Cliente, grupoId: string): Promise<DadosDoGrupo> {
  const [leads, imoveis, corretores, vendas] = await Promise.all([
    paginar<LeadDaExportacao>("leads", (de, ate) =>
      cliente
        .from("leads")
        .select(`id, corretor_id, ${COLUNAS_DA_FICHA}`)
        .eq("grupo_id", grupoId)
        .order("created_at")
        .order("id")
        .range(de, ate),
    ),
    paginar<ImovelDaExportacao>("empreendimentos", (de, ate) =>
      cliente.from("empreendimentos").select(COLUNAS_DO_IMOVEL).eq("grupo_id", grupoId).order("nome").order("id").range(de, ate),
    ),
    paginar<CorretorDaExportacao>("corretores", (de, ate) =>
      cliente.from("corretores").select(COLUNAS_DO_CORRETOR).eq("grupo_id", grupoId).order("nome").order("id").range(de, ate),
    ),
    paginar<Omit<VendaDaExportacao, "ultimo_recebimento">>("vendas", (de, ate) =>
      cliente.from("vendas").select(COLUNAS_DA_VENDA).eq("grupo_id", grupoId).order("data_venda").order("id").range(de, ate),
    ),
  ]);
  // A data de recebimento mora nas parcelas desde a 0232: a última recebida.
  const recebidas = await paginar<{ venda_id: string; recebida_em: string }>("venda_parcelas", (de, ate) =>
    cliente
      .from("venda_parcelas")
      .select("venda_id, recebida_em")
      .eq("grupo_id", grupoId)
      .not("recebida_em", "is", null)
      .order("venda_id")
      .order("numero")
      .range(de, ate),
  );
  const ultimo = new Map<string, string>();
  for (const p of recebidas) if (p.recebida_em > (ultimo.get(p.venda_id) ?? "")) ultimo.set(p.venda_id, p.recebida_em);
  return {
    leads,
    imoveis,
    corretores,
    vendas: vendas.map((v) => ({ ...v, ultimo_recebimento: ultimo.get(v.id) ?? null })),
  };
}

/** O .xlsx com as quatro abas. */
export function arquivoDoGrupo(dados: DadosDoGrupo): Buffer {
  return gerarXlsx(planilhasDoGrupo(dados));
}

/** `dados-<slug>-AAAA-MM-DD.xlsx`, no dia de São Paulo. */
export function nomeDoArquivo(slug: string, agora: Date = new Date()): string {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  const limpo = slug.replace(/[^a-z0-9-]/gi, "") || "grupo";
  return `dados-${limpo}-${hoje}.xlsx`;
}

export const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
