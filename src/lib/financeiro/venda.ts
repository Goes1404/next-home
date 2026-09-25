/**
 * As contas de uma venda — puras, sem banco, para a tela e a action usarem a
 * MESMA régua (duas contas do mesmo dinheiro divergem no primeiro ajuste).
 *
 * Duas coisas que valem para todo o módulo:
 *  - Dinheiro sai sempre arredondado a centavo, e o % e o R$ são GRAVADOS
 *    juntos: recalcular um a partir do outro depois dá centavo diferente.
 *  - A comissão muda por venda (decisão de 25/09/2026), então nada aqui
 *    assume taxa fixa: o corretor digita % OU R$ e a outra metade é derivada.
 */

export type ModoValor = "percentual" | "valor";

/** O que o corretor digitou para um valor que pode vir em % ou em R$. */
export type Digitado = { modo: ModoValor; numero: number };

export type ParDeValor = { percentual: number | null; valor: number };

export type StatusVenda = "ativa" | "distratada";

export const STATUS_VENDA_LABEL: Record<StatusVenda, string> = {
  ativa: "Ativa",
  distratada: "Distratada",
};

export const centavos = (n: number): number => Math.round(n * 100) / 100;
const milesimos = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Lê um valor em reais digitado à brasileira: "1.250.000", "1.250.000,50",
 * "450000", "R$ 3.200,00". Devolve null para o que não é número.
 *
 * Não usa `normalizarPrecoBRL` (preços): aquele arredonda para real inteiro
 * e aceita "450 mil"; aqui comissão tem centavo e o campo é numérico.
 */
export function lerReais(texto: string): number | null {
  const limpo = texto.replace(/r\$/i, "").replace(/\s/g, "");
  if (!limpo) return null;
  let normal: string;
  if (limpo.includes(",")) {
    normal = limpo.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(limpo)) {
    normal = limpo.replace(/\./g, "");
  } else {
    normal = limpo;
  }
  if (!/^\d+(\.\d+)?$/.test(normal)) return null;
  const n = Number(normal);
  return Number.isFinite(n) ? centavos(n) : null;
}

/** Lê "5", "5,5", "5.5%". */
export function lerPercentual(texto: string): number | null {
  const normal = texto.replace("%", "").replace(/\s/g, "").replace(",", ".");
  if (!normal || !/^\d+(\.\d+)?$/.test(normal)) return null;
  const n = Number(normal);
  return Number.isFinite(n) ? milesimos(n) : null;
}

/**
 * De "% ou R$ de uma base" para o par gravado. Serve à comissão (base = valor
 * da venda) e ao repasse (base = comissão).
 */
export function resolverPar(base: number, digitado: Digitado): ParDeValor {
  if (digitado.modo === "percentual") {
    return { percentual: milesimos(digitado.numero), valor: centavos((base * digitado.numero) / 100) };
  }
  const valor = centavos(digitado.numero);
  return { percentual: base > 0 ? milesimos((valor / base) * 100) : null, valor };
}

/**
 * Parte do VGV de cada participante, dividida por igual e somando 100
 * exatos: o resto do arredondamento vai para o primeiro (quem registrou).
 * Três corretores dão 33,334 + 33,333 + 33,333.
 */
export function dividirIgualmente(quantidade: number): number[] {
  if (quantidade <= 0) return [];
  const base = Math.floor((100 / quantidade) * 1000) / 1000;
  const partes = Array.from({ length: quantidade }, () => base);
  partes[0] = milesimos(100 - base * (quantidade - 1));
  return partes;
}

export type ParticipanteDigitado = {
  corretorId: string;
  partePercentual: number;
  repasse: Digitado;
};

export type VendaDigitada = {
  leadId: string | null;
  empreendimentoId: string | null;
  imovelDescricao: string;
  unidade: string;
  dataVenda: string; // yyyy-mm-dd
  valorVenda: number | null;
  comissao: Digitado | null;
  status: StatusVenda;
  distratadaEm: string | null;
  observacao: string;
  participantes: ParticipanteDigitado[];
};

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * O que impede gravar, em português de tela. Lista vazia = pode gravar.
 * A migration repete o essencial (soma 100, valor > 0) como segunda linha de
 * defesa; esta é a primeira, e a única que explica o problema.
 */
