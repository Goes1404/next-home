import { site } from "@/lib/site";
import type { Metadata } from "next";
import Link from "next/link";
import { EditorAvatar } from "./EditorAvatar";
import { FormularioPerfil } from "./FormularioPerfil";
import { FundoLink } from "./FundoLink";
import { AjustesDoResumo } from "./AjustesDoResumo";
import { CaixaDoGmail } from "./CaixaDoGmail";
import { createServiceClient } from "@/lib/supabase/service";
import { gmailConfigurado } from "@/lib/inbound/gmailCaixa";
import { createClient } from "@/lib/supabase/server";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";

export const metadata: Metadata = { title: "Meu perfil" };

export default async function PerfilPage({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
  const { gmail: volta } = await searchParams;
  const corretor = await getCorretorLogado();
  if (!corretor) return null;
  // A caixa do Gmail (0125) só o servidor lê: o refresh token nunca sai daqui.
  const { data: contaGmail } = await createServiceClient()
    .from("contas_email_google")
    .select("email, ultima_leitura_em, ultimo_erro, lidos_total")
    .eq("corretor_id", corretor.id)
    .maybeSingle();
  const supabase = await createClient();
  const { data: prefs } = await supabase
    .from("corretores")
    .select("resumo_hora, resumo_fim_de_semana")
    .eq("id", corretor.id)
    .maybeSingle();

  return (
    // Formulário se cansa de ler antes de o painel acabar: campo de texto
    // largo demais é tão ruim quanto estreito demais.
    <div className="max-w-2xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <CabecalhoDeTela secao="Conta" titulo="Meu perfil" descricao={<>O que o cliente vê na sua{" "}
            <Link
              href={`/corretores/${corretor.slug}`}
              className="text-acento-suave underline-offset-4 hover:underline"
            >
              página pública
            </Link>
            .</>} />
        </div>
        {/* Senha saiu do menu (roadmap: 7 destinos — "Conta" cobre as duas). */}
        <Link
          href="/corretor/senha"
          className="text-fluid-sm border-linha-forte text-corpo hover:border-acento-linha hover:text-titulo inline-flex min-h-10 items-center rounded-full border px-4 transition-colors"
        >
          Alterar senha
        </Link>
      </div>

      <div className="border-acento-linha bg-superficie shadow-painel mt-8 rounded-2xl border p-5">
        <EditorAvatar nome={corretor.nome} fotoUrl={corretor.fotoUrl} />
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-acento-lavado border border-acento-linha px-2.5 py-0.5 text-fluid-xs font-semibold text-acento-suave">
            CRECI {corretor.creci}
          </span>
          <span className="rounded-full bg-ok-lavado border border-ok-linha px-2.5 py-0.5 text-fluid-xs font-medium text-ok">
            Perfil Público Ativo
          </span>
        </div>
        <p className="text-fluid-xs mt-2 text-apoio">
          O CRECI é gerenciado pela administração da {site.nome}.
        </p>
      </div>

      <div className="cartao mt-6 p-6 sm:p-7">
        <FundoLink fundoTipo={corretor.fundoTipo} />
      </div>

      <div className="cartao mt-6 p-6 sm:p-7">
        <FormularioPerfil corretor={corretor} />
      </div>

      <div className="cartao mt-6 p-6 sm:p-7">
        <CaixaDoGmail
          configurado={gmailConfigurado()}
          volta={volta ?? null}
          conta={
            contaGmail
              ? {
                  email: contaGmail.email,
                  ultimaLeitura: contaGmail.ultima_leitura_em,
                  erro: contaGmail.ultimo_erro,
                  lidos: contaGmail.lidos_total,
                }
              : null
          }
        />
      </div>

      <div className="cartao mt-6 p-6 sm:p-7">
        <AjustesDoResumo hora={prefs?.resumo_hora ?? 8} fimDeSemana={prefs?.resumo_fim_de_semana ?? false} />
      </div>
    </div>
  );
}
