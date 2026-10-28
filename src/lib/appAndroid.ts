// O app Android da Astro Soluções (28/10/2026): um Trusted Web Activity que
// abre `astroimob.vercel.app/corretor` em tela cheia. O Android só tira a
// barra do navegador se o SITE confirmar que o app é dele, pelo arquivo
// `/.well-known/assetlinks.json` (Digital Asset Links). Módulo PURO.
//
// A impressão digital (SHA-256) é a da chave que ASSINA o app na Play Store
// (Play Console → Configuração → Integridade do app → Assinatura do app).
// Ficam em `IMPRESSOES_DO_APP`; `ANDROID_SHA256` na Vercel (vírgula entre
// elas) substitui. Sem nenhuma válida o arquivo sai vazio e o app abre com a
// barra do navegador: não quebra, só fica feio.

/** O identificador do app na Play Store. Depois de publicado, nunca muda. */
export const PACOTE_PADRAO = "com.astrosolucoes.crm";

/**
 * As impressões do app publicado (28/10/2026, Play Console → Integridade do
 * app): a da chave de assinatura do Google e a da chave de upload. Não são
 * segredo — o próprio `assetlinks.json` as mostra a qualquer um —, por isso
 * ficam no código: a integração da Vercel não pode criar variáveis.
 * `ANDROID_SHA256`, se existir, SUBSTITUI esta lista.
 */
export const IMPRESSOES_DO_APP = [
  "1E:6D:E3:16:C6:6F:1F:58:09:AF:F3:A6:E8:8F:D1:E1:A9:4A:1A:B5:0B:51:74:28:55:A9:EC:BE:02:A9:74:55",
  "B6:E1:F0:B5:42:A8:43:6F:4A:4D:F3:BF:65:77:90:16:16:FF:C4:7B:66:C9:40:E9:20:87:55:56:49:E3:0F:2E",
].join(",");

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
  sha256 = process.env.ANDROID_SHA256?.trim() || IMPRESSOES_DO_APP,
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
