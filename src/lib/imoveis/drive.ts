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
