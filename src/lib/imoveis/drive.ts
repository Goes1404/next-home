/**
 * Google Drive como origem de material do empreendimento.
 *
 * Só pastas ABERTAS ("qualquer pessoa com o link"), que é o que a construtora
 * manda. Para essas, uma API key basta — OAuth por corretor significaria tela
 * de consentimento, refresh token guardado no banco e o app em revisão pelo
 * Google, para um caso que não aparece.
 */

export type LinkDrive =
  | { tipo: "pasta" | "arquivo"; id: string }
  | { tipo: "nao_reconhecido"; motivo: string };

/** Comparação EXATA, não sufixo: host parecido é o vetor óbvio de phishing. */
const HOSTS_DO_DRIVE = new Set(["drive.google.com", "docs.google.com"]);

const RECUSA = {
  tipo: "nao_reconhecido" as const,
  motivo:
    "Não reconheci este link. Cole o endereço da pasta no drive.google.com — aquele que aparece em Compartilhar → Copiar link.",
};

export type ArquivoDrive = {
  id: string;
  nome: string;
  mime: string;
  tamanho: number | null;
  /** Miniatura que o próprio Google devolve — evita baixar para curar. */
  thumbnail: string | null;
  ehVideo: boolean;
};

const CAMPOS = "files(id,name,mimeType,size,thumbnailLink)";

function chaveDaApi(): string | null {
  const valor = process.env.GOOGLE_API_KEY;
  return valor && valor.length > 0 ? valor : null;
}

const SEM_CHAVE = "A importação por link do Drive ainda não está configurada neste ambiente.";

/**
 * Lista o que interessa numa pasta aberta do Drive.
 *
 * `supportsAllDrives` e `includeItemsFromAllDrives` ligados porque pasta de
 * construtora quase sempre mora num Drive compartilhado — sem eles a
 * listagem volta VAZIA, o que na tela parece pasta sem foto nenhuma.
 */
export async function listarPasta(
  id: string,
): Promise<{ ok: true; arquivos: ArquivoDrive[] } | { ok: false; erro: string }> {
  const chave = chaveDaApi();
  if (!chave) return { ok: false, erro: SEM_CHAVE };

  const endereco = new URL("https://www.googleapis.com/drive/v3/files");
  endereco.searchParams.set("q", `'${id}' in parents and trashed = false`);
  endereco.searchParams.set("fields", CAMPOS);
  endereco.searchParams.set("pageSize", "200");
  endereco.searchParams.set("supportsAllDrives", "true");
  endereco.searchParams.set("includeItemsFromAllDrives", "true");
  endereco.searchParams.set("key", chave);

  let resposta: Response;
  try {
    resposta = await fetch(endereco, { cache: "no-store" });
  } catch {
    return { ok: false, erro: "Não consegui falar com o Google agora. Tente de novo em instantes." };
  }

  if (resposta.status === 404 || resposta.status === 403) {
    return {
      ok: false,
      erro:
        "Não consegui abrir esta pasta. No Drive, em Compartilhar, marque 'qualquer pessoa com o link' e mande o endereço de novo.",
    };
  }
  if (!resposta.ok) {
    return { ok: false, erro: "O Google recusou a consulta agora. Tente de novo em instantes." };
  }

  const corpo = (await resposta.json()) as {
    files?: { id: string; name: string; mimeType: string; size?: string; thumbnailLink?: string }[];
  };

  const arquivos = (corpo.files ?? [])
    .filter((arquivo) => arquivo.mimeType.startsWith("image/") || arquivo.mimeType.startsWith("video/"))
    .map((arquivo) => ({
      id: arquivo.id,
      nome: arquivo.name,
      mime: arquivo.mimeType,
      tamanho: arquivo.size ? Number(arquivo.size) : null,
      thumbnail: arquivo.thumbnailLink ?? null,
      ehVideo: arquivo.mimeType.startsWith("video/"),
    }));

  return { ok: true, arquivos };
}

/** Baixa UM arquivo. Um por chamada: o teto de função no Hobby é 60s. */
export async function baixarArquivo(
  id: string,
): Promise<{ ok: true; bytes: Buffer; mime: string } | { ok: false; erro: string }> {
  const chave = chaveDaApi();
  if (!chave) return { ok: false, erro: SEM_CHAVE };

  const endereco = new URL(`https://www.googleapis.com/drive/v3/files/${id}`);
  endereco.searchParams.set("alt", "media");
  endereco.searchParams.set("supportsAllDrives", "true");
  endereco.searchParams.set("key", chave);

  try {
    const resposta = await fetch(endereco, { cache: "no-store" });
    if (!resposta.ok) return { ok: false, erro: "o Google não entregou este arquivo" };
    return {
      ok: true,
      bytes: Buffer.from(await resposta.arrayBuffer()),
      mime: resposta.headers.get("content-type") ?? "image/jpeg",
    };
  } catch {
    return { ok: false, erro: "a transferência caiu no meio" };
  }
}

export function parsearLinkDrive(url: string): LinkDrive {
  let endereco: URL;
  try {
    endereco = new URL(url.trim());
  } catch {
    return RECUSA;
  }

  if (!HOSTS_DO_DRIVE.has(endereco.hostname)) return RECUSA;

  const pasta = endereco.pathname.match(/\/folders\/([\w-]+)/);
  if (pasta) return { tipo: "pasta", id: pasta[1] };

  const arquivo = endereco.pathname.match(/\/file\/d\/([\w-]+)/);
  if (arquivo) return { tipo: "arquivo", id: arquivo[1] };

  const porQuery = endereco.searchParams.get("id");
  if (porQuery) return { tipo: "arquivo", id: porQuery };

  return RECUSA;
}
