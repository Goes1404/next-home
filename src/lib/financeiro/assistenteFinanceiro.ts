import { estaPermitido, numerosDaFrase } from "@/lib/consultor/guardrails";
import type { Alerta } from "./alertas";
import type { FluxoDeCaixa, Movimento } from "./caixa";
import type { LinhaDeImposto } from "./fiscal";
import type { ResultadoDoMes } from "./resultado";
import { centavos, formatarReais } from "./venda";

/**
 * O assistente financeiro do dono (07/10/2026). Módulo puro: monta o bloco
 * de números que vai no prompt e corta da resposta a frase com valor que não
 * está nele.
 *
 * A IA não faz conta de caixa: ela LÊ as contas que o sistema já fez (Caixa,
 * Resultado, Fiscal) e responde em português. Toda cifra que ela cita tem de
 * estar no bloco ou na pergunta; o resto sai, frase inteira, como no
 * consultor. Conta de cabeça de modelo erra a vírgula, e no dinheiro da
 * empresa a vírgula é a parte que importa.
 */

export const VERSAO_DO_PROMPT_FINANCEIRO = "fin-1";

export const DESVIO_DE_VALOR = "Esse valor eu não tenho conferido aqui; confira em Caixa ou em Resultado do mês.";

export type DadosDoAssistente = {
  hoje: string;
  fluxo: FluxoDeCaixa;
  alertas: Alerta[];
  /** Do mais antigo ao mais novo; o último pode ser o mês corrente. */
  resultados: ResultadoDoMes[];
  /** Pendentes dos próximos 30 dias e atrasados. */
  proximos: Movimento[];
  impostosDoMes: LinhaDeImposto[];
  regime: string;
  mesesFechados: string[];
};

const r = (n: number) => formatarReais(n);
const mesBr = (mes: string) => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;

export function montarBlocoFinanceiro(d: DadosDoAssistente): { texto: string; numeros: number[] } {
  const numeros: number[] = [];
  const n = (v: number | null | undefined) => {
    if (typeof v === "number" && Number.isFinite(v)) numeros.push(Math.abs(v));
    return v;
  };
  const linhas: string[] = [`Hoje é ${d.hoje}.`];

  const f = d.fluxo;
  if (f.saldoHoje !== null) {
    linhas.push(`Saldo em conta hoje: ${r(n(f.saldoHoje) as number)}.`);
  } else {
    linhas.push("O dono ainda não informou o saldo da conta: não há saldo de hoje nem projeção de saldo.");
  }
  linhas.push(`A receber nos próximos 30 dias: ${r(n(f.aReceber30) as number)}. A pagar nos próximos 30 dias: ${r(n(f.aPagar30) as number)}.`);
  linhas.push(`Neste mês até hoje entrou ${r(n(f.entrouNoMes) as number)} e saiu ${r(n(f.saiuNoMes) as number)}.`);
  if (f.menorSaldo !== null) linhas.push(`Menor saldo projetado nas próximas 13 semanas: ${r(n(f.menorSaldo) as number)}.`);
  if (f.ficaNegativoEm) linhas.push(`O saldo projetado fica negativo em ${f.ficaNegativoEm}.`);

  const semanas = f.semanas.filter((s) => s.saldoFinal !== null).slice(0, 13);
  if (semanas.length) {
    linhas.push("Saldo projetado no fim de cada semana:");
    for (const s of semanas) linhas.push(`- até ${s.fim}: entra ${r(n(s.entradas) as number)}, sai ${r(n(s.saidas) as number)}, saldo ${r(n(s.saldoFinal) as number)}`);
  }

  if (d.proximos.length) {
    linhas.push("Contas e comissões pendentes (atrasadas e próximos 30 dias):");
    for (const m of d.proximos.slice(0, 20)) {
      const quando = m.vencimento ? (m.vencimento < d.hoje ? `atrasada desde ${m.vencimento}` : `vence ${m.vencimento}`) : "sem data";
      linhas.push(`- ${m.tipo === "entrada" ? "entra" : "sai"} ${r(n(m.valor) as number)} · ${m.descricao}${m.detalhe ? ` (${m.detalhe})` : ""} · ${quando}`);
    }
  }

  if (d.resultados.length) {
    linhas.push("Resultado mês a mês (regime de caixa: o que foi de fato pago e recebido):");
    for (const x of d.resultados) {
      const corrente = x.mes === d.hoje.slice(0, 7) ? " (mês em andamento)" : "";
      linhas.push(
        `- ${mesBr(x.mes)}${corrente}: receita de corretagem ${r(n(x.receitaCorretagem) as number)}, repasses ${r(n(x.repasses) as number)}, impostos pagos ${r(n(x.impostos) as number)}, outras receitas ${r(n(x.outrasReceitas) as number)}, despesas ${r(n(x.totalDespesas) as number)}, resultado ${r(n(x.resultado) as number)}`,
      );
      for (const dsp of x.despesas.slice(0, 4)) linhas.push(`  · ${dsp.rotulo}: ${r(n(dsp.valor) as number)}`);
    }
  }

  if (d.impostosDoMes.length) {
    const total = centavos(d.impostosDoMes.reduce((s, l) => s + l.valor, 0));
    linhas.push(`Impostos ESTIMADOS do mês (${d.regime}): ${r(n(total) as number)} — ${d.impostosDoMes.map((l) => `${l.nome} ${r(n(l.valor) as number)}`).join(", ")}.`);
  }

  linhas.push(d.mesesFechados.length ? `Meses fechados para o contador: ${d.mesesFechados.map(mesBr).join(", ")}.` : "Nenhum mês foi fechado para o contador ainda.");

  if (d.alertas.length) {
    linhas.push("Alertas de hoje:");
    for (const a of d.alertas) {
      linhas.push(`- ${a.titulo}. ${a.detalhe}`);
      for (const v of numerosDaFrase(`${a.titulo} ${a.detalhe}`)) n(v);
    }
  }

  return { texto: linhas.join("\n"), numeros };
}

