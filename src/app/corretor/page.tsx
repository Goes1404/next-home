import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sair } from "./actions";
import { CopiarLink } from "./CopiarLink";
import { createClient } from "@/lib/supabase/server";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  title: "Painel do corretor",
  robots: { index: false, follow: false },
};

/**
 * Painel do corretor logado: mostra o link pessoal
 * (`site.url/?corretor=<slug>`) — enquanto esse link estiver ativo na
 * visita de um cliente, todo CTA de WhatsApp do site aponta pro número
 * deste corretor (ver `proxy.ts` e `lib/corretorAtivo.ts`), não pro
 * corretor "dono" de cada empreendimento no cadastro.
 *
 * `proxy.ts` já redireciona quem não tem sessão pra /corretor/entrar antes
 * de chegar aqui; o redirect abaixo é a segunda camada (defesa em
 * profundidade), caso a página seja renderizada sem passar pelo proxy.
 */
export default async function PainelCorretorPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/corretor/entrar");

  const { data: corretor } = await supabase
    .from("corretores")
    .select("nome, slug")
    .eq("user_id", user.id)
    .maybeSingle();

  return (
    <main className="flex min-h-svh flex-1 flex-col items-center justify-center bg-ink-950 px-4 py-16">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-ink-900/50 p-7 sm:p-8">
        {corretor?.slug ? (
          <>
            <p className="text-fluid-sm text-mist-400">Olá,</p>
            <h1 className="font-display text-fluid-xl text-mist-50">{corretor.nome}</h1>

            <p className="text-fluid-sm mt-5 text-mist-300">
              Este é o seu link pessoal do portfólio. Enquanto um cliente estiver navegando por
              ele, todo botão de WhatsApp do site — em qualquer empreendimento — fala com você,
              mesmo que o cadastro liste outro corretor responsável.
            </p>

            <CopiarLink link={`${site.url}/?corretor=${corretor.slug}`} />
          </>
        ) : (
          <p className="text-fluid-sm text-mist-300">
            Sua conta está autenticada, mas ainda não foi vinculada a um cadastro de corretor.
            Fale com quem administra o site pra concluir o vínculo.
          </p>
        )}

        <form action={sair} className="mt-8 border-t border-white/10 pt-5">
          <button
            type="submit"
            className="text-fluid-sm text-mist-400 underline-offset-4 hover:text-mist-100 hover:underline"
          >
            Sair
          </button>
        </form>
      </div>
    </main>
  );
}
