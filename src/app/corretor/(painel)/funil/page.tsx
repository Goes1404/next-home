import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Quadro } from "./Quadro";
import { COOKIE_MODO_DO_FUNIL, lerModoDoFunil } from "./modoDoFunil";
import { BuscaLeads } from "@/app/corretor/(painel)/_componentes/BuscaLeads";
import { getContagemPorEtapa, getLeadsDoFunil } from "@/lib/corretorSessao";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";
import { BotaoVoltarAoTopo } from "@/app/corretor/(painel)/_componentes/BotaoVoltarAoTopo";
import { PassagemDoFunil } from "@/app/corretor/(painel)/_componentes/graficos/PassagemDoFunil";

export const metadata: Metadata = { title: "Funil" };

export default async function FunilPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const buscaParam = params.busca;
  const busca = (Array.isArray(buscaParam) ? buscaParam[0] : buscaParam) ?? "";

  // O funil é o trabalho de quem abriu o painel, também do gestor (hotfix de
  // 19/10/2026): a RLS dele abre a equipe inteira, e o quadro virava a
  // carteira de todo mundo. A visão da equipe mora na Administração. A
  // contagem vem à parte porque o quadro tem teto (`TETO_DO_QUADRO`): o
  // cabeçalho da coluna mostra o total real mesmo quando nem todo cartão coube.
  const [leads, contagens, jarra] = await Promise.all([
    getLeadsDoFunil(busca),
    getContagemPorEtapa(),
    cookies(),
  ]);
  const modo = lerModoDoFunil(jarra.get(COOKIE_MODO_DO_FUNIL)?.value);

  return (
    <div>
      <CabecalhoDeTela
        titulo="Funil"
        descricao="Seus contatos, da chegada ao fechamento."
      />

      <BuscaLeads className="mt-5" />

      {busca && (
        <p className="text-fluid-xs text-apoio mt-3">
          {leads.length === 0
            ? `Ninguém no funil com “${busca}”.`
            : `${leads.length} resultado${leads.length === 1 ? "" : "s"} para “${busca}”. Os números dos grupos continuam sendo o total real.`}
        </p>
      )}

      {/* Com busca ativa as contagens do banco não descrevem o que está na
          tela: passá-las adiante faria a coluna dizer "12" com um cartão
          visível. Sem elas, o cabeçalho conta o que se vê. */}
      <Quadro
        leads={leads}
        contagens={busca ? undefined : contagens}
        mostrarDono={false}
        modoInicial={modo}
      />

      {/* Embaixo do quadro: o quadro é o trabalho, este é o balanço dele. Com
          busca ativa as contagens não descrevem a tela, então ele some. */}
      {!busca && (
        <div className="mt-8">
          <PassagemDoFunil contagens={contagens} />
        </div>
      )}

      <BotaoVoltarAoTopo />
    </div>
  );
}
