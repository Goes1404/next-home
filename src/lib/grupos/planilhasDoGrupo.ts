import { planilhaDasFichas, type FichaDoLead } from "@/lib/corretores/fichasDoCorretor";
import type { Celula, Planilha } from "@/lib/imoveis/xlsxEscrita";
import { STATUS_LABEL, type StatusObra } from "@/lib/types";

/**
 * Os dados de um grupo numa planilha só, com quatro abas (operação enxuta,
 * 20/10/2026): Leads, Imóveis, Corretores e Vendas. É o que o gestor baixa a
 * qualquer hora e o que a plataforma entrega ao cliente que cancelou
 * (resposta 7 do dono), e a cópia que a rotina dos 90 dias guarda antes de
 * apagar.
 *
 * O que fica de FORA é decisão, não esquecimento:
 *   - conversa, mensagem, dossiê da IA, anotação e `leads.mensagem` (a
 *     importação de conversa grava falas ali): gestor e plataforma nunca
 *     leem conversa (§4). A aba de leads é a mesma ficha de
 *     `fichasDoCorretor.ts`;
 *   - WhatsApp, e-mail e login dos corretores (dado pessoal deles, que não
 *     serve à imobiliária para continuar o negócio);
 *   - CPF/CNPJ do comprador (`venda_fiscal`) e a observação livre da venda.
 *
 * Puro: a leitura mora em `exportacaoDoGrupo.ts`.
 */

export type LeadDaExportacao = FichaDoLead & { id: string; corretor_id: string | null };

export type ImovelDaExportacao = {
  id: string;
  nome: string;
  slug: string;
  status: string;
  cidade: string | null;
  bairro: string | null;
  endereco: string | null;
  construtora: string | null;
  preco_a_partir: number | string | null;
  entrega_prevista: string | null;
  publicado: boolean;
  created_at: string;
};

export type CorretorDaExportacao = {
  id: string;
  nome: string;
  creci: string | null;
  papel: string;
  ativo: boolean;
  created_at: string;
};

export type VendaDaExportacao = {
  data_venda: string | null;
  lead_id: string | null;
  corretor_id: string | null;
  empreendimento_id: string | null;
  imovel_descricao: string | null;
  unidade: string | null;
  valor_venda: number | string | null;
  comissao_percentual: number | string | null;
  comissao_valor: number | string | null;
  status: string;
  comissao_recebida_em: string | null;
};

export type DadosDoGrupo = {
  leads: LeadDaExportacao[];
  imoveis: ImovelDaExportacao[];
  corretores: CorretorDaExportacao[];
  vendas: VendaDaExportacao[];
};

/** As colunas lidas de cada tabela. Nenhuma tem conversa nem documento. */
export const COLUNAS_DO_IMOVEL =
  "id, nome, slug, status, cidade, bairro, endereco, construtora, preco_a_partir, entrega_prevista, publicado, created_at";
export const COLUNAS_DO_CORRETOR = "id, nome, creci, papel, ativo, created_at";
export const COLUNAS_DA_VENDA =
  "data_venda, lead_id, corretor_id, empreendimento_id, imovel_descricao, unidade, valor_venda, comissao_percentual, comissao_valor, status, comissao_recebida_em";

const DATA = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });

/** `timestamptz` vira o dia em São Paulo; `date` (AAAA-MM-DD) vira DD/MM/AAAA sem fuso. */
function data(valor: string | null): string | null {
  if (!valor) return null;
  const soDia = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (soDia) return `${soDia[3]}/${soDia[2]}/${soDia[1]}`;
  return DATA.format(new Date(valor));
}

