/**
 * Chamada à Graph API da Meta (WhatsApp Cloud API). Sem `server-only` para
 * os testes chamarem com um `fetch` falso; quem passa o token é o servidor.
 *
 * Três desfechos, e a diferença entre eles é o que protege o cliente de
 * receber a mesma mensagem duas vezes:
 *   - `ok`: a Meta respondeu 2xx;
 *   - erro com `codigo`: a Meta RECUSOU (nada saiu) e disse por quê;
 *   - erro `incerto`: a rede caiu ou o prazo venceu DEPOIS de o pedido sair.
 *     A mensagem pode ter saído; tentar de novo arrisca mandar duas vezes
 *     (a mesma régua do `MOTIVO_ENVIO_INCERTO` da Evolution).
 */

export type ErroDaMeta = {
  /** `error.code` da Meta; nulo quando nem chegou resposta. */
  codigo: number | null;
  subcodigo: number | null;
  mensagem: string;
  /** `error.error_data.details`, o texto mais útil que a Meta manda. */
  detalhe: string | null;
  status: number | null;
  /** O pedido pode ter chegado à Meta (prazo vencido, conexão cortada). */
  incerto: boolean;
};

export type RespostaGraph<T> = { ok: true; dados: T } | { ok: false; erro: ErroDaMeta };

type CorpoDeErro = {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_data?: { details?: string } | string;
    error_user_msg?: string;
  };
};

/** Lê o `{ error: {...} }` da Meta. Corpo fora do formato vira mensagem genérica. */
export function lerErroDaMeta(corpo: unknown, status: number | null): ErroDaMeta {
  const erro = (corpo as CorpoDeErro | null)?.error;
  const detalhe =
    typeof erro?.error_data === "string"
      ? erro.error_data
      : (erro?.error_data?.details ?? erro?.error_user_msg ?? null);
  return {
    codigo: typeof erro?.code === "number" ? erro.code : null,
    subcodigo: typeof erro?.error_subcode === "number" ? erro.error_subcode : null,
    mensagem: erro?.message ?? (status ? `HTTP ${status}` : "Sem resposta da Meta"),
    detalhe: detalhe ?? null,
    status,
    incerto: false,
  };
}

export async function chamarGraph<T>(p: {
  versao: string;
  caminho: string;
  token: string;
  metodo?: "GET" | "POST" | "DELETE";
  corpo?: unknown;
  consulta?: Record<string, string>;
  /** Corpo binário (upload da foto do modelo). Exclui `corpo`. */
  binario?: { dados: ArrayBuffer | Uint8Array; cabecalhos: Record<string, string> };
  /** Cabeçalho de autorização no formato do upload ("OAuth <token>"). */
  autorizacao?: "Bearer" | "OAuth";
  prazoMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<RespostaGraph<T>> {
  const busca = p.fetchImpl ?? fetch;
  const caminho = p.caminho.replace(/^\/+/, "");
  const url = new URL(`https://graph.facebook.com/${p.versao}/${caminho}`);
  for (const [chave, valor] of Object.entries(p.consulta ?? {})) url.searchParams.set(chave, valor);

  // Sem token (a troca do código do Embedded Signup vai só com o id e o
  // segredo do app na consulta), sem cabeçalho: um "Bearer " vazio a Meta
  // lê como token inválido.
  const cabecalhos: Record<string, string> = {
    ...(p.token ? { Authorization: `${p.autorizacao ?? "Bearer"} ${p.token}` } : {}),
    ...(p.binario?.cabecalhos ?? {}),
  };
  let corpo: BodyInit | undefined;
  if (p.binario) {
    corpo = p.binario.dados instanceof Uint8Array ? new Blob([p.binario.dados as Uint8Array<ArrayBuffer>]) : new Blob([p.binario.dados]);
  } else if (p.corpo !== undefined) {
    cabecalhos["Content-Type"] = "application/json";
    corpo = JSON.stringify(p.corpo);
  }

  let resposta: Response;
  try {
    resposta = await busca(url, {
      method: p.metodo ?? (corpo ? "POST" : "GET"),
      headers: cabecalhos,
      body: corpo,
      signal: AbortSignal.timeout(p.prazoMs ?? 15_000),
      cache: "no-store",
    });
  } catch (erro) {
    // Prazo vencido ou conexão cortada: o pedido pode ter chegado à Meta.
    return {
      ok: false,
      erro: {
        codigo: null,
        subcodigo: null,
        mensagem: erro instanceof Error ? erro.message : "Falha de rede",
        detalhe: null,
        status: null,
        incerto: true,
      },
    };
  }

  let json: unknown = null;
  try {
    json = await resposta.json();
  } catch {
    json = null;
  }

  if (!resposta.ok) return { ok: false, erro: lerErroDaMeta(json, resposta.status) };
  // 2xx com corpo de erro existe (a Meta às vezes responde 200 com `error`).
  if (json && typeof json === "object" && "error" in (json as object)) {
    return { ok: false, erro: lerErroDaMeta(json, resposta.status) };
  }
  return { ok: true, dados: json as T };
}
