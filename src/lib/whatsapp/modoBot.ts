import type { ModoBotWhatsapp } from "./types";

/**
 * Decide se o bot pode falar AGORA, segundo o modo escolhido pelo corretor.
 *
 * Existia como enum no banco, botão no painel e tipo em TypeScript — mas sem
 * nenhuma linha de lógica: o webhook só testava `=== "desativado"`, então
 * quem escolhia "noturno e fim de semana" ou "co-piloto" continuava com bot
 * 24/7 sem perceber. Um controle que não controla é pior que controle
 * nenhum, porque o corretor confia nele.
 *
 * A decisão é uma função pura de propósito: o webhook não é lugar de
 * descobrir regra de horário, e regra de horário sem teste é regra que
 * ninguém confere.
 */

export type DecisaoModo = {
  pode: boolean;
  /** Chave curta para log e para a resposta do webhook. */
  motivo:
    | "modo_24_7"
    | "fora_do_expediente"
    | "corretor_ausente"
    | "desativado"
    | "dentro_do_expediente"
    | "corretor_respondendo";
};

/** Expediente comercial, em America/Sao_Paulo — a hora do cliente, não a do servidor. */
export const EXPEDIENTE = { inicioHora: 9, fimHora: 18, fusoHorario: "America/Sao_Paulo" } as const;

/**
 * Janela do co-piloto: o bot só entra se o corretor não falou nos últimos
 * minutos.
 *
 * ATENÇÃO ao que isto NÃO é: não existe agendamento aqui. O nome "3 min"
 * sugere "espere 3 minutos e responda se o humano não responder", e isso
 * exigiria uma fila com execução adiada — o webhook responde na hora e
 * morre. O que dá para garantir sem fila é o inverso, que resolve o mesmo
 * problema na prática: enquanto o corretor está ativo na conversa, o bot
 * fica quieto; passados os 3 minutos de silêncio dele, o bot assume.
 */
export const MINUTOS_COPILOTO = 3;

type Contexto = {
  agora?: Date;
  /** ISO da última mensagem enviada pelo corretor nesta conversa. */
  ultimaFalaCorretorEm?: string | null;
};

/**
 * Hora e dia da semana em um fuso, sem depender do relógio do servidor —
 * que na Vercel roda em UTC e faria "noturno" começar três horas cedo.
 */
function horaLocal(agora: Date, fusoHorario: string): { hora: number; diaSemana: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fusoHorario,
    hour: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(agora);

  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  const sigla = partes.find((p) => p.type === "weekday")?.value ?? "Mon";
  const dias = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return { hora: hora === 24 ? 0 : hora, diaSemana: Math.max(0, dias.indexOf(sigla)) };
}

/** Segunda a sexta, entre o início e o fim do expediente. */
export function dentroDoExpediente(agora: Date): boolean {
  const { hora, diaSemana } = horaLocal(agora, EXPEDIENTE.fusoHorario);
  const diaUtil = diaSemana >= 1 && diaSemana <= 5;
  return diaUtil && hora >= EXPEDIENTE.inicioHora && hora < EXPEDIENTE.fimHora;
}

export function decidirPorModo(modo: ModoBotWhatsapp, ctx: Contexto = {}): DecisaoModo {
  const agora = ctx.agora ?? new Date();

  switch (modo) {
    case "desativado":
      return { pode: false, motivo: "desativado" };

    case "noturno_e_fds":
      // De dia e em dia útil quem atende é o corretor; a IA cobre o resto,
      // que é justamente quando o lead chega e ninguém está olhando.
      return dentroDoExpediente(agora)
        ? { pode: false, motivo: "dentro_do_expediente" }
        : { pode: true, motivo: "fora_do_expediente" };

    case "co_piloto_3min": {
      if (!ctx.ultimaFalaCorretorEm) return { pode: true, motivo: "corretor_ausente" };

      const silencioMs = agora.getTime() - new Date(ctx.ultimaFalaCorretorEm).getTime();
      // Data inválida vira NaN; não deixar o bot mudo por causa disso.
      if (Number.isNaN(silencioMs)) return { pode: true, motivo: "corretor_ausente" };

      return silencioMs >= MINUTOS_COPILOTO * 60_000
        ? { pode: true, motivo: "corretor_ausente" }
        : { pode: false, motivo: "corretor_respondendo" };
    }

    case "24_7":
    default:
      return { pode: true, motivo: "modo_24_7" };
  }
}

/** Texto curto do modo, para o painel e para a lista de conversas. */
export const ROTULO_MODO: Record<ModoBotWhatsapp, string> = {
  "24_7": "Sempre ativa",
  noturno_e_fds: `Fora do expediente (após ${EXPEDIENTE.fimHora}h, antes das ${EXPEDIENTE.inicioHora}h e fins de semana)`,
  co_piloto_3min: `Co-piloto (entra após ${MINUTOS_COPILOTO} min de silêncio seu)`,
  desativado: "Desligada",
};
