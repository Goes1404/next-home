// Quais tabelas do `public` pertencem a um grupo e quais são da plataforma.
//
// Regra da fase 1 (spec docs/superpowers/specs/2026-10-18-plataforma-multi-grupo-design.md):
// toda tabela do `public` tem `grupo_id`, EXCETO as listadas aqui. A lista é
// declarada à mão, como os `RESERVADOS` de `migrations.test.ts`: tabela nova
// que ficar sem grupo tem de estar aqui, com o motivo. A 0182 pôs `grupo_id`
// em todas as outras, e `isolamento.db.test.ts` confere as duas direções no
// banco (tabela sem grupo fora daqui; tabela daqui que ganhou grupo ou sumiu).
// A mesma lista está no SQL da 0182, que não lê este arquivo. Nenhuma tabela
// daqui é lida pela API, menos `grupos` (cada logado lê o próprio, 0181).
//
// `parametros_credito` NÃO é global: desde a decisão de 19/10/2026 cada grupo
// tem as próprias taxas do simulador (0181).

export const TABELAS_GLOBAIS = [
  // A própria lista de grupos: a linha É o grupo.
  "grupos",
  // Quem administra a plataforma, acima de todos os grupos.
  "administradores_da_plataforma",
  // Trava de infraestrutura do disparador (escopo + dono + prazo), tocada só
  // por `travar_disparo`/`destravar_disparo`; não é dado de nenhum grupo.
  "whatsapp_disparo_lock",
  // Diagnóstico do provedor de WhatsApp, por `instance_name`, gravado pela
  // sonda com a chave de serviço.
  "whatsapp_diagnosticos",
] as const;

export type TabelaGlobal = (typeof TABELAS_GLOBAIS)[number];
