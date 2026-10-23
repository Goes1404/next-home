import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cadastroEstaPendente } from "@/lib/corretores/cadastroPendente";
import { createClient } from "@/lib/supabase/server";
import { FormularioCompletarCadastro } from "./FormularioCompletarCadastro";

export const metadata: Metadata = { title: "Completar cadastro", robots: { index: false, follow: false } };

export default async function CompletarCadastroPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) redirect("/corretor/entrar");
  const { data: ficha } = await supabase.from("corretores").select("creci").eq("user_id", userId).maybeSingle();
  if (!ficha || !cadastroEstaPendente(ficha.creci)) redirect("/corretor");

  return (
    <main className="bg-fundo flex min-h-svh items-center justify-center px-5 py-10">
      <div className="border-linha bg-superficie shadow-painel-alto w-full max-w-sm rounded-2xl border p-6 sm:p-7">
        <h1 className="text-fluid-xl text-titulo font-medium">Complete seu cadastro</h1>
        <p className="text-fluid-sm text-apoio mt-1 mb-6">Antes de acessar o painel, informe seus dados profissionais.</p>
        <FormularioCompletarCadastro />
      </div>
    </main>
  );
}
