import {
  AVISO_ANTES_DE_VENCER_DIAS,
  diasParaVencer,
  senhaTrocadaEm,
  senhaVencida,
  vencimentoDaSenha,
} from "@/lib/auth/politicaDeSenha";
import { horaEMinutoEmSP, mesmoDiaEmSP } from "@/lib/notificacoes/relogio";

/**
 * As regras puras da notificação "sua senha vai vencer" (29/10/2026). A
 * validade (90 dias) e a data da última troca (`app_metadata`) são da
 * política de senha (`politicaDeSenha.ts`); aqui só QUANDO avisar.
 */

/**
 * A hora do aviso: das 9h às 9h59 de São Paulo, dentro do horário dos
 * avisos (8h–20h). Uma hora só porque a varredura lê a lista de usuários do
 * Auth inteira; o claim diário faz os 12 tiques da hora valerem um aviso.
 */
export const HORA_DO_AVISO_DE_SENHA = 9;

export function horaDoAvisoDeSenha(agora: Date): boolean {
  return horaEMinutoEmSP(agora).hora === HORA_DO_AVISO_DE_SENHA;
}

export type AvisoDeSenha = { tipo: "vence"; dias: number } | { tipo: "vencida" };

/**
 * Este usuário recebe aviso de senha hoje?
 *
 * - Sem a data da última troca (conta anterior à régua, que começa a contar
 *   no primeiro login): nunca.
 * - Faltando de 0 a 7 dias (`diasParaVencer` arredonda para baixo: 0 é
 *   "vence nas próximas 24h", ainda não vencida): um aviso por dia de São
 *   Paulo.
 * - Vencida: UM aviso só, o primeiro depois do vencimento — o painel pede a
 *   troca no próximo acesso, e repetir todo dia não muda nada.
 */
export function decidirAvisoDeSenha(p: {
  appMetadata: Record<string, unknown> | null | undefined;
  ultimoAviso: string | Date | null;
  agora: Date;
}): AvisoDeSenha | null {
  const trocadaEm = senhaTrocadaEm(p.appMetadata);
  if (!trocadaEm) return null;
  const ultimo = p.ultimoAviso ? new Date(p.ultimoAviso) : null;
  const ultimoValido = ultimo && !Number.isNaN(ultimo.getTime()) ? ultimo : null;

  if (senhaVencida(trocadaEm, p.agora)) {
    if (ultimoValido && ultimoValido.getTime() >= vencimentoDaSenha(trocadaEm).getTime()) return null;
    return { tipo: "vencida" };
  }
  const dias = diasParaVencer(trocadaEm, p.agora);
  if (dias > AVISO_ANTES_DE_VENCER_DIAS) return null;
  if (ultimoValido && mesmoDiaEmSP(ultimoValido, p.agora)) return null;
  return { tipo: "vence", dias };
}

export function notificacaoDaSenha(aviso: AvisoDeSenha): { titulo: string; corpo: string } {
  if (aviso.tipo === "vencida") {
    return {
      titulo: "Sua senha venceu",
      corpo: "No próximo acesso o painel vai pedir uma senha nova. Leva um minuto.",
    };
  }
  // Dias INTEIROS até o vencimento: "amanhã" seria mentira para quem tem 47h.
  const quando = aviso.dias <= 0 ? "em menos de 24 horas" : aviso.dias === 1 ? "em 1 dia" : `em ${aviso.dias} dias`;
  return {
    titulo: `Sua senha vence ${quando}`,
    corpo: "A senha vale 90 dias. Troque agora para não ser interrompido no próximo acesso.",
  };
}