/** `numeric` chega como texto do supabase-js. */
function numero(v: number | string | null): number | null {
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function abaDeLeads(dados: DadosDoGrupo, nomeDoImovel: Map<string, string>, nomeDoCorretor: Map<string, string>): Planilha {
  const base = planilhaDasFichas(dados.leads, nomeDoImovel);
  return {
    aba: "Leads",
    colunas: [...base.colunas, { titulo: "Corretor", largura: 24 }],
    linhas: base.linhas.map((linha, i): Celula[] => {
      const corretor = dados.leads[i].corretor_id;
      return [...linha, corretor ? (nomeDoCorretor.get(corretor) ?? null) : null];
    }),
  };
}

function abaDeImoveis(imoveis: ImovelDaExportacao[]): Planilha {
  return {
    aba: "Imóveis",
    colunas: [
      { titulo: "Nome", largura: 30 },
      { titulo: "Endereço no site", largura: 30 },
      { titulo: "Situação da obra", largura: 18 },
      { titulo: "Publicado", largura: 10 },
      { titulo: "Cidade", largura: 16 },
      { titulo: "Bairro", largura: 18 },
      { titulo: "Endereço", largura: 32 },
      { titulo: "Construtora", largura: 20 },
      { titulo: "A partir de", largura: 14 },
      { titulo: "Entrega prevista", largura: 14 },
      { titulo: "Cadastrado em", largura: 13 },
    ],
    linhas: imoveis.map((i) => [
      i.nome,
      i.slug,
      STATUS_LABEL[i.status as StatusObra] ?? i.status,
      i.publicado ? "Sim" : "Não",
      i.cidade,
      i.bairro,
      i.endereco,
      i.construtora,
      numero(i.preco_a_partir),
      data(i.entrega_prevista),
      data(i.created_at),
    ]),
  };
}

function abaDeCorretores(corretores: CorretorDaExportacao[]): Planilha {
  return {
    aba: "Corretores",
    colunas: [
      { titulo: "Nome", largura: 28 },
      { titulo: "CRECI", largura: 14 },
      { titulo: "Papel", largura: 14 },
      { titulo: "Situação", largura: 11 },
      { titulo: "Cadastrado em", largura: 13 },
    ],
    linhas: corretores.map((c) => [
      c.nome,
      c.creci,
      c.papel === "gestor" ? "Gestor" : "Corretor",
      c.ativo ? "Ativo" : "Inativo",
      data(c.created_at),
    ]),
  };
}

function abaDeVendas(
  vendas: VendaDaExportacao[],
  nomeDoLead: Map<string, string>,
  nomeDoImovel: Map<string, string>,
  nomeDoCorretor: Map<string, string>,
): Planilha {
  return {
    aba: "Vendas",
    colunas: [
      { titulo: "Data", largura: 12 },
      { titulo: "Imóvel", largura: 28 },
      { titulo: "Unidade", largura: 14 },
      { titulo: "Cliente", largura: 28 },
      { titulo: "Corretor", largura: 24 },
      { titulo: "Valor", largura: 14 },
      { titulo: "Comissão (%)", largura: 12 },
      { titulo: "Comissão", largura: 14 },
      { titulo: "Situação", largura: 12 },
      { titulo: "Comissão recebida em", largura: 14 },
    ],
    linhas: vendas.map((v) => [
      data(v.data_venda),
      (v.empreendimento_id ? nomeDoImovel.get(v.empreendimento_id) : undefined) ?? v.imovel_descricao,
      v.unidade,
      v.lead_id ? (nomeDoLead.get(v.lead_id) ?? null) : null,
      v.corretor_id ? (nomeDoCorretor.get(v.corretor_id) ?? null) : null,
      numero(v.valor_venda),
      numero(v.comissao_percentual),
      numero(v.comissao_valor),
      v.status === "distratada" ? "Distratada" : "Ativa",
      data(v.comissao_recebida_em),
    ]),
  };
}

export function planilhasDoGrupo(dados: DadosDoGrupo): Planilha[] {
  const nomeDoImovel = new Map(dados.imoveis.map((i) => [i.id, i.nome]));
  const nomeDoCorretor = new Map(dados.corretores.map((c) => [c.id, c.nome]));
  const nomeDoLead = new Map(dados.leads.map((l) => [l.id, l.nome]));
  return [
    abaDeLeads(dados, nomeDoImovel, nomeDoCorretor),
    abaDeImoveis(dados.imoveis),
    abaDeCorretores(dados.corretores),
    abaDeVendas(dados.vendas, nomeDoLead, nomeDoImovel, nomeDoCorretor),
  ];
}

/** Quantas linhas de cada aba: é o que vai no evento de auditoria (sem dado pessoal). */
export function contagemDaExportacao(dados: DadosDoGrupo): Record<keyof DadosDoGrupo, number> {
  return {
    leads: dados.leads.length,
    imoveis: dados.imoveis.length,
    corretores: dados.corretores.length,
    vendas: dados.vendas.length,
  };
}
