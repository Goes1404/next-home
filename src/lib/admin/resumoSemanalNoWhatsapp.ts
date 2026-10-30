import type { Achado } from "./relatorioSemanal";

/**
 * O resumo da semana no WhatsApp do gestor (0246, 29/10/2026).
 *
 * O relatório semanal (H4, 01/09/2026) só ia por e-mail, e e-mail de
 * segunda de manhã é o que o gestor de imobiliária menos abre. O WhatsApp
 * dele (a conversa "Você", do próprio número, mais a notificação no
 * celular) é o canal que os avisos ao corretor já usam (`avisarCorretor`).
 *
 * Função pura: números medidos entram, texto sai. Curto de propósito — cabe
 * numa tela de celular sem rolar: leads, visitas, vendas, cada um contra a
 * semana anterior; quem está parado; e, se houver, o pior achado do
 * relatório do e-mail (o número fora do ar vem antes de tudo).
 */

export type Comparacao = { semana: number; anterior: number };

export type SemanaDoGrupo = {
  /** "aaaa-mm-dd" do primeiro e do último dia da semana medida (São Paulo). */
  de: string;
  ate: string;
  leads: Comparacao;
  visitas: Comparacao;
  vendas: Comparacao & { vgvSemana: number };
  /** Corretores com leads parados, do mais parado ao menos (sem zeros). */
  parados: { nome: string; quantos: number }[];
};

/** "↑ 4 (8 na anterior)", "↓ 2 (5 na anterior)", "= igual à anterior". */
export function comparar({ semana, anterior }: Comparacao): string {
  const diferenca = semana - anterior;
  if (diferenca === 0) return "igual à anterior";
  return `${diferenca > 0 ? "↑" : "↓"} ${Math.abs(diferenca)} (${anterior} na anterior)`;
}

/** R$ 450 mil, R$ 1,2 mi: VGV de semana não precisa de centavo. */
export function reaisCurto(n: number): string {
  if (n >= 1_000_000) return `R$ ${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (n >= 1_000) return `R$ ${Math.round(n / 1_000).toLocaleString("pt-BR")} mil`;
  return `R$ ${Math.round(n).toLocaleString("pt-BR")}`;
}

const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Quantos parados aparecem por nome; o resto vira "e mais N". */
export const PARADOS_NO_TEXTO = 3;

export function textoDoResumoSemanal(p: {
  nomeDaCasa: string;
  semana: SemanaDoGrupo;
  /** O pior achado do relatório do e-mail (`acharNoticias`), se não for "ok". */
  achado: Achado | null;
  linkDoPainel: string;
}): string {
  const { semana: s } = p;
  const linhas = [
    `*📊 Sua semana na ${p.nomeDaCasa}* (${diaMes(s.de)} a ${diaMes(s.ate)})`,
    "",
    `• Leads novos: *${s.leads.semana}* · ${comparar(s.leads)}`,
    `• Visitas feitas: *${s.visitas.semana}* · ${comparar(s.visitas)}`,
    `• Vendas: *${s.vendas.semana}*${s.vendas.vgvSemana > 0 ? ` (${reaisCurto(s.vendas.vgvSemana)})` : ""} · ${comparar(s.vendas)}`,
  ];

  if (s.parados.length === 0) {
    linhas.push("• Ninguém com lead parado há mais de 48h. 👏");
  } else {
    const nomes = s.parados
      .slice(0, PARADOS_NO_TEXTO)
      .map((c) => `${c.nome} (${c.quantos})`)
      .join(", ");
    const resto = s.parados.length - PARADOS_NO_TEXTO;
    linhas.push(`• Leads parados há 48h+: ${nomes}${resto > 0 ? ` e mais ${resto}` : ""}`);
  }

  if (p.achado && p.achado.gravidade !== "ok") {
    linhas.push("", `${p.achado.gravidade === "critico" ? "⚠️" : "👀"} ${p.achado.titulo}`);
  }

  linhas.push("", `Painel: ${p.linkDoPainel}`);
  return linhas.join("\n");
}

/**
 * Os limites da semana medida, em São Paulo: os 7 dias que terminam ONTEM
 * (na segunda de manhã, de segunda a domingo) e os 7 antes deles. ISO com
 * o fuso, para filtrar `timestamptz`; e as datas, para `date` (vendas).
 */
export function semanasDoResumo(hoje: string): {
  semana: { desde: string; ate: string; de: string; ateDia: string };
  anterior: { desde: string; ate: string };
} {
  const dia = (deslocamento: number) => {
    const d = new Date(`${hoje}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + deslocamento);
    return d.toISOString().slice(0, 10);
  };
  const noFuso = (d: string) => `${d}T00:00:00-03:00`;
  return {
    semana: { desde: noFuso(dia(-7)), ate: noFuso(hoje), de: dia(-7), ateDia: dia(-1) },
    anterior: { desde: noFuso(dia(-14)), ate: noFuso(dia(-7)) },
  };
}

/** Já mandou nesta semana? Claim de 6 dias: o pg_cron pode repetir o POST. */
export function jaMandouNaSemana(ultimoEnvio: string | null | undefined, agora: Date): boolean {
  if (!ultimoEnvio) return false;
  const t = Date.parse(ultimoEnvio);
  return Number.isFinite(t) && agora.getTime() - t < 6 * 86_400_000;
}