export function promptDoAssistente(bloco: string, historico: { papel: "dono" | "ia"; texto: string }[], pergunta: string): string {
  const conversa = historico
    .slice(-8)
    .map((m) => `${m.papel === "dono" ? "Dono" : "Assistente"}: ${m.texto}`)
    .join("\n");
  return `Você é o assistente financeiro do dono de uma imobiliária. Responda em português do Brasil, direto, em até 6 frases curtas.

REGRAS
1. Use SOMENTE os números do bloco NÚMEROS ou os que o dono escreveu na pergunta. Não some, não subtraia, não estime valor novo: se a resposta pede uma conta que não está no bloco, diga qual tela mostra (Caixa, Resultado do mês, Fiscal, Contador, Vendas).
2. Valores em reais no formato R$ 1.234,56.
3. Se o dado não existe (por exemplo, saldo não informado), diga isso e o que o dono precisa fazer.
4. Impostos do bloco são ESTIMATIVAS; quem apura é o contador. Não dê conselho tributário além disso.
5. Quando houver um alerta ligado à pergunta, mencione-o.
6. Não use markdown, lista nem títulos.

NÚMEROS
${bloco}

${conversa ? `CONVERSA ATÉ AQUI\n${conversa}\n\n` : ""}PERGUNTA DO DONO
${pergunta}

Responda em JSON: {"resposta": "..."}`;
}

/** Corta a frase inteira que cita valor fora do bloco e da pergunta. */
export function cortarValorInventado(texto: string, permitidos: number[]): { texto: string; cortou: boolean } {
  const frases = texto.split(/(?<=[.!?])\s+/);
  let cortou = false;
  const saida = frases.filter((frase) => {
    const temDinheiro = /R\$|reais|\bmil\b|%/i.test(frase);
    if (!temDinheiro) return true;
    const temPercentual = /%/.test(frase);
    // Data não é valor: "vence 2026-10-15" ou "em 15/10/2026" não podem cair na régua.
    const semDatas = frase.replace(/\d{4}-\d{2}-\d{2}/g, " ").replace(/\d{1,2}\/(?:\d{1,2}\/)?\d{2,4}|\d{1,2}\/\d{1,2}/g, " ");
    const suspeitos = numerosDaFrase(semDatas).filter((v) => temPercentual || v >= 100);
    const ok = suspeitos.every((v) => estaPermitido(v, permitidos));
    if (!ok) cortou = true;
    return ok;
  });
  if (cortou) saida.push(DESVIO_DE_VALOR);
  return { texto: saida.join(" ").replace(/[ \t]+/g, " ").trim(), cortou };
}

export const SUGESTOES_FINANCEIRO = [
  "Quanto vou ter em caixa no fim do mês?",
  "Quais comissões estão atrasadas?",
  "Como foi o resultado do mês passado?",
  "Onde mais gastei nos últimos meses?",
] as const;
