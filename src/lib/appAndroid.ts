// O app Android da Astro Soluções (28/10/2026): um Trusted Web Activity que
// abre `astroimob.vercel.app/corretor` em tela cheia. O Android só tira a
// barra do navegador se o SITE confirmar que o app é dele, pelo arquivo
// `/.well-known/assetlinks.json` (Digital Asset Links). Módulo PURO.
//
// A impressão digital (SHA-256) é a da chave que ASSINA o app na Play Store
// (Play Console → Configuração → Integridade do app → Assinatura do app).
// Ela vem de `ANDROID_SHA256` na Vercel, separadas por vírgula se houver mais
// de uma (a de upload e a do Google, por exemplo). Sem ela o arquivo sai
// vazio e o app abre com a barra do navegador: não quebra, só fica feio.

/** O identificador do app na Play Store. Depois de publicado, nunca muda. */
export const PACOTE_PADRAO = "com.astrosolucoes.crm";

const SHA256 = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

/** Normaliza e valida as impressões digitais: só as bem formadas entram. */
export function impressoesDigitais(valor: string | undefined): string[] {
  return (valor ?? "")
    .split(/[,\s]+/)
    .map((v) => v.trim().toUpperCase())
    .filter((v) => SHA256.test(v));
}

export type DeclaracaoDeVinculo = {
  relation: string[];
  target: { namespace: "android_app"; package_name: string; sha256_cert_fingerprints: string[] };
};

/** O conteúdo de `assetlinks.json`. Lista vazia quando não há chave válida. */
export function vinculosDoApp(
  sha256 = process.env.ANDROID_SHA256,
  pacote = process.env.ANDROID_PACOTE?.trim() || PACOTE_PADRAO,
): DeclaracaoDeVinculo[] {
  const digitais = impressoesDigitais(sha256);
  if (digitais.length === 0) return [];
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: pacote, sha256_cert_fingerprints: digitais },
    },
  ];
}
