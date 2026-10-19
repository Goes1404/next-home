/**
 * Leitura da resposta de `POST /chat/whatsappNumbers` da Evolution (07/10/2026).
 *
 * A consulta diz, para cada número, se ele tem WhatsApp. A lista de
 * transmissão a usa ANTES de montar a fila: número sem WhatsApp sai da lista
 * em vez de virar uma tentativa de envio. Nasceu da restrição da conta da
 * Bruna: das 131 tentativas da lista dela, 17 eram números sem WhatsApp; na
 * da Carolini, 24 de 39.
 *
 * Módulo PURO. A regra é conservadora: só "não tem" quando o provedor
 * devolve `exists: false` para AQUELE número. Resposta ausente, torta ou de
 * outro número vira "não sei", e o número fica na lista (o disparador ainda
 * trata o número inexistente no envio). Tirar da lista quem tem WhatsApp
 * custaria um cliente; deixar quem não tem custa uma tentativa.
 */

/** Só os dígitos, sem o 9 depois do DDD, para casar as duas grafias do celular. */
function chave(telefone: string): string {
  const d = telefone.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55") && d[4] === "9") return d.slice(0, 4) + d.slice(5);
  return d;
}

/**
 * Para cada número consultado, `true` (tem), `false` (não tem) ou fica de
 * fora do mapa (não sei). A chave do mapa é o número como foi consultado.
 */
export function lerRespostaDeNumeros(consultados: string[], corpo: unknown): Map<string, boolean> {
  const resultado = new Map<string, boolean>();
  if (!Array.isArray(corpo)) return resultado;
  const porChave = new Map(consultados.map((n) => [chave(n), n]));
  for (const item of corpo) {
    if (typeof item !== "object" || item === null) continue;
    const { exists, number, jid } = item as { exists?: unknown; number?: unknown; jid?: unknown };
    if (typeof exists !== "boolean") continue;
    const candidatos = [number, typeof jid === "string" ? jid.split("@")[0] : null];
    for (const c of candidatos) {
      if (typeof c !== "string") continue;
      const original = porChave.get(chave(c));
      if (original) {
        resultado.set(original, exists);
        break;
      }
    }
  }
  return resultado;
}

/** Quantos números vão em cada consulta. */
export const NUMEROS_POR_CONSULTA = 50;
