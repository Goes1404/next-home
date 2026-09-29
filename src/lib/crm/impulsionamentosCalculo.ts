/**
 * Quanto cada impulsionamento rendeu (27/09/2026). Módulo PURO.
 *
 * O gasto é o que o corretor digitou; os leads vêm da tabela `leads`, casados
 * pelo id do anúncio na Meta. O anúncio sem etiqueta (só o texto padrão da
 * Meta o identificou) junta todos os leads assim do corretor numa linha.
 */
import { TITULO_SEM_ETIQUETA } from "@/lib/whatsapp/anuncioMeta";

export type LinhaImpulsionamento = {
  id: string;
  corretorId: string;
  chave: string;
  titulo: string | null;
  url: string | null;
  empreendimentoId: string | null;
  valorGasto: number | null;
  primeiroLeadEm: string;
  ultimoLeadEm: string;
};

export type LeadDeAnuncio = {
  corretorId: string | null;
  metaAdId: string | null;
  anuncioOrigem: string | null;
  etapa: string;
  visitaAgendadaEm: string | null;
};

export type ResumoImpulsionamento = LinhaImpulsionamento & {
  leads: number;
  visitas: number;
  fechados: number;
  custoPorLead: number | null;
  custoPorVisita: number | null;
};

const ETAPAS_DE_VISITA_EM_DIANTE = new Set(["visita_agendada", "documentacao", "fechado"]);

function doAnuncio(linha: LinhaImpulsionamento, lead: LeadDeAnuncio): boolean {
  if (lead.corretorId !== linha.corretorId) return false;
  if (linha.chave === "sem-etiqueta") {
    return lead.metaAdId === null && lead.anuncioOrigem === TITULO_SEM_ETIQUETA;
  }
  return lead.metaAdId === linha.chave;
}

function dividir(valor: number | null, por: number): number | null {
  if (valor === null || por === 0) return null;
  return Math.round((valor / por) * 100) / 100;
}

export function resumirImpulsionamentos(
  linhas: LinhaImpulsionamento[],
  leads: LeadDeAnuncio[],
): ResumoImpulsionamento[] {
  return linhas.map((linha) => {
    const meus = leads.filter((l) => doAnuncio(linha, l));
    const visitas = meus.filter(
      (l) => l.visitaAgendadaEm !== null || ETAPAS_DE_VISITA_EM_DIANTE.has(l.etapa),
    ).length;
    return {
      ...linha,
      leads: meus.length,
      visitas,
      fechados: meus.filter((l) => l.etapa === "fechado").length,
      custoPorLead: dividir(linha.valorGasto, meus.length),
      custoPorVisita: dividir(linha.valorGasto, visitas),
    };
  });
}

/** Os totais do topo da tela. Só entra no custo o anúncio com gasto informado. */
export function totaisDosImpulsionamentos(resumos: ResumoImpulsionamento[]) {
  const comGasto = resumos.filter((r) => r.valorGasto !== null);
  const gasto = comGasto.reduce((s, r) => s + (r.valorGasto ?? 0), 0);
  const leadsComGasto = comGasto.reduce((s, r) => s + r.leads, 0);
  return {
    anuncios: resumos.length,
    semGasto: resumos.length - comGasto.length,
    gasto,
    leads: resumos.reduce((s, r) => s + r.leads, 0),
    visitas: resumos.reduce((s, r) => s + r.visitas, 0),
    custoPorLead: dividir(comGasto.length ? gasto : null, leadsComGasto),
  };
}

/**
 * "R$ 50", "50,00", "1.250,90" → número. Vazio → null (apagar o gasto).
 * Texto que não é valor → NaN, para a action recusar com motivo.
 */
export function lerValorEmReais(entrada: string): number | null {
  const limpo = entrada.replace(/r\$/i, "").replace(/\s/g, "");
  if (!limpo) return null;
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : /^\d{1,3}(\.\d{3})+$/.test(limpo)
      ? limpo.replace(/\./g, "") // "1.250" é mil duzentos e cinquenta
      : limpo;
  if (!/^\d+(\.\d{1,2})?$/.test(normalizado)) return Number.NaN;
  return Number(normalizado);
}
