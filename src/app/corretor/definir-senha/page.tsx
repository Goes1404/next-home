import type { Metadata, Viewport } from "next";
import { COR_DA_BARRA_DO_ACESSO } from "../ComportamentoDeApp";
import { redirect } from "next/navigation";
import { DESTINO_SEM_LINK, sessaoAbertaPorLink } from "@/lib/auth/sessaoPorLink";
import { createClient } from "@/lib/supabase/server";
import { FormularioDefinirSenha } from "./FormularioDefinirSenha";
import { TelaDeAcesso } from "../TelaDeAcesso";

export const metadata: Metadata = {
  title: { absolute: "Criar senha · Astro Soluções" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: COR_DA_BARRA_DO_ACESSO };

/**
 * Onde cai quem abriu o link do convite ou da recuperação de senha: o
 * `/auth/confirmar` já abriu a sessão, falta só escolher a senha.
 *
 * Fora do grupo `(painel)` de propósito: o menu e as faixas do painel não
 * servem a quem ainda nem tem senha. A sessão continua exigida (o
 * `proxy.ts` barra `/corretor/*` sem ela) — sem o link aberto não há o que
 * definir. E só a sessão que o link abriu há menos de 15 minutos
 * (`sessaoAbertaPorLink`): as outras vão para `/corretor/senha`.
 */
export default async function DefinirSenhaPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email : null;
  if (!data?.claims?.sub) redirect("/corretor/entrar");
  // A mesma régua da action: só a sessão que o link abriu há pouco cria
  // senha sem a atual. As outras vão para a troca que pede a atual.
  if (!sessaoAbertaPorLink(data.claims)) redirect(DESTINO_SEM_LINK);

  return (
    <TelaDeAcesso
      titulo="Crie sua senha"
      apoio={
        email ? (
          <span className="break-words">
            Esta será a senha de <strong className="font-semibold">{email}</strong>.
          </span>
        ) : (
          "Esta será a sua senha para entrar no CRM."
        )
      }
      chamada="Bem-vindo à Astro."
      textoDaChamada="Crie sua senha e comece a atender seus leads."
    >
      <FormularioDefinirSenha />
    </TelaDeAcesso>
  );
}
