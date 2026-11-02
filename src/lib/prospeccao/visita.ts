// O pedido do rastreio da amostra (0253, 02/11/2026). Módulo PURO: valida o
// corpo que o script da página manda, antes de qualquer acesso ao banco.

export type PedidoDeVisita =
  | { tipo: "abertura"; slug: string; dispositivo: "celular" | "computador" | "" }
  | { tipo: "tempo"; id: string; segundos: number };

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function lerPedidoDeVisita(corpo: string): PedidoDeVisita | null {
  if (!corpo || corpo.length > 500) return null;
  let dados: unknown;
  try {
    dados = JSON.parse(corpo);
  } catch {
    return null;
  }
  if (!dados || typeof dados !== "object") return null;
  const d = dados as Record<string, unknown>;

  if (typeof d.id === "string") {
    const segundos = Number(d.segundos);
    if (!UUID.test(d.id) || !Number.isFinite(segundos) || segundos < 0) return null;
    return { tipo: "tempo", id: d.id, segundos: Math.min(86_400, Math.floor(segundos)) };
  }

  if (typeof d.slug === "string" && SLUG.test(d.slug) && d.slug.length <= 80) {
    const dispositivo = d.dispositivo === "celular" || d.dispositivo === "computador" ? d.dispositivo : "";
    return { tipo: "abertura", slug: d.slug, dispositivo };
  }
  return null;
}
