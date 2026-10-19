import { centavos, type StatusVenda } from "./venda";
import { mesAntes, NOMES_MES } from "./painelDeVendas";

/**
 * Os gráficos do Extrato (07/10/2026), em função pura. A tela de Vendas
 * responde "quanto vendi"; esta responde "quanto entrou e quando entra o
 * resto" — sempre o REPASSE do corretor, nunca o VGV.
 */

export type VendaDoGrafico = {
  status: StatusVenda;
  comissaoValor: number;
  comissaoRecebidaEm: string | null;
  comissaoPrevistaEm: string | null;
  participantes: { corretorId: string; repasseValor: number; repassePagoEm: string | null }[];
};

export type MesRecebido = { mes: string; rotulo: string; valor: number };

/**
 * O repasse pago a cada mês nos últimos `meses`, com os meses vazios em
 * zero: coluna que falta faz o gráfico mentir sobre o ritmo.
 */
export function recebidoPorMes(
  corretorId: string,
  vendas: VendaDoGrafico[],
  hoje: string,
  meses = 6,
): MesRecebido[] {
  const porMes = new Map<string, number>();
  for (const v of vendas) {
    for (const p of v.participantes) {
      if (p.corretorId !== corretorId || !p.repassePagoEm) continue;
      const mes = p.repassePagoEm.slice(0, 7);
      porMes.set(mes, (porMes.get(mes) ?? 0) + p.repasseValor);
    }
  }
  const serie: MesRecebido[] = [];
  for (let d = meses - 1; d >= 0; d--) {
    const mes = mesAntes(hoje, d);
    serie.push({ mes, rotulo: NOMES_MES[Number(mes.slice(5, 7)) - 1], valor: centavos(porMes.get(mes) ?? 0) });
  }
  return serie;
}

export type FaixaDeEntrada = {
  chave: string;
  rotulo: string;
  valor: number;
  /** liberado = pode sair hoje; atrasado = previsão vencida; futuro; sem_data. */
  tipo: "liberado" | "atrasado" | "futuro" | "sem_data";
};

/**
 * Quando entra o que falta. O que a construtora já pagou sai "agora"; o
 * resto vai para o mês da previsão (0166). Previsão vencida sem pagamento é
 * faixa própria — é a que pede cobrança — e venda sem previsão também,
 * porque inventar um mês para ela seria a tela prometendo uma data.
 *
 * `corretorId` null = a imobiliária (gestor): a comissão inteira da venda,
 * que só tem dois estados (recebida ou não), então "liberado" fica de fora.
 */
export function quandoEntra(
  corretorId: string | null,
  vendas: VendaDoGrafico[],
  hoje: string,
  mesesAFrente = 3,
): FaixaDeEntrada[] {
  let liberado = 0;
  let atrasado = 0;
  let semData = 0;
  let depois = 0;
  const futuro = new Map<string, number>();
  const mesHoje = hoje.slice(0, 7);
  const ultimoMes = mesAntes(hoje, -(mesesAFrente - 1));

  const somarPorPrevisao = (valor: number, prevista: string | null) => {
    if (!prevista) semData += valor;
    else if (prevista < hoje) atrasado += valor;
    else if (prevista.slice(0, 7) > ultimoMes) depois += valor;
    else futuro.set(prevista.slice(0, 7), (futuro.get(prevista.slice(0, 7)) ?? 0) + valor);
  };

  for (const v of vendas) {
    if (v.status !== "ativa") continue;
    if (corretorId === null) {
      if (!v.comissaoRecebidaEm) somarPorPrevisao(v.comissaoValor, v.comissaoPrevistaEm);
      continue;
    }
    for (const p of v.participantes) {
      if (p.corretorId !== corretorId || p.repassePagoEm) continue;
      if (v.comissaoRecebidaEm) liberado += p.repasseValor;
      else somarPorPrevisao(p.repasseValor, v.comissaoPrevistaEm);
    }
  }

  const faixas: FaixaDeEntrada[] = [];
  if (liberado > 0) faixas.push({ chave: "liberado", rotulo: "Liberado agora", valor: centavos(liberado), tipo: "liberado" });
  if (atrasado > 0) faixas.push({ chave: "atrasado", rotulo: "Previsão vencida", valor: centavos(atrasado), tipo: "atrasado" });
  for (let d = 0; d < mesesAFrente; d++) {
    const mes = mesAntes(hoje, -d);
    const valor = futuro.get(mes) ?? 0;
    if (valor > 0) {
      const nome = NOMES_MES[Number(mes.slice(5, 7)) - 1];
      faixas.push({ chave: mes, rotulo: mes === mesHoje ? `Ainda em ${nome}` : `Em ${nome}`, valor: centavos(valor), tipo: "futuro" });
    }
  }
  if (depois > 0) faixas.push({ chave: "depois", rotulo: "Mais adiante", valor: centavos(depois), tipo: "futuro" });
  if (semData > 0) faixas.push({ chave: "sem_data", rotulo: "Sem previsão", valor: centavos(semData), tipo: "sem_data" });
  return faixas;
}
