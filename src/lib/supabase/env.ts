/**
 * As duas variáveis públicas do Supabase — seguras para o bundle do cliente,
 * a chave é "publishable" (equivalente à antiga `anon key`), não a
 * `service_role`. Centralizado aqui para falhar cedo e claro se faltar.
 */
function env(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    throw new Error(`Variável de ambiente ausente: ${nome}. Confira .env.local.`);
  }
  return valor;
}

export const supabaseUrl = () => env("NEXT_PUBLIC_SUPABASE_URL");
export const supabasePublishableKey = () => env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
