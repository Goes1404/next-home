import { somarMeses, type FluxoDeCaixa, type Movimento } from "./caixa";
import type { ResultadoDoMes } from "./resultado";
import { centavos, formatarReais } from "./venda";

/**
 * Os alertas do financeiro (07/10/2026). Módulo puro e SEM IA: atraso,
 * saldo que fica negativo e mês sem fechar são contas, não opinião, e conta
 * feita por modelo erra justo a vírgula que importa. A IA do financeiro só
 * conversa sobre o que estes números já dizem.
 */

export type Gravidade = "perigo" | "alerta" | "info";

export type Alerta = {
  id: string;
  gravidade: Gravidade;
  titulo: string;
  detalhe: string;
  href: string;
};

export type EntradaDosAlertas = {
  hoje: string;
  /** Pendentes de todas as datas + pagos recentes (os do Caixa). */
  movimentos: Movimento[];
  fluxo: FluxoDeCaixa;
  /** Meses que terminaram, do mais antigo ao mais novo (até 4). */
  resultados: ResultadoDoMes[];
  /** "aaaa-mm" dos meses fechados. */
  mesesFechados: string[];
  semNota: { quantidade: number; valor: number };
  fiscalConferido: boolean;
};

const ORDEM: Record<Gravidade, number> = { perigo: 0, alerta: 1, info: 2 };
const soma = (ms: Movimento[]) => centavos(ms.reduce((s, m) => s + m.valor, 0));
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const nomeMes = (mes: string) => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;

/** Despesa do mês que passou acima disto da média dos anteriores vira alerta. */
export const DESPESA_ACIMA_DA_MEDIA = 1.3;
/** Mês anterior aberto só cobra depois deste dia: dá tempo de lançar tudo. */
export const DIA_PARA_FECHAR = 10;

export function alertasDoFinanceiro(e: EntradaDosAlertas): Alerta[] {
  const alertas: Alerta[] = [];
  const pendentes = e.movimentos.filter((m) => !m.pagoEm);

  if (e.fluxo.ficaNegativoEm) {
    alertas.push({
      id: "saldo_negativo",
      gravidade: "perigo",
      titulo: `O saldo fica negativo em ${dataBr(e.fluxo.ficaNegativoEm)}`,
      detalhe:
        e.fluxo.menorSaldo !== null
          ? `Pela projeção do caixa, o ponto mais baixo é ${formatarReais(e.fluxo.menorSaldo)}. Antecipe uma comissão ou adie uma conta.`
          : "Pela projeção do caixa. Antecipe uma comissão ou adie uma conta.",
      href: "/corretor/financeiro/caixa",
    });
  }

  const comissoesAtrasadas = pendentes.filter((m) => m.origem === "comissao" && m.vencimento !== null && m.vencimento < e.hoje);
  if (comissoesAtrasadas.length > 0) {
    alertas.push({
      id: "comissao_atrasada",
      gravidade: "perigo",
      titulo: `${plural(comissoesAtrasadas.length, "comissão atrasada", "comissões atrasadas")}: ${formatarReais(soma(comissoesAtrasadas))}`,
      detalhe: `A data prevista passou e o pagamento não foi marcado. A mais antiga: ${comissoesAtrasadas
        .sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""))[0]
        .descricao}. Cobre a construtora ou marque como recebida.`,
      href: "/corretor/financeiro",
    });
  }

  const contasVencidas = pendentes.filter((m) => m.origem === "lancamento" && m.tipo === "saida" && m.vencimento !== null && m.vencimento < e.hoje);
  if (contasVencidas.length > 0) {
    alertas.push({
      id: "conta_vencida",
      gravidade: "perigo",
      titulo: `${plural(contasVencidas.length, "conta vencida", "contas vencidas")}: ${formatarReais(soma(contasVencidas))}`,
      detalhe: "Pague ou, se já pagou, marque como paga no Caixa para a projeção não contar duas vezes.",
      href: "/corretor/financeiro/caixa",
    });
  }

  const repasses = pendentes.filter((m) => m.origem === "repasse" && m.vencimento !== null && m.vencimento <= e.hoje);
  if (repasses.length > 0) {
    alertas.push({
      id: "repasse_pendente",
      gravidade: "alerta",
      titulo: `${plural(repasses.length, "repasse a pagar", "repasses a pagar")}: ${formatarReais(soma(repasses))}`,
      detalhe: "A comissão já entrou e a parte do corretor ainda não foi marcada como paga.",
      href: "/corretor/financeiro",
    });
  }

  const semData = pendentes.filter((m) => m.origem === "comissao" && m.vencimento === null);
  if (semData.length > 0) {
    alertas.push({
      id: "comissao_sem_data",
      gravidade: "alerta",
      titulo: `${plural(semData.length, "comissão sem data prevista", "comissões sem data prevista")}: ${formatarReais(soma(semData))}`,
      detalhe: "Fica fora da projeção do caixa até ganhar uma data. Pergunte à construtora quando paga.",
      href: "/corretor/financeiro/caixa",
    });
  }

  if (e.semNota.quantidade > 0) {
    alertas.push({
      id: "sem_nota",
      gravidade: "alerta",
      titulo: `${plural(e.semNota.quantidade, "comissão sem nota fiscal", "comissões sem nota fiscal")}: ${formatarReais(e.semNota.valor)}`,
      detalhe: "O dinheiro entrou e a NFS-e não foi registrada. Emita no portal da prefeitura e anote o número.",
      href: "/corretor/financeiro/fiscal",
    });
  }

  const mesPassado = somarMeses(`${e.hoje.slice(0, 7)}-01`, -1).slice(0, 7);
  if (Number(e.hoje.slice(8, 10)) >= DIA_PARA_FECHAR && !e.mesesFechados.includes(mesPassado)) {
    alertas.push({
      id: "mes_aberto",
      gravidade: "alerta",
      titulo: `${nomeMes(mesPassado)} ainda não foi fechado`,
      detalhe: "Confira o que foi pago e recebido e feche o mês para o contador receber a planilha.",
      href: "/corretor/financeiro/contador",
    });
  }

  const ultimo = e.resultados[e.resultados.length - 1];
  const anteriores = e.resultados.slice(0, -1).filter((r) => r.temMovimento);
  if (ultimo && ultimo.mes === mesPassado && anteriores.length >= 2) {
    const media = anteriores.reduce((s, r) => s + r.totalDespesas, 0) / anteriores.length;
    if (media > 0 && ultimo.totalDespesas > media * DESPESA_ACIMA_DA_MEDIA) {
      const maior = ultimo.despesas[0];
      alertas.push({
        id: "despesa_acima",
        gravidade: "info",
        titulo: `As despesas de ${nomeMes(mesPassado)} passaram da média: ${formatarReais(ultimo.totalDespesas)}`,
        detalhe: `A média dos meses anteriores é ${formatarReais(centavos(media))}.${maior ? ` O maior grupo foi ${maior.rotulo}, com ${formatarReais(maior.valor)}.` : ""}`,
        href: `/corretor/financeiro/resultado?mes=${mesPassado}`,
      });
    }
  }

  if (!e.fiscalConferido) {
    alertas.push({
      id: "fiscal_nao_conferido",
      gravidade: "info",
      titulo: "As alíquotas do fiscal ainda não foram conferidas",
      detalhe: "Os impostos estimados usam um padrão. Confira regime e alíquotas com o contador.",
      href: "/corretor/financeiro/fiscal",
    });
  }

  return alertas.sort((a, b) => ORDEM[a.gravidade] - ORDEM[b.gravidade]);
}
