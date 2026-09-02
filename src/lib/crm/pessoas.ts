import "server-only";

import { createClient } from "@/lib/supabase/server";
import { sanearBusca } from "@/lib/corretorSessao";
import { nomeParaExibir } from "@/lib/leads/nomeExibido";
import type { EtapaFunil } from "@/lib/types";
import { PESSOAS_POR_PAGINA, type FiltroPessoas, type PessoaNaLista } from "./pessoasTipos";

/**
 * A lista de PESSOAS — a fusão de lead e conversa numa coisa só.
 *
 * O painel oferecia duas portas para o mesmo ser humano: "Leads" e
 * "WhatsApp". Medido em 02/09/2026: dos 116 leads ativos, 91 têm conversa;
 * das 127 conversas, 91 têm lead. Em 91 casos a pessoa existia nos dois
 * lugares, com ações diferentes em cada um, e escolher a porta certa era uma
 * decisão que ninguém toma sem alguém explicar antes — que é exatamente o que
 * um painel usado sem treinamento não pode exigir.
 *
 * A união mora numa view (0088) e não aqui porque o `union all` precisa
 * acontecer ANTES da ordenação e da paginação: montar as duas listas no
 * servidor e juntar em JavaScript devolveria "as 40 conversas mais recentes
 * mais os 40 leads mais recentes", que não é a mesma coisa que "as 40 pessoas
 * mais recentes" — e o erro só apareceria quando a carteira crescesse.
 */

export {
  PESSOAS_POR_PAGINA,
  type PessoaNaLista,
  type FiltroPessoas,
} from "./pessoasTipos";

type LinhaPessoa = {
  pessoa_id: string;
  conversa_id: string | null;
  lead_id: string | null;
  nome: string | null;
  telefone: string | null;
  etapa: string | null;
  ultima_atividade: string;
  previa: string | null;
  nao_lidas: number;
  tem_conversa: boolean;
};

export type PaginaDePessoas = { pessoas: PessoaNaLista[]; total: number };

export async function getPaginaDePessoas(
  filtro: FiltroPessoas = {},
  pagina = 0,
): Promise<PaginaDePessoas> {
  const supabase = await createClient();
  const de = Math.max(0, pagina) * PESSOAS_POR_PAGINA;

  let query = supabase
    .from("pessoas_do_corretor")
    .select(
      "pessoa_id, conversa_id, lead_id, nome, telefone, etapa, ultima_atividade, previa, nao_lidas, tem_conversa",
      { count: "exact" },
    );

  const busca = filtro.busca ? sanearBusca(filtro.busca) : "";
  // Sem saneamento, vírgula e parênteses digitados na busca viram sintaxe de
  // predicado no PostgREST — a mesma armadilha da lista de leads.
  if (busca) query = query.or(`nome.ilike.%${busca}%,telefone.ilike.%${busca}%`);
  if (filtro.etapas?.length) query = query.in("etapa", filtro.etapas);
  if (filtro.soNaoLidas) query = query.gt("nao_lidas", 0);

  const { data, count, error } = await query
    .order("ultima_atividade", { ascending: false })
    .range(de, de + PESSOAS_POR_PAGINA - 1)
    .returns<LinhaPessoa[]>();

  // Lança, como `getPaginaDeLeads`: devolver lista vazia num CRM faz "a
  // consulta falhou" parecer "sua carteira está vazia".
  if (error) throw new Error(`Falha ao carregar pessoas: ${error.message}`);

  return { pessoas: (data ?? []).map(paraPessoa), total: count ?? 0 };
}

function paraPessoa(linha: LinhaPessoa): PessoaNaLista {
  return {
    id: linha.pessoa_id,
    conversaId: linha.conversa_id,
    leadId: linha.lead_id,
    // 31 das 147 pessoas em produção não têm nome nenhum — conversa de número
    // que ainda não virou cadastro. `nomeParaExibir` cai no telefone, que é o
    // que distingue uma linha da outra e o que o corretor reconhece.
    nome: nomeParaExibir({ nome: linha.nome, telefone: linha.telefone }),
    telefone: linha.telefone,
    etapa: (linha.etapa as EtapaFunil | null) ?? null,
    ultimaAtividade: linha.ultima_atividade,
    previa: linha.previa,
    naoLidas: linha.nao_lidas ?? 0,
    temConversa: linha.tem_conversa,
  };
}
