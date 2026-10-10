/**
 * Por que o número caiu, em português (0174, 10/10/2026).
 *
 * Quando o WhatsApp derruba a conexão, ele manda um código: a Evolution o
 * repassa no `connection.update` (`statusReason`) e o guarda na própria
 * instância (`disconnectionReasonCode`). Até 10/10 o código chegava no
 * webhook e era descartado. Naquele dia 4 dos 6 números da equipe estavam
 * fora do ar, e ninguém sabia dizer se tinha sido a lista, o celular ou a
 * internet.
 *
 * Os códigos são os do Baileys (por baixo da Evolution). 401 e 403 são os
 * que importam para o número: aparelho desconectado da conta e conexão
 * recusada, que é como a restrição da conta costuma aparecer. 402 e 406 a
 * Evolution trata junto deles, como queda que não deve reconectar sozinha.
 *
 * Puro: não lê banco nem rede.
 */

const POR_CODIGO: Record<number, string> = {
  401: "o WhatsApp desconectou este aparelho da conta (alguém o tirou em Aparelhos conectados, ou o próprio WhatsApp encerrou a sessão)",
  403: "o WhatsApp recusou a conexão do número, o que costuma vir de restrição ou bloqueio da conta",
  402: "o WhatsApp encerrou a conexão e não deixou reconectar sozinho, o que costuma vir de restrição da conta",
  406: "o WhatsApp encerrou a conexão e não deixou reconectar sozinho, o que costuma vir de restrição da conta",
  440: "o WhatsApp foi aberto em outro lugar com esta mesma conexão",
  428: "a conexão com o WhatsApp foi perdida",
  408: "a conexão com o WhatsApp foi perdida",
  500: "a sessão ficou inválida e precisa ser lida de novo pelo QR Code",
  515: "o WhatsApp pediu para reiniciar a conexão",
  503: "o serviço do WhatsApp ficou fora do ar",
  411: "o celular e a conexão ficaram com versões diferentes do WhatsApp",
};

/** O código que diz "conectado": não é queda. */
const SEM_QUEDA = 200;

/** Normaliza o que chega (número ou texto numérico). Fora disso, nulo. */
export function codigoDaQueda(bruto: unknown): number | null {
  const n = typeof bruto === "number" ? bruto : typeof bruto === "string" && /^\d{3}$/.test(bruto.trim()) ? Number(bruto) : NaN;
  if (!Number.isInteger(n) || n < 100 || n > 999 || n === SEM_QUEDA) return null;
  return n;
}

/** A frase do motivo, sem ponto final, ou nulo quando não se sabe. */
export function motivoDaQueda(codigo: number | null | undefined): string | null {
  const c = codigoDaQueda(codigo);
  if (c === null) return null;
  return POR_CODIGO[c] ?? `o WhatsApp encerrou a conexão (código ${c})`;
}

/**
 * A queda veio do WhatsApp contra a conta, e não da rede? É o caso em que
 * vale abrir o celular e procurar aviso de restrição antes de reconectar.
 */
export function quedaPelaConta(codigo: number | null | undefined): boolean {
  const c = codigoDaQueda(codigo);
  return c === 401 || c === 403 || c === 402 || c === 406;
}

/** Quanto antes da queda que nós registramos o motivo guardado ainda vale. */
const TOLERANCIA_ANTES_MS = 24 * 3_600_000;

/**
 * Lê o motivo que a Evolution guardou (`GET /instance/fetchInstances`).
 *
 * A Evolution guarda só a ÚLTIMA queda que não reconecta sozinha, então o
 * código pode ser de outra queda, mais antiga. Por isso só vale com data, e
 * a data tem de estar perto da queda que nós registramos (até um dia antes,
 * porque o nosso marco às vezes é carimbado depois da queda real). Sem data,
 * ou com data longe, o motivo fica desconhecido: dizer o motivo de outra
 * queda é pior que não dizer nenhum.
 *
 * Aceita a resposta em lista (v2) ou um objeto só, e o código no topo ou
 * dentro de `instance`.
 */
export function motivoGuardadoNaEvolution(
  resposta: unknown,
  desconectadoEm: Date,
  agora: Date = new Date(),
): number | null {
  const itens = Array.isArray(resposta) ? resposta : resposta ? [resposta] : [];
  for (const item of itens) {
    if (!item || typeof item !== "object") continue;
    const raiz = item as Record<string, unknown>;
    const dentro = (raiz.instance && typeof raiz.instance === "object" ? raiz.instance : {}) as Record<string, unknown>;
    const codigo = codigoDaQueda(raiz.disconnectionReasonCode ?? dentro.disconnectionReasonCode);
    const quandoBruto = raiz.disconnectionAt ?? dentro.disconnectionAt;
    if (codigo === null || typeof quandoBruto !== "string") continue;
    const quando = new Date(quandoBruto);
    if (Number.isNaN(quando.getTime())) continue;
    const perto =
      quando.getTime() >= desconectadoEm.getTime() - TOLERANCIA_ANTES_MS &&
      quando.getTime() <= agora.getTime() + 5 * 60_000;
    if (perto) return codigo;
  }
  return null;
}
