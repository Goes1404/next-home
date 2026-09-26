import type { StatusObra } from "@/lib/types";

/**
 * Portal do comprador (26/09/2026): uma página fixa por cliente com o que
 * ele mais pergunta depois de comprar — "como está a obra?", "já mandei
 * tudo?", "quando pego as chaves?". Esta parte decide os marcos; nada aqui
 * inventa data: sem previsão cadastrada, o marco diz que o corretor avisa.
 */

export type Marco = { titulo: string; detalhe: string; feito: boolean };

const ETAPAS_DEPOIS_DA_DOCUMENTACAO = new Set(["documentacao", "fechado"]);

export function marcosDoComprador(p: {
  etapa: string;
  documentosEnviados: number;
  dataVenda: string | null;
  statusObra: StatusObra | null;
  entregaPrevista: string | null;
  percentualObra: number | null;
}): Marco[] {
  const pronto = p.statusObra === "pronto_para_morar" || (p.percentualObra ?? 0) >= 100;
  const assinado = Boolean(p.dataVenda) || p.etapa === "fechado";
  return [
    {
      titulo: "Documentos",
      detalhe:
        p.documentosEnviados > 0
          ? `${p.documentosEnviados} ${p.documentosEnviados === 1 ? "arquivo recebido" : "arquivos recebidos"}`
          : "Seu corretor vai pedir os documentos por um link",
      feito: p.documentosEnviados > 0 || ETAPAS_DEPOIS_DA_DOCUMENTACAO.has(p.etapa),
    },
    {
      titulo: "Contrato assinado",
      detalhe: p.dataVenda ? `Em ${dataCurta(p.dataVenda)}` : assinado ? "Concluído" : "Depois da aprovação do crédito",
      feito: assinado,
    },
    {
      titulo: "Obra",
      detalhe: pronto
        ? "Concluída"
        : p.percentualObra != null
          ? `${p.percentualObra}% concluída`
          : "Acompanhe as atualizações abaixo",
      feito: pronto,
    },
    {
      titulo: "Entrega das chaves",
      detalhe: p.entregaPrevista ? `Previsão: ${p.entregaPrevista}` : "Seu corretor avisa a data assim que for marcada",
      feito: false,
    },
  ];
}

function dataCurta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

/** O último percentual informado nas atualizações (a lista chega da mais nova para a mais velha). */
export function ultimoPercentual(atualizacoes: { percentual: number | null }[]): number | null {
  return atualizacoes.find((a) => a.percentual != null)?.percentual ?? null;
}
