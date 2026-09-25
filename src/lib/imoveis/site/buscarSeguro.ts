import "server-only";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import zlib from "node:zlib";
import type { LookupFunction } from "node:net";
import { enderecoProibido, validarUrlPublica } from "./enderecoPublico";

/**
 * Busca uma URL que um corretor COLOU, com a trava contra SSRF.
 *
 * O servidor vai abrir um endereço que alguém digitou. Sem trava,
 * `http://169.254.169.254/` ou `http://localhost` viram leitura da rede
 * interna de quem hospeda a função. A regra mora em DOIS lugares, de
 * propósito:
 *
 * 1. `validarUrlPublica` recusa esquema, porta, credencial e IP literal
 *    proibido ANTES de qualquer conexão (e de novo a cada redirecionamento).
 * 2. O `lookup` abaixo confere o IP NO MOMENTO DA CONEXÃO. Conferir o DNS
 *    antes e conectar depois deixaria a janela do "DNS rebinding": o nome
 *    resolve para um IP público na checagem e para 127.0.0.1 na conexão.
 *
 * Usa `node:http(s)` e não `fetch` justamente pelo `lookup`: o `fetch` do
 * Node não aceita trocar a resolução de nome sem uma dependência que este
 * projeto não declara.
 */

export type ResultadoBusca =
  | { ok: true; bytes: Buffer; contentType: string; urlFinal: string }
  | { ok: false; motivo: MotivoFalhaBusca; mensagem: string };

export type MotivoFalhaBusca =
  | "url_invalida"
  | "endereco_proibido"
  | "bloqueado"
  | "nao_encontrado"
  | "tipo_errado"
  | "grande_demais"
  | "tempo_esgotado"
  | "rede";

const MAX_REDIRECIONAMENTOS = 3;

/**
 * Cabeçalhos de navegador comum. A P4 Engenharia devolveu 406 para um
 * `User-Agent` curto; site de construtora não tem API, é página feita para
 * gente, e é como gente que ele precisa ser pedido.
 */
