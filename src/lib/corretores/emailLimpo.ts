// Módulo PURO: entra em componente cliente (formulários da plataforma via
// `dadosDoGrupo.ts`). Ficava em `convite.ts`, que puxa a chave de serviço e
// quebrava o build ao ser importado pelo navegador (22/10/2026).

const FORMATO_DE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** `"  Ana@Gmail.com "` → `"ana@gmail.com"`, ou `null` se não parece e-mail. */
export function limparEmail(email: string): string | null {
  const limpo = email.trim().toLowerCase();
  return FORMATO_DE_EMAIL.test(limpo) ? limpo : null;
}
