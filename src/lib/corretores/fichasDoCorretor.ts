import { formatarTelefoneBr } from "@/lib/inbound/phoneUtils";
import type { Celula, Planilha } from "@/lib/imoveis/xlsxEscrita";
import { ETAPA_LABEL, type EtapaFunil } from "@/lib/types";

/**
 * A planilha que o gestor entrega ao corretor que sai (fase 5, spec §9): as
 * FICHAS dos leads que ele trouxe (`leads.trazido_por = 'corretor'`, 0200).
 *
 * Só a ficha. Fica de fora tudo o que é conversa ou nasce dela: as
 * mensagens, a `mensagem` do cadastro (a importação de conversa grava ali
 * as falas do cliente), `detalhes`, o dossiê da IA, as notas e a linha do
 * tempo. Gestor nunca lê conversa de outro, e a exportação não pode virar o
 * caminho para isso.
 */

/** As colunas lidas de `leads`. Nada de texto livre que possa ter conversa. */
export const COLUNAS_DA_FICHA =
  "nome, telefone, email, etapa, origem, empreendimento_id, imovel_interesse_id, orcamento_min, orcamento_max, renda_mensal, regiao_interesse, dormitorios_min, created_at, visita_agendada_em, arquivado_em";

export type FichaDoLead = {
  nome: string;
  telefone: string | null;
  email: string | null;
  etapa: string;
  origem: string | null;
  empreendimento_id: string | null;
  imovel_interesse_id: string | null;
  /** `numeric` chega como texto do supabase-js. */
  orcamento_min: number | string | null;
  orcamento_max: number | string | null;
  renda_mensal: number | string | null;
  regiao_interesse: string | null;
  dormitorios_min: number | null;
  created_at: string;
  visita_agendada_em: string | null;
  arquivado_em: string | null;
};

const dataBr = (iso: string | null): string | null =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(iso)) : null;

const numero = (v: number | string | null): number | null => {
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** De onde o lead veio, em palavras (a origem crua é vocabulário de quem construiu). */
export function origemLegivel(origem: string | null): string | null {
  if (!origem) return null;
  if (origem === "painel/manual") return "Cadastrado à mão";
  if (origem === "painel/importacao") return "Importado";
  if (origem === "indicacao") return "Indicação";
  if (origem.startsWith("whatsapp/")) return "WhatsApp";
  if (origem.startsWith("meta/")) return "Anúncio";
  if (origem.startsWith("site")) return "Site";
  if (origem.startsWith("inbound/")) return "Portal";
  return origem;
}

export function planilhaDasFichas(fichas: FichaDoLead[], nomeDoImovel: Map<string, string>): Planilha {
  const imovel = (f: FichaDoLead) => {
    const id = f.imovel_interesse_id ?? f.empreendimento_id;
    return id ? (nomeDoImovel.get(id) ?? null) : null;
  };
  const linhas: Celula[][] = fichas.map((f) => [
    f.nome,
    f.telefone ? formatarTelefoneBr(f.telefone) : null,
    f.email,
    ETAPA_LABEL[f.etapa as EtapaFunil] ?? f.etapa,
    f.arquivado_em ? "Arquivado" : "Ativo",
    origemLegivel(f.origem),
    imovel(f),
    numero(f.orcamento_min),
    numero(f.orcamento_max),
    numero(f.renda_mensal),
    f.regiao_interesse,
    f.dormitorios_min,
    dataBr(f.created_at),
    dataBr(f.visita_agendada_em),
  ]);
  return {
    aba: "Fichas",
    colunas: [
      { titulo: "Nome", largura: 28 },
      { titulo: "Telefone", largura: 18 },
      { titulo: "E-mail", largura: 28 },
      { titulo: "Etapa", largura: 18 },
      { titulo: "Situação", largura: 11 },
      { titulo: "Origem", largura: 18 },
      { titulo: "Imóvel de interesse", largura: 28 },
      { titulo: "Orçamento a partir de", largura: 14 },
      { titulo: "Orçamento até", largura: 14 },
      { titulo: "Renda mensal", largura: 14 },
      { titulo: "Região", largura: 20 },
      { titulo: "Dormitórios (mín.)", largura: 10 },
      { titulo: "Cadastrado em", largura: 13 },
      { titulo: "Visita marcada", largura: 13 },
    ],
    linhas,
  };
}
