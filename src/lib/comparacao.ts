import { areaM2, precoAPartirDe } from "@/lib/format";
import { unidadesRestantes } from "@/lib/imoveis/unidades";
import { STATUS_LABEL, type Empreendimento } from "@/lib/types";

/** Faixa "2 a 3" sem inventar o que não existe: dois valores são listados. */
function faixa(valores: number[], sufixo: string): string {
  const u = [...new Set(valores.filter((v) => v > 0))].sort((a, b) => a - b);
  if (u.length === 0) return "—";
  if (u.length <= 2) return `${u.join(" e ")}${sufixo}`;
  return `${u[0]} a ${u[u.length - 1]}${sufixo}`;
}

/**
 * As linhas da comparação, puras. O que falta no cadastro vira "—", nunca
 * um número de cabeça.
 */
export function linhasDaComparacao(imoveis: Empreendimento[]): { rotulo: string; valores: string[] }[] {
  const areas = (e: Empreendimento) => e.tipologias.map((t) => t.areaPrivativa ?? 0).filter((a) => a > 0);
  return [
    { rotulo: "Preço", valores: imoveis.map((e) => precoAPartirDe(e.precoAPartir)) },
    { rotulo: "Estágio", valores: imoveis.map((e) => STATUS_LABEL[e.status]) },
    { rotulo: "Onde", valores: imoveis.map((e) => `${e.bairro}, ${e.cidade}`) },
    { rotulo: "Dormitórios", valores: imoveis.map((e) => faixa(e.tipologias.map((t) => t.dormitorios), " dorms")) },
    { rotulo: "Suítes", valores: imoveis.map((e) => faixa(e.tipologias.map((t) => t.suites), "")) },
    { rotulo: "Vagas", valores: imoveis.map((e) => faixa(e.tipologias.map((t) => t.vagas), "")) },
    {
      rotulo: "Área",
      valores: imoveis.map((e) => {
        const a = areas(e);
        return a.length ? `${areaM2(Math.min(...a))}${a.length > 1 ? ` a ${areaM2(Math.max(...a))}` : ""}` : "—";
      }),
    },
    { rotulo: "Entrega", valores: imoveis.map((e) => e.entregaPrevista ?? "—") },
    { rotulo: "Lazer", valores: imoveis.map((e) => (e.lazer.length ? `${e.lazer.length} itens` : "—")) },
    {
      rotulo: "Unidades",
      valores: imoveis.map((e) => {
        const n = unidadesRestantes(e.tipologias);
        return n == null ? "—" : n === 0 ? "Esgotado" : `Restam ${n}`;
      }),
    },
  ];
}
