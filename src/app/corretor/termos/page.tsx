import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sair } from "@/app/corretor/actions";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { createClient } from "@/lib/supabase/server";
import { SECOES_DOS_TERMOS, TERMOS_SAO_RASCUNHO, VERSAO_DOS_TERMOS } from "@/lib/termos/termos";
import { FormularioAceite } from "./FormularioAceite";

export const metadata: Metadata = {
  title: "Termos de uso",
  robots: { index: false, follow: false },
};

/**
 * Os termos de uso do painel (fase 2D, 0198).
 *
 * Fora do grupo `(painel)` de propósito: o layout do painel manda para cá
 * quem ainda não aceitou a versão vigente, e dentro dele esta página se
 * redirecionaria para si mesma. A sessão continua exigida (`proxy.ts`).
 * Quem já aceitou também pode abrir a página para reler o texto.
 */
export default async function TermosPage() {
  const corretor = await getCorretorLogado();
  if (!corretor) redirect("/corretor/entrar");

  const supabase = await createClient();
  const { data: aceite } = await supabase
    .from("aceites_de_termos")
    .select("aceito_em")
    .eq("corretor_id", corretor.id)
    .eq("versao", VERSAO_DOS_TERMOS)
    .maybeSingle();

  const aceitoEm = aceite?.aceito_em
    ? new Date(aceite.aceito_em).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      })
    : null;

  return (
    <main className="bg-fundo flex min-h-svh justify-center px-4 py-10">
      <div className="border-linha bg-superficie shadow-painel-alto w-full max-w-2xl rounded-2xl border p-6 sm:p-8">
        <p className="text-fluid-xs text-tenue tracking-wide uppercase">Painel de corretores</p>
        <h1 className="text-fluid-xl text-titulo mt-1 font-medium">Termos de uso</h1>
        <p className="text-fluid-sm text-apoio mt-2">
          {aceitoEm
            ? `Você aceitou esta versão em ${aceitoEm}.`
            : `Olá, ${corretor.nome.split(" ")[0]}. Antes de usar o painel, leia os termos abaixo. Leva uns três minutos.`}
        </p>

        {TERMOS_SAO_RASCUNHO && (
          <p className="border-alerta-linha bg-alerta-lavado text-fluid-sm text-corpo mt-4 rounded-xl border px-4 py-3">
            Rascunho: este texto ainda vai ser revisado por um advogado. Quando mudar, o painel pede um novo aceite.
          </p>
        )}

        <div className="mt-6 space-y-6">
          {SECOES_DOS_TERMOS.map((secao) => (
            <section key={secao.titulo}>
              <h2 className="text-fluid-base text-titulo font-medium">{secao.titulo}</h2>
              <div className="mt-2 space-y-2">
                {secao.paragrafos.map((paragrafo) => (
                  <p key={paragrafo} className="text-fluid-sm text-corpo break-words">
                    {paragrafo}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="text-fluid-xs text-tenue mt-6">Versão {VERSAO_DOS_TERMOS}</p>

        <div className="mt-6 space-y-3">
          {aceitoEm ? (
            <Link
              href="/corretor"
              className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-base flex min-h-11 w-full items-center justify-center rounded-full px-7 py-3.5 font-semibold transition-colors"
            >
              Voltar ao painel
            </Link>
          ) : (
            <FormularioAceite />
          )}
          <form action={sair} data-sair>
            <button
              type="submit"
              className="botao-secundario text-fluid-sm text-corpo min-h-11 w-full rounded-full px-7 py-3"
            >
              {aceitoEm ? "Sair" : "Agora não, sair do painel"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
