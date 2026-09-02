import type { Metadata } from "next";
import { Quadro } from "./Quadro";
import { AbasLeads } from "@/app/corretor/(painel)/_componentes/AbasLeads";
import { BuscaLeads } from "@/app/corretor/(painel)/_componentes/BuscaLeads";
import { getContagemPorEtapa, getLeadsDoFunil, souGestor } from "@/lib/corretorSessao";
import { CabecalhoDeTela } from "@/app/corretor/(painel)/_componentes/CabecalhoDeTela";

export const metadata: Metadata = { title: "Funil" };

export default async function FunilPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const buscaParam = params.busca;
  const busca = (Array.isArray(buscaParam) ? buscaParam[0] : buscaParam) ?? "";

  // Uma consulta só serve os dois papéis: a policy da 0007 decide se "os
  // meus leads" são os do corretor ou os da imobiliária inteira. A contagem
  // vem à parte porque o quadro tem teto (`TETO_DO_QUADRO`): o cabeçalho da
  // coluna mostra o total real mesmo quando nem todo cartão coube.
  const [leads, contagens, gestor] = await Promise.all([
    getLeadsDoFunil(busca),
    getContagemPorEtapa(),
    souGestor(),
  ]);

  return (
    <div>
      <CabecalhoDeTela
        titulo="Funil"
        descricao={
          gestor
            ? "Todos os contatos da equipe, da chegada ao fechamento."
            : "Seus contatos, da chegada ao fechamento."
        }
      />

      <BuscaLeads className="mt-5" />
      <div className="mt-3">
        <AbasLeads ativa="funil" />
      </div>

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
        mostrarDono={gestor}
      />
    </div>
  );
}