const CABECALHOS = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/png,image/jpeg,*/*;q=0.8",
  "accept-language": "pt-BR,pt;q=0.9,en;q=0.6",
  "accept-encoding": "gzip, deflate, br",
};

const lookupSeguro: LookupFunction = (hostname, opcoes, callback) => {
  dns.lookup(hostname, { ...opcoes, all: true }, (erro, enderecos) => {
    if (erro) return callback(erro, "", 4);
    const lista = Array.isArray(enderecos) ? enderecos : [];
    const proibido = lista.find((e) => enderecoProibido(e.address));
    if (lista.length === 0 || proibido) {
      const e = new Error("endereco_proibido") as NodeJS.ErrnoException;
      e.code = "ENDERECO_PROIBIDO";
      return callback(e, "", 4);
    }
    // `all: true` só quando quem chamou pediu todos; senão devolve o primeiro.
    if ((opcoes as { all?: boolean }).all) {
      return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, lista);
    }
    callback(null, lista[0].address, lista[0].family);
  });
};

function descompactar(corpo: Buffer, codificacao: string | undefined): Buffer {
  switch ((codificacao ?? "").trim().toLowerCase()) {
    case "gzip":
      return zlib.gunzipSync(corpo);
    case "deflate":
      return zlib.inflateSync(corpo);
    case "br":
      return zlib.brotliDecompressSync(corpo);
    default:
      return corpo;
  }
}

type Resposta = { status: number; cabecalhos: http.IncomingHttpHeaders; corpo: Buffer };

function pedirUmaVez(url: URL, tetoBytes: number, prazoMs: number): Promise<Resposta> {
  return new Promise((resolve, reject) => {
    const modulo = url.protocol === "https:" ? https : http;
    const req = modulo.request(
      url,
      { method: "GET", headers: CABECALHOS, lookup: lookupSeguro, timeout: prazoMs },
      (res) => {
        const partes: Buffer[] = [];
        let total = 0;
        res.on("data", (parte: Buffer) => {
          total += parte.length;
          // O teto vale sobre o que CHEGA, compactado: uma página de 5 MB
          // compactada pode descompactar em 40, e o `Content-Length` pode
          // mentir ou faltar.
          if (total > tetoBytes) {
            req.destroy(new Error("grande_demais"));
            return;
          }
          partes.push(parte);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, cabecalhos: res.headers, corpo: Buffer.concat(partes) }));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("tempo_esgotado")));
    req.on("error", reject);
    req.end();
  });
}

export async function buscarSeguro(
  endereco: string,
  opcoes: { tetoBytes: number; prazoMs: number; aceitar: (contentType: string) => boolean },
): Promise<ResultadoBusca> {
  let alvo = validarUrlPublica(endereco);

  for (let salto = 0; salto <= MAX_REDIRECIONAMENTOS; salto++) {
    if (!alvo.ok) return { ok: false, motivo: alvo.motivo, mensagem: alvo.mensagem };

    let resposta: Resposta;
    try {
      resposta = await pedirUmaVez(alvo.url, opcoes.tetoBytes, opcoes.prazoMs);
    } catch (erro) {
      const texto = erro instanceof Error ? erro.message : String(erro);
      const codigo = (erro as NodeJS.ErrnoException)?.code;
      if (codigo === "ENDERECO_PROIBIDO" || texto === "endereco_proibido") {
        return { ok: false, motivo: "endereco_proibido", mensagem: "Este endereço não é um site público." };
      }
      if (texto === "grande_demais") {
        return { ok: false, motivo: "grande_demais", mensagem: "O arquivo é maior do que o limite." };
      }
      if (texto === "tempo_esgotado") {
        return { ok: false, motivo: "tempo_esgotado", mensagem: "O site demorou demais para responder." };
      }
      if (codigo === "ENOTFOUND") {
        return { ok: false, motivo: "nao_encontrado", mensagem: "Não encontrei este site. Confira o endereço." };
      }
      return { ok: false, motivo: "rede", mensagem: "Não consegui falar com este site agora." };
    }

    if (resposta.status >= 300 && resposta.status < 400 && resposta.cabecalhos.location) {
      // Cada salto passa pela validação inteira de novo: o redirecionamento é
      // o caminho clássico para levar a busca de um site público a um IP interno.
      alvo = validarUrlPublica(new URL(resposta.cabecalhos.location, alvo.url).toString());
      continue;
    }

    if (resposta.status === 401 || resposta.status === 403 || resposta.status === 406 || resposta.status === 429) {
      return {
        ok: false,
        motivo: "bloqueado",
        mensagem: "Este site não deixa programas lerem a página (só pessoas, no navegador).",
      };
    }
    if (resposta.status === 404 || resposta.status === 410) {
      return { ok: false, motivo: "nao_encontrado", mensagem: "Esta página não existe mais no site." };
    }
    if (resposta.status < 200 || resposta.status >= 300) {
      return { ok: false, motivo: "rede", mensagem: `O site respondeu com erro (${resposta.status}).` };
    }

    const contentType = String(resposta.cabecalhos["content-type"] ?? "").toLowerCase();
    if (!opcoes.aceitar(contentType)) {
      return { ok: false, motivo: "tipo_errado", mensagem: "Este endereço não aponta para o que eu esperava." };
    }

    let bytes: Buffer;
    try {
      bytes = descompactar(resposta.corpo, resposta.cabecalhos["content-encoding"] as string | undefined);
    } catch {
      return { ok: false, motivo: "rede", mensagem: "O site mandou uma resposta que não consegui abrir." };
    }
    if (bytes.length > opcoes.tetoBytes * 8) {
      return { ok: false, motivo: "grande_demais", mensagem: "O arquivo é maior do que o limite." };
    }

    return { ok: true, bytes, contentType, urlFinal: alvo.url.toString() };
  }

  return { ok: false, motivo: "rede", mensagem: "O site redireciona demais." };
}