export function problemasDaVenda(v: VendaDigitada, hojeIso: string): string[] {
  const erros: string[] = [];
  if (!v.empreendimentoId && !v.imovelDescricao.trim()) erros.push("Escolha o imóvel vendido.");
  if (!DATA.test(v.dataVenda)) erros.push("Informe a data da venda.");
  else if (v.dataVenda > hojeIso) erros.push("A data da venda não pode ser no futuro.");
  if (v.valorVenda === null || v.valorVenda <= 0) erros.push("Informe o valor da venda.");
  if (!v.comissao || !Number.isFinite(v.comissao.numero) || v.comissao.numero < 0) {
    erros.push("Informe a comissão, em % ou em R$.");
  } else if (v.comissao.modo === "percentual" && v.comissao.numero > 100) {
    erros.push("A comissão em % não pode passar de 100.");
  } else if (v.comissao.modo === "valor" && v.valorVenda !== null && v.comissao.numero > v.valorVenda) {
    erros.push("A comissão não pode ser maior que o valor da venda.");
  }
  if (v.status === "distratada" && (!v.distratadaEm || !DATA.test(v.distratadaEm))) {
    erros.push("Informe a data do distrato.");
  }

  if (v.participantes.length === 0) {
    erros.push("A venda precisa de pelo menos um corretor.");
  } else {
    const ids = new Set(v.participantes.map((p) => p.corretorId));
    if (ids.size !== v.participantes.length) erros.push("O mesmo corretor aparece duas vezes na divisão.");
    if (v.participantes.some((p) => !p.corretorId)) erros.push("Escolha o corretor de cada linha da divisão.");
    if (v.participantes.some((p) => !(p.partePercentual > 0))) erros.push("Cada corretor precisa de uma parte maior que zero.");
    const soma = v.participantes.reduce((s, p) => s + p.partePercentual, 0);
    if (Math.abs(soma - 100) > 0.01) {
      erros.push(`As partes da venda somam ${formatarPercentual(soma)}; precisam somar 100%.`);
    }
    const comissao = v.comissao && v.valorVenda ? resolverPar(v.valorVenda, v.comissao).valor : null;
    if (comissao !== null) {
      const repasses = v.participantes.reduce((s, p) => s + resolverPar(comissao, p.repasse).valor, 0);
      if (repasses > comissao + 0.01) erros.push("Os repasses somam mais que a comissão da venda.");
    }
  }
  return erros;
}

/**
 * O VGV que conta para um participante: a parte dele do valor da venda.
 * Venda distratada não conta — é isso que impede o ranking de premiar quem
 * vende muito e perde muito.
 */
export function vgvCreditado(venda: { valorVenda: number; status: StatusVenda }, partePercentual: number): number {
  if (venda.status === "distratada") return 0;
  return centavos((venda.valorVenda * partePercentual) / 100);
}

export function formatarPercentual(n: number): string {
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}%`;
}

export function formatarReais(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2, minimumFractionDigits: 0 });
}

/** A mensagem de erro do banco (`raise exception`) em português de tela. */
export function traduzirErroDoBanco(mensagem: string): string {
  if (mensagem.includes("partes_nao_somam_100")) return "As partes da venda precisam somar 100%.";
  if (mensagem.includes("sem_participantes")) return "A venda precisa de pelo menos um corretor.";
  if (mensagem.includes("venda_nao_editavel")) {
    return "Esta venda não pode mais ser editada por você — a comissão já entrou, ou ela não é sua.";
  }
  if (mensagem.includes("vendas_tem_imovel")) return "Escolha o imóvel vendido.";
  if (mensagem.includes("vendas_distrato_coerente")) return "Informe a data do distrato.";
  return "Não foi possível salvar a venda agora. Tente de novo.";
}

/**
 * O dia de hoje em São Paulo, "aaaa-mm-dd". Em UTC, das 21h à meia-noite de
 * Brasília já é amanhã, e uma venda assinada à noite seria recusada como
 * "data no futuro" no dia seguinte (a armadilha de fuso desta base).
 */
export function hojeEmSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}
