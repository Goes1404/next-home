// Quais tabelas do `public` pertencem a um grupo e quais são da plataforma.
//
// Regra da fase 1 (spec docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md):
// toda tabela do `public` tem `grupo_id`, EXCETO as listadas aqui. A lista é
// declarada à mão, como os `RESERVADOS` de `migrations.test.ts`: tabela nova
// que ficar sem grupo tem de estar aqui, com o motivo. A guarda que confere
// isso no banco chega com a migration que põe `grupo_id` nas outras tabelas.
//
// `parametros_credito` NÃO é global: desde a decisão de 19/10/2026 cada grupo
// tem as próprias taxas do simulador (0181).

export const TABELAS_GLOBAIS = [
  // A própria lista de grupos: a linha É o grupo.
  "grupos",
  // Quem administra a plataforma, acima de todos os grupos.
  "administradores_da_plataforma",
] as const;

export type TabelaGlobal = (typeof TABELAS_GLOBAIS)[number];
