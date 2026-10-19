import { entregaPrevista } from "@/lib/format";
import { STATUS_LABEL, type Empreendimento, type Tipologia } from "@/lib/types";
import type { Celula, Coluna, Planilha } from "./xlsxEscrita";

/**
 * O catálogo como uma tabela só, uma linha por imóvel — o botão "Exportar
 * Excel" da tela de Imóveis.
 *
 * Função pura: recebe o catálogo e a contagem de leads já prontos, para a
 * conta ser testada sem banco. Duas regras herdadas da página do imóvel:
 *
 *   - zero em banheiro ou vaga é AUSÊNCIA, não valor — "0 vaga" numa
 *     planilha que vai para outra pessoa vira afirmação;
 *   - valor e leads saem como NÚMERO, não texto, para quem recebe poder
 *     somar, ordenar e filtrar sem reformatar.
 */

export const COLUNAS_DO_CATALOGO: Coluna[] = [
  { titulo: "Nome", largura: 32 },
  { titulo: "Situação", largura: 12 },
  { titulo: "Estágio", largura: 18 },
  { titulo: "Prazo de entrega", largura: 18 },
  { titulo: "Cidade", largura: 18 },
  { titulo: "Bairro", largura: 24 },
  { titulo: "Endereço", largura: 40, quebra: true },
  { titulo: "Localização (mapa)", largura: 30 },
  { titulo: "Valor a partir de (R$)", largura: 20 },
  { titulo: "Leads", largura: 8 },
  { titulo: "Construtora", largura: 22 },
  { titulo: "Metragens", largura: 16 },
  { titulo: "Plantas", largura: 48, quebra: true },
  { titulo: "Descrição", largura: 80, quebra: true },
];

function plural(n: number, um: string, varios: string): string {
  return `${n} ${n === 1 ? um : varios}`;
}

/** "55 m² · 2 dorm · 1 suíte · 2 banh · 1 vaga" — só o que está cadastrado. */
export function descreverPlanta(t: Tipologia): string {
  const partes: string[] = [];
  partes.push(t.areaPrivativa ? `${formatarArea(t.areaPrivativa)} m²` : "área não informada");
  if (t.dormitorios > 0) partes.push(`${t.dormitorios} dorm`);
  if (t.suites > 0) partes.push(plural(t.suites, "suíte", "suítes"));
  if (t.banheiros > 0) partes.push(`${t.banheiros} banh`);
  if (t.vagas > 0) partes.push(plural(t.vagas, "vaga", "vagas"));
  return partes.join(" · ");
}

function formatarArea(area: number): string {
  return Number.isInteger(area) ? String(area) : area.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
}

/** "55 a 78 m²", ou "62 m²" quando só há uma metragem. */
export function faixaDeMetragens(tipologias: Tipologia[]): string | null {
  const areas = tipologias.map((t) => t.areaPrivativa).filter((a): a is number => !!a && a > 0);
  if (areas.length === 0) return null;
  const menor = Math.min(...areas);
  const maior = Math.max(...areas);
  return menor === maior ? `${formatarArea(menor)} m²` : `${formatarArea(menor)} a ${formatarArea(maior)} m²`;
}

function linkDoMapa(i: Empreendimento): string | null {
  if (i.lat == null || i.lng == null) return null;
  return `https://www.google.com/maps?q=${i.lat},${i.lng}`;
}

export function linhaDoImovel(i: Empreendimento, leads: number): Celula[] {
  const plantas = [...i.tipologias]
    .sort((a, b) => (a.areaPrivativa ?? Infinity) - (b.areaPrivativa ?? Infinity))
    .map(descreverPlanta)
    .join("\n");

  return [
    i.nome,
    i.publicado === false ? "Rascunho" : "Publicado",
    STATUS_LABEL[i.status] ?? i.status,
    entregaPrevista(i.entregaPrevista),
    i.cidade || null,
    i.bairro || null,
    i.endereco || null,
    linkDoMapa(i),
    i.precoAPartir ?? null,
    leads,
    i.construtora,
    faixaDeMetragens(i.tipologias),
    plantas || null,
    i.descricao || null,
  ];
}

export function planilhaDoCatalogo(imoveis: Empreendimento[], leadsPorImovel: Map<string, number>): Planilha {
  return {
    aba: "Catálogo",
    colunas: COLUNAS_DO_CATALOGO,
    linhas: imoveis.map((i) => linhaDoImovel(i, (i.id && leadsPorImovel.get(i.id)) || 0)),
  };
}

/**
 * Um lead conta UMA vez: pelo imóvel de interesse ou, sem ele, pelo do
 * cadastro. É a mesma regra de `procuraPorImovel` (gráfico da mesma tela),
 * para a planilha e o gráfico não discordarem sobre o mesmo imóvel.
 */
export function contarLeadsPorImovel(
  leads: { empreendimento_id: string | null; imovel_interesse_id: string | null }[],
): Map<string, number> {
  const contagem = new Map<string, number>();
  for (const l of leads) {
    const id = l.imovel_interesse_id ?? l.empreendimento_id;
    if (id) contagem.set(id, (contagem.get(id) ?? 0) + 1);
  }
  return contagem;
}
