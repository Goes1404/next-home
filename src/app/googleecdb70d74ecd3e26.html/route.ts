import { GRUPO_NEXT_HOME_ID } from "@/lib/grupos/grupo";
import { siteDaRequisicao } from "@/lib/sites/pagina";

/**
 * A verificação do Search Console da Next Home (L51, fase 3).
 *
 * Era um arquivo em `public/`, servido em QUALQUER endereço: a conta Google
 * da Next Home se verificaria como dona do domínio de outro grupo apontado
 * para a plataforma. Agora só o site da Next Home o responde; nos outros, 404.
 * Cada grupo verifica o próprio domínio por meta tag ou DNS (fase 7).
 */
export async function GET(req: Request): Promise<Response> {
  const site = await siteDaRequisicao(req);
  if (site?.grupoId !== GRUPO_NEXT_HOME_ID) return new Response("Não encontrado", { status: 404 });
  return new Response("google-site-verification: googleecdb70d74ecd3e26.html", {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
