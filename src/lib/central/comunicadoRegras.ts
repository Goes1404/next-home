import { dentroDaJanela } from "@/lib/whatsapp/antiBan";
import { PRIMEIRO_CONTATO_POR_DIA } from "@/lib/whatsapp/primeiroContato";

/**
 * As regras do comunicado pelo número central (0260), puras: o tique, a
 * tela da plataforma e os testes usam as mesmas.
 *
 * O comunicado é mensagem que NÓS puxamos, do número central, inclusive
 * para quem nunca falou com ele — a classe de tráfego que derruba número.
 * Por isso:
 * - UMA mensagem por tique (o tique dos follow-ups roda a cada 5 min), e
 *   nunca duas com menos de 4 min entre elas, mesmo com tique repetido;
 * - só das 9h às 20h59, de segunda a sábado (`dentroDaJanela`);
 * - no máximo 10 por dia, somando todos os comunicados (a régua do
 *   primeiro contato, `PRIMEIRO_CONTATO_POR_DIA`);
 * - o começo varia de um corretor para o outro (texto repetido é sinal de
 *   spam), e o nome é o de cada um.
 */

export const COMUNICADOS_POR_DIA = PRIMEIRO_CONTATO_POR_DIA;
export const INTERVALO_MINIMO_MS = 4 * 60 * 1000;
export const FALHAS_SEGUIDAS_PARA_PAUSAR = 3;
export const TEXTO_MINIMO = 10;
export const TEXTO_MAXIMO = 1500;

export type MotivoDeEspera = "central_fora" | "fora_do_horario" | "teto_do_dia" | "intervalo";

export type DecisaoDoEnvio = { pode: true } | { pode: false; motivo: MotivoDeEspera };

export function decidirEnvio(p: {
  agora: Date;
  centralConectado: boolean;
  enviadosHoje: number;
  ultimoEnvioEm: Date | null;
}): DecisaoDoEnvio {
  if (!p.centralConectado) return { pode: false, motivo: "central_fora" };
  if (!dentroDaJanela(p.agora)) return { pode: false, motivo: "fora_do_horario" };
  if (p.enviadosHoje >= COMUNICADOS_POR_DIA) return { pode: false, motivo: "teto_do_dia" };
  if (p.ultimoEnvioEm && p.agora.getTime() - p.ultimoEnvioEm.getTime() < INTERVALO_MINIMO_MS) {
    return { pode: false, motivo: "intervalo" };
  }
  return { pode: true };
}

/** Meia-noite de hoje em São Paulo (UTC−3, sem horário de verão), em UTC. */
export function inicioDoDiaEmSaoPaulo(agora: Date): Date {
  const sp = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 3, 0, 0));
}

export function primeiroNome(nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? "";
  if (!primeiro) return "";
  return primeiro.charAt(0).toLocaleUpperCase("pt-BR") + primeiro.slice(1).toLocaleLowerCase("pt-BR");
}

const SAUDACOES = ["Oi", "Olá", "Oii", "Opa"];

/**
 * O texto de um corretor: `{nome}` vira o primeiro nome, e o "Oi" do começo
 * (se houver) se alterna pela ordem na fila, para nenhuma mensagem sair
 * igual à anterior.
 */
export function textoDoCorretor(modelo: string, nome: string, ordem: number): string {
  const comNome = modelo.replaceAll("{nome}", primeiroNome(nome) || "tudo bem");
  const saudacao = SAUDACOES[Math.abs(ordem) % SAUDACOES.length];
  return comNome.replace(/^Oi\b/, saudacao).trim();
}

export function validarTexto(texto: unknown): { ok: true; texto: string } | { ok: false; erro: string } {
  if (typeof texto !== "string") return { ok: false, erro: "Escreva a mensagem." };
  const limpo = texto.trim();
  if (limpo.length < TEXTO_MINIMO) return { ok: false, erro: "A mensagem está curta demais." };
  if (limpo.length > TEXTO_MAXIMO) return { ok: false, erro: `A mensagem passa de ${TEXTO_MAXIMO} caracteres.` };
  return { ok: true, texto: limpo };
}

/** Quanto tempo a fila leva, no melhor caso: 1 a cada 5 min, 10 por dia. */
export function previsaoDaFila(pessoas: number): string {
  if (pessoas <= 0) return "Ninguém para receber.";
  const dias = Math.ceil(pessoas / COMUNICADOS_POR_DIA);
  if (dias === 1) {
    const minutos = pessoas * 5;
    return minutos < 60 ? `cerca de ${minutos} minutos, no horário comercial` : `cerca de ${Math.round(minutos / 6) / 10} horas, no horário comercial`;
  }
  return `${dias} dias úteis (até 10 por dia)`;
}

export const ROTULO_DO_MOTIVO: Record<MotivoDeEspera, string> = {
  central_fora: "o número central está desconectado",
  fora_do_horario: "fora do horário (9h às 21h, de segunda a sábado)",
  teto_do_dia: "já saíram as 10 de hoje",
  intervalo: "esperando o intervalo entre mensagens",
};
