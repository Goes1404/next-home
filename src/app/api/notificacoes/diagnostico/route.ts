import { createClient } from "@/lib/supabase/server";

/**
 * Onde o "Ligar avisos" parou, para os logs da Vercel (04/11/2026).
 *
 * O dono relatou "clico e não aparece nada", e o banco tinha 1 inscrição só
 * desde 20/10: sem saber o passo e o aparelho, cada conserto era no escuro.
 * Aqui não grava nada no banco e não recebe a inscrição; só registra o
 * resultado, o passo, a permissão do navegador e o aparelho de quem está
 * logado (corretor ou ADM da plataforma). Sem sessão, ignora.
 */
export const dynamic = "force-dynamic";

function curto(v: unknown, max: number): string | null {
  return typeof v === "string" ? v.slice(0, max) : null;
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return new Response(null, { status: 204 });
  const corpo = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const linha = {
    usuario: data.user.id,
    onde: curto(corpo?.onde, 20),
    resultado: curto(corpo?.resultado, 20),
    passo: curto(corpo?.passo, 40),
    erro: curto(corpo?.erro, 120),
    permissao: curto(corpo?.permissao, 20),
    app: curto(corpo?.app, 20),
    aparelho: curto(corpo?.aparelho, 160),
  };
  if (linha.resultado === "ligada") console.info("[avisos] ligou", JSON.stringify(linha));
  else console.warn("[avisos] não ligou", JSON.stringify(linha));
  return new Response(null, { status: 204 });
}
