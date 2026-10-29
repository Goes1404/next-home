import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sair } from "@/app/corretor/actions";
import { getCorretorLogado } from "@/lib/corretorSessao";
import { MARCA_DA_PLATAFORMA } from "@/lib/marcaDaPlataforma";
import { ROTULO_DO_PLANO } from "@/lib/plataforma/rotulosDoGrupo";
import { createServiceClient } from "@/lib/supabase/service";
import {
  SECOES_DO_TERMO_DE_ADESAO,
  TERMO_DE_ADESAO_E_RASCUNHO,
  VERSAO_DO_TERMO_DE_ADESAO,
} from "@/lib/termos/termoDeAdesao";
import { BotaoImprimir, FormularioAceiteDoTermo } from "./FormularioAceiteDoTermo";

export const metadata: Metadata = {
  title: "Termo de adesão",
  robots: { index: false, follow: false },
};

const DATA_E_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});
const REAL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O termo de adesão da conta (0247, 29/10/2026).
 *
 * Fora do grupo `(painel)` de propósito, como `/corretor/termos` (0198): o
 * layout do painel manda para cá o GESTOR cuja conta ainda não aceitou a
 * versão vigente, e dentro dele esta página se redirecionaria para si mesma.
 * A sessão continua exigida (`proxy.ts`). Qualquer pessoa da conta pode abrir
 * para ler e imprimir; só o gestor vê o formulário e os dados do aceite.
 *
 * Os dados da conta (razão social, documento, plano, mensalidade e
 * vencimento) e o aceite são lidos pela chave de serviço, DEPOIS da sessão,
 * só na linha do grupo da sessão: as colunas de cobrança não têm grant para
 * o logado (0207, 0241). Imprimível: o navegador salva em PDF, e os botões
 * somem na impressão (`print:hidden`).
 */
export default async function TermoDeAdesaoPage() {
  const corretor = await getCorretorLogado();
  if (!corretor) redirect("/corretor/entrar");
  const ehGestor = corretor.papel === "gestor";

  const servico = createServiceClient();
  const [conta, aceite] = await Promise.all([
    servico
      .from("grupos")
      .select("nome, razao_social, documento, plano, mensalidade, dia_do_vencimento")
      .eq("id", corretor.grupoId)
      .maybeSingle(),
    ehGestor
      ? servico
          .from("aceites_do_termo_de_adesao")
          .select("aceito_em, nome_no_aceite")
          .eq("grupo_id", corretor.grupoId)
          .eq("versao", VERSAO_DO_TERMO_DE_ADESAO)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (conta.error) console.error(`[termo de adesão] conta ${corretor.grupoId} não lida: ${conta.error.message}`);
  if (aceite.error) console.error(`[termo de adesão] aceite de ${corretor.grupoId} não lido: ${aceite.error.message}`);

  const dados = conta.data;
  const aceitoEm = aceite.data?.aceito_em ? DATA_E_HORA.format(new Date(aceite.data.aceito_em)) : null;
  const plano = dados?.plano ? ROTULO_DO_PLANO[dados.plano] : "conforme a contratação";
  const mensalidade =
    dados?.plano === "custo"
      ? "não cobrada"
      : dados?.mensalidade !== null && dados?.mensalidade !== undefined
        ? REAL.format(Number(dados.mensalidade))
        : "conforme a contratação";

  return (
    <main className="bg-fundo flex min-h-svh justify-center px-4 py-10 print:bg-white print:p-0">
      <div className="border-linha bg-superficie shadow-painel-alto w-full max-w-3xl rounded-2xl border p-6 sm:p-8 print:max-w-none print:border-0 print:shadow-none">
        <p className="text-fluid-xs text-tenue tracking-wide uppercase">{MARCA_DA_PLATAFORMA.nome}</p>
        <h1 className="text-fluid-xl text-titulo mt-1 font-medium">Termo de adesão ao CRM</h1>
        <p className="text-fluid-sm text-apoio mt-2 print:hidden">
          {!ehGestor
            ? "Este é o contrato da sua conta com a Astro. Quem aceita é o gestor; você pode ler e imprimir."
            : aceitoEm
              ? `A conta aceitou esta versão em ${aceitoEm}, por ${aceite.data?.nome_no_aceite ?? "um gestor"}.`
              : `Olá, ${corretor.nome.split(" ")[0]}. Antes de usar o painel, leia e aceite o termo de adesão da sua conta. É uma vez só por versão.`}
        </p>

        {TERMO_DE_ADESAO_E_RASCUNHO && (
          <p className="border-alerta-linha bg-alerta-lavado text-fluid-sm text-corpo mt-4 rounded-xl border px-4 py-3">
            Rascunho: este texto ainda será revisado pelo advogado da Astro. Quando mudar, o painel pede um novo aceite.
          </p>
        )}

        <dl className="border-linha text-fluid-sm mt-6 grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border p-4 sm:grid-cols-2">
          <div>
            <dt className="text-apoio text-fluid-xs">Contratante</dt>
            <dd className="text-titulo break-words">{dados?.razao_social || dados?.nome || "—"}</dd>
          </div>
          <div>
            <dt className="text-apoio text-fluid-xs">CPF/CNPJ</dt>
            <dd className="text-titulo">{dados?.documento || "não informado"}</dd>
          </div>
          <div>
            <dt className="text-apoio text-fluid-xs">Plano</dt>
            <dd className="text-titulo">{plano}</dd>
          </div>
          <div>
            <dt className="text-apoio text-fluid-xs">Mensalidade</dt>
            <dd className="text-titulo">
              {mensalidade}
              {dados?.dia_do_vencimento && dados.plano !== "custo" ? `, vence todo dia ${dados.dia_do_vencimento}` : ""}
            </dd>
          </div>
        </dl>

        <div className="mt-6 space-y-6">
          {SECOES_DO_TERMO_DE_ADESAO.map((secao) => (
            <section key={secao.titulo} className="break-inside-avoid-page">
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

        <p className="text-fluid-xs text-tenue mt-6">
          Versão {VERSAO_DO_TERMO_DE_ADESAO}
          {aceitoEm ? ` · aceita em ${aceitoEm} por ${aceite.data?.nome_no_aceite ?? "um gestor"}` : ""}
        </p>

        <div className="mt-6 space-y-3">
          {ehGestor && !aceitoEm ? (
            <FormularioAceiteDoTermo />
          ) : (
            <Link
              href="/corretor"
              className="bg-acento text-sobre-cor hover:bg-acento-hover text-fluid-base flex min-h-11 w-full items-center justify-center rounded-full px-7 py-3.5 font-semibold transition-colors print:hidden"
            >
              Voltar ao painel
            </Link>
          )}
          <BotaoImprimir />
          <form action={sair} data-sair className="print:hidden">
            <button
              type="submit"
              className="botao-secundario text-fluid-sm text-corpo min-h-11 w-full rounded-full px-7 py-3"
            >
              {ehGestor && !aceitoEm ? "Agora não, sair do painel" : "Sair"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
