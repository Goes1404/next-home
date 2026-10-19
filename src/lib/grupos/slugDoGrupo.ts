// Slug do grupo (0186, spec §18 "Slug do grupo", L34).
//
// O slug vira subdomínio na fase 3 (`<slug>.nexthomeimoveis.com`), então
// segue a regra de rótulo de DNS: minúsculas, dígitos e hífen, sem hífen nas
// pontas, até 63 caracteres. E não pode tomar um nome que a própria
// plataforma usa ou vai usar (www, api, painel, o da Next Home).
//
// Três lugares aplicam a regra, e os três têm de concordar:
//   - esta função, para a tela recusar antes de gravar;
//   - `criar_grupo` (0186), que é por onde a plataforma cria grupo;
//   - o CHECK de `grupos.slug` (0186), para quem gravar por fora da função.
// O CHECK aceita uma letra só (os grupos de teste da fase 1 se chamam "a" e
// "b"); a tela e `criar_grupo` exigem pelo menos dois caracteres, o que pela
// forma do rótulo dá três ou mais.
//
// A lista de reservados existe aqui e em `slug_de_grupo_reservado` (0186);
// `slugDoGrupo.test.ts` lê a migration e compara as duas.

/** Rótulo de DNS: 1 caractere, ou 3 a 63 com hífen só no meio. */
const FORMATO = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;

/** Nomes que nenhum grupo pode usar. A mesma lista de `slug_de_grupo_reservado`. */
export const SLUGS_DE_GRUPO_RESERVADOS: readonly string[] = [
  "www",
  "app",
  "api",
  "admin",
  "plataforma",
  "painel",
  "corretor",
  "corretores",
  "auth",
  "login",
  "entrar",
  "mail",
  "email",
  "smtp",
  "suporte",
  "ajuda",
  "status",
  "blog",
  "docs",
  "static",
  "cdn",
  "assets",
  "teste",
  "testes",
  "dev",
  "staging",
  "next-home",
  "nexthome",
];

const RESERVADOS = new Set(SLUGS_DE_GRUPO_RESERVADOS);

export type ValidacaoDoSlug =
  { ok: true } | { ok: false; motivo: "formato" | "reservado" };

/** Confere o slug de um grupo novo. Não confere se está livre (isso é do banco). */
export function validarSlugDoGrupo(slug: string): ValidacaoDoSlug {
  if (slug.length < 2 || !FORMATO.test(slug)) return { ok: false, motivo: "formato" };
  if (RESERVADOS.has(slug)) return { ok: false, motivo: "reservado" };
  return { ok: true };
}
