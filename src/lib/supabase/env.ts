/**
 * As duas variáveis públicas do Supabase — seguras para o bundle do cliente,
 * a chave é "publishable" (equivalente à antiga `anon key`), não a
 * `service_role`. Os valores abaixo são o fallback: por serem, por design,
 * seguros para ficar expostos (mesmo padrão de chave publicável do Stripe
 * ou config do Firebase), servem de default para ambientes onde não dá
 * para configurar variáveis de ambiente — `.env.local` sempre tem prioridade.
 */
function env(nome: string, fallback: string): string {
  return process.env[nome] || fallback;
}

export const supabaseUrl = () =>
  env("NEXT_PUBLIC_SUPABASE_URL", "https://prhhrqyubjcafvucirri.supabase.co");
export const supabasePublishableKey = () =>
  env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_1sty2ajHUzZuJaJvVGrtIQ_xqDiKfDm");
