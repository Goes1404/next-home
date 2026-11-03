import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifra do token de cada cliente da API oficial (F5, Embedded Signup).
 *
 * O token dá acesso à conta de WhatsApp do cliente: em texto puro no banco,
 * um vazamento de backup viraria acesso a mandar mensagem em nome de todas as
 * imobiliárias. Fica cifrado com AES-256-GCM e uma chave que só existe no
 * ambiente (WHATSAPP_OFICIAL_CHAVE_CIFRA, 32 bytes em base64). GCM porque
 * autentica: um texto adulterado no banco não decifra para lixo, falha.
 *
 * Formato: `v1:<iv>:<tag>:<cifrado>`, os três em base64. O prefixo deixa
 * trocar de esquema depois sem adivinhar o que está gravado.
 */

const VERSAO = "v1";

function chaveDe(base64: string): Buffer {
  const chave = Buffer.from(base64, "base64");
  if (chave.length !== 32) {
    throw new Error("A chave de cifra precisa ter 32 bytes (base64 de `openssl rand -base64 32`).");
  }
  return chave;
}

export function cifrar(texto: string, chaveBase64: string): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv("aes-256-gcm", chaveDe(chaveBase64), iv);
  const cifrado = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  const tag = cifra.getAuthTag();
  return [VERSAO, iv.toString("base64"), tag.toString("base64"), cifrado.toString("base64")].join(":");
}

/** `null` quando o texto não decifra (chave errada, adulterado, formato velho). */
export function decifrar(gravado: string, chaveBase64: string): string | null {
  const partes = gravado.split(":");
  if (partes.length !== 4 || partes[0] !== VERSAO) return null;
  try {
    const [, iv, tag, cifrado] = partes;
    const decifra = createDecipheriv("aes-256-gcm", chaveDe(chaveBase64), Buffer.from(iv, "base64"));
    decifra.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decifra.update(Buffer.from(cifrado, "base64")), decifra.final()]).toString("utf8");
  } catch {
    return null;
  }
}
