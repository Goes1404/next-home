import { VERSAO_DA_BUILD } from "@/lib/versao/versaoDaBuild";

/**
 * Qual build está no ar AGORA. É a única coisa que a aba aberta não tem como
 * saber sozinha.
 *
 * Três decisões que a fazem funcionar, e cada uma falharia CALADA se alguém
 * as desfizesse:
 *
 * 1. `no-store`. Se esta resposta for cacheada em qualquer lugar — CDN,
 *    navegador —, ela passa a devolver o carimbo VELHO e o aviso nunca
 *    aparece: o recurso inteiro vira decoração. É o pior desfecho possível
 *    aqui, porque continua parecendo que está tudo certo.
 * 2. Zero consulta ao banco. A aba pergunta ao voltar do segundo plano, e
 *    isso acontece o dia inteiro em toda aba aberta do painel e da vitrine.
 *    O corpo é um literal inlinado em tempo de build — a resposta não lê
 *    arquivo, cookie nem Supabase.
 * 3. Só GET, e é de propósito: quem chama é o navegador, não o pg_cron. A
 *    regra do `cronAceitaPost` vale para as rotas de cron, não para esta.
 */
export const dynamic = "force-dynamic";

export function GET() {
  return new Response(JSON.stringify({ versao: VERSAO_DA_BUILD }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}
