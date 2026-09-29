import net from "node:net";

/**
 * O que é "site público" para a busca do importador — PURO, sem rede, para a
 * regra ter teste. Quem usa é `buscarSeguro`, antes de conectar e de novo no
 * momento da conexão (ver o comentário de lá).
 */

export type UrlValidada =
  | { ok: true; url: URL }
  | { ok: false; motivo: "url_invalida" | "endereco_proibido"; mensagem: string };

function ipv4ParaNumero(ip: string): number {
  return ip.split(".").reduce((acc, parte) => acc * 256 + Number(parte), 0);
}

/** [início, bits de máscara] — faixas que nunca são internet pública. */
const FAIXAS_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, onde mora o metadata de nuvem
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function v4Proibido(ip: string): boolean {
  const n = ipv4ParaNumero(ip);
  return FAIXAS_V4.some(([inicio, bits]) => {
    const mascara = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return ((n & mascara) >>> 0) === ((ipv4ParaNumero(inicio) & mascara) >>> 0);
  });
}

export function enderecoProibido(ip: string): boolean {
  const limpo = ip.replace(/^\[|\]$/g, "").toLowerCase();
  if (net.isIPv4(limpo)) return v4Proibido(limpo);
  if (!net.isIPv6(limpo)) return true; // o que não é IP não é aceito aqui

  // IPv4 embutido (::ffff:127.0.0.1) vale pela metade IPv4.
  const embutido = limpo.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (embutido) return v4Proibido(embutido[1]);
  // O `URL` do Node reescreve `[::ffff:127.0.0.1]` em hexadecimal
  // (`::ffff:7f00:1`), e a forma decimal acima já não casa. Foi o teste que
  // mostrou: sem esta linha, o loopback passava pela trava.
  const hexa = limpo.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexa) {
    const alto = parseInt(hexa[1], 16);
    const baixo = parseInt(hexa[2], 16);
    return v4Proibido(`${alto >> 8}.${alto & 255}.${baixo >> 8}.${baixo & 255}`);
  }

  if (limpo === "::" || limpo === "::1") return true;
  const primeiro = parseInt(limpo.split(":")[0] || "0", 16);
  if ((primeiro & 0xfe00) === 0xfc00) return true; // fc00::/7, rede privada
  if ((primeiro & 0xffc0) === 0xfe80) return true; // fe80::/10, link-local
  if ((primeiro & 0xff00) === 0xff00) return true; // multicast
  return false;
}

export function validarUrlPublica(endereco: string): UrlValidada {
  let url: URL;
  try {
    url = new URL(endereco.trim());
  } catch {
    return { ok: false, motivo: "url_invalida", mensagem: "Isto não parece um endereço de site. Cole o link completo." };
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, motivo: "url_invalida", mensagem: "Só dá para ler endereços de site (http ou https)." };
  }
  if (url.username || url.password) {
    return { ok: false, motivo: "url_invalida", mensagem: "Cole o link sem usuário e senha." };
  }
  // Porta fora do padrão é serviço interno, não site de construtora.
  if (url.port && url.port !== "80" && url.port !== "443") {
    return { ok: false, motivo: "endereco_proibido", mensagem: "Este endereço não é um site público." };
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    return { ok: false, motivo: "endereco_proibido", mensagem: "Este endereço não é um site público." };
  }
  if (net.isIP(host) && enderecoProibido(host)) {
    return { ok: false, motivo: "endereco_proibido", mensagem: "Este endereço não é um site público." };
  }
  // Nome sem ponto (intranet) nunca é site de construtora.
  if (!net.isIP(host) && !host.includes(".")) {
    return { ok: false, motivo: "endereco_proibido", mensagem: "Este endereço não é um site público." };
  }

  return { ok: true, url };
}
