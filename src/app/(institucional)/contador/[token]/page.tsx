import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CabecalhoDePagina } from "@/components/institucional/CabecalhoDePagina";
import { Pagina } from "@/components/institucional/Pagina";
import { Secao } from "@/components/institucional/Secao";
import { lerAcessoContador, registrarAcessoDoContador } from "@/lib/financeiro/acessoContador";
import { nomeDoMes } from "@/lib/financeiro/periodo";
import { formatarReais } from "@/lib/financeiro/venda";
import { site } from "@/lib/site";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata: Metadata = {
  title: "Contabilidade",
  robots: { index: false, follow: false },
};

const dataBr = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

/**
 * A página do contador (0168): os meses que o dono fechou, cada um com a
 * planilha do mês. Abre só pelo link; nada de login.
 */
export default async function ContadorPublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const acesso = await lerAcessoContador(token);
  if (!acesso) notFound();
  await registrarAcessoDoContador(acesso.token);

  const { data } = await createServiceClient()
    .from("meses_fechados")
    .select("mes, fechado_em, totais")
    .order("mes", { ascending: false })
    .limit(60);
  const meses = (data ?? []).map((m) => ({
    mes: m.mes.slice(0, 7),
    fechadoEm: m.fechado_em,
    resultado: typeof (m.totais as { resultado?: unknown })?.resultado === "number" ? ((m.totais as { resultado: number }).resultado) : null,
  }));

  return (
    <Pagina>
      <Secao espaco="abertura">
        <CabecalhoDePagina
          rotulo={acesso.nome}
          titulo={`Contabilidade da ${site.nome}`}
          lead="Os meses fechados pela imobiliária, cada um numa planilha: resumo do mês, entradas e saídas, impostos estimados, RPA dos corretores e notas fiscais das comissões."
        />
      </Secao>
      <Secao espaco="final">
        {meses.length === 0 ? (
          <p className="cartao text-fluid-base text-corpo p-5">Nenhum mês foi fechado ainda. Assim que a imobiliária fechar, ele aparece aqui.</p>
        ) : (
          <ul className="cartao divide-linha divide-y p-2 sm:p-4">
            {meses.map((m) => (
              <li key={m.mes} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-fluid-base text-titulo font-medium">
                    {nomeDoMes(`${m.mes}-01`)} {m.mes.slice(0, 4)}
                  </p>
                  <p className="text-fluid-sm text-apoio">
                    Fechado em {dataBr(m.fechadoEm)}
                    {m.resultado !== null ? ` · resultado ${formatarReais(m.resultado)}` : ""}
                  </p>
                </div>
                <a
                  href={`/contador/${acesso.token}/baixar?mes=${m.mes}`}
                  className="text-fluid-sm bg-acento text-sobre-cor inline-flex min-h-11 items-center rounded-xl px-5 font-medium"
                >
                  Baixar planilha
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="text-fluid-sm text-tenue mt-4">
          Os impostos da planilha são estimativas da imobiliária para planejamento; a apuração é sua. Mês reaberto sai desta lista até ser fechado de
          novo.
        </p>
      </Secao>
    </Pagina>
  );
}
