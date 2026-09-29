/**
 * Há quanto tempo o corretor não entra no painel (26/09/2026). A medida é
 * o último login do Auth; "nunca" é estado próprio, não "há muito tempo" —
 * quem nunca entrou precisa de outra ação (receber a senha) que quem parou
 * de entrar (uma conversa).
 */
export function ultimoAcessoLegivel(ultimoLogin: string | null, temLogin: boolean, agora = new Date()): string {
  if (!temLogin) return "sem acesso criado";
  if (!ultimoLogin) return "nunca entrou";
  const dias = Math.floor((agora.getTime() - new Date(ultimoLogin).getTime()) / 86_400_000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

/** Sem entrar há 7 dias ou mais (ou nunca) merece a atenção do gestor. */
export function acessoParado(ultimoLogin: string | null, agora = new Date()): boolean {
  if (!ultimoLogin) return true;
  return agora.getTime() - new Date(ultimoLogin).getTime() >= 7 * 86_400_000;
}
